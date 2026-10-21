// Leve agent: a nutrition chat backed by Claude. The user's data comes in the request body
// (the app already holds it), and the agent can propose a full diet through the `propor_dieta` tool.
// The proposal goes back to the app, which only applies it when the user taps "Usar esta dieta".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `Você é o Agente Leve, assistente de nutrição de um app brasileiro de emagrecimento. Fale em português do Brasil, de forma direta, acolhedora e sem culpa.

Faça o que a pessoa pede. Se ela pedir para montar uma dieta, monte de verdade usando os dados dela (sexo, idade, altura, peso, atividade, ritmo de perda, o que ela já come e as preferências que disser) e entregue chamando a ferramenta propor_dieta — não descreva a dieta só em texto e não peça confirmação antes de propor. Se faltar um dado essencial, use os do perfil e diga qual suposição fez.

Regras para dietas e sugestões:
- Porções realistas e comuns no Brasil, em gramas ou medidas caseiras. Nada de exageros: no máximo 2 fatias de pão, 2 a 3 ovos, 1 a 2 frutas por refeição; carboidrato do almoço até ~200 g cozido; proteína até ~200 g por refeição.
- Metas: calcule o gasto com Mifflin-St Jeor × fator de atividade e aplique um déficit coerente com o ritmo pedido. Nunca abaixo de 1.500 kcal para homens ou 1.200 kcal para mulheres. Proteína entre 1,6 e 2,0 g/kg, fibra 25–35 g.
- As kcal das refeições devem somar perto da meta diária. Use os ids de refeição: cafe, lanche1, almoco, lanche2, jantar.
- Inclua 1 a 3 substituições permitidas por refeição.
- Quando não houver ferramenta para o que foi pedido (por exemplo, registrar uma refeição), explique como fazer no app.

Você não é médico. Para condições de saúde, gestação, uso de medicação ou transtornos alimentares, recomende acompanhamento profissional. A pessoa aplica a dieta proposta tocando em "Usar esta dieta"; nada muda sem ela.

Formato: texto simples, sem títulos nem tabelas markdown; listas curtas com "•" quando ajudar. Seja breve no texto quando já tiver enviado a dieta pela ferramenta.`;

const MEAL_IDS = ["cafe", "lanche1", "almoco", "lanche2", "jantar"];

const TOOLS = [{
  name: "propor_dieta",
  description: "Envia ao app uma dieta completa (metas diárias e refeições) montada para a pessoa. O app mostra a proposta com um botão para ela aplicar. Use sempre que ela pedir para montar, criar, ajustar ou refazer a dieta.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["resumo", "metas", "refeicoes"],
    properties: {
      resumo: { type: "string", description: "1–2 frases explicando a lógica da dieta." },
      metas: {
        type: "object",
        additionalProperties: false,
        required: ["kcal", "p", "c", "g", "f"],
        properties: {
          kcal: { type: "integer", description: "Calorias diárias" },
          p: { type: "integer", description: "Proteína (g)" },
          c: { type: "integer", description: "Carboidrato (g)" },
          g: { type: "integer", description: "Gordura (g)" },
          f: { type: "integer", description: "Fibra (g)" },
        },
      },
      refeicoes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "nome", "horario", "kcal", "itens", "substituicoes"],
          properties: {
            id: { type: "string", enum: MEAL_IDS },
            nome: { type: "string" },
            horario: { type: "string", description: "HH:MM" },
            kcal: { type: "integer" },
            itens: { type: "array", items: { type: "string" }, description: "Alimento e porção, ex.: '2 ovos mexidos'" },
            substituicoes: { type: "array", items: { type: "string" }, description: "Ex.: 'Pão ↔ 2 col. de tapioca'" },
          },
        },
      },
    },
  },
}];

interface ChatMsg { from: "user" | "agent"; text: string }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "missing_key" }, 500);

  let body: { messages?: ChatMsg[]; context?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const history = (body.messages ?? []).filter(m => m && typeof m.text === "string" && m.text.trim()).slice(-20);
  if (!history.length || history[history.length - 1].from !== "user") return json({ error: "no_question" }, 400);

  // Claude needs the conversation to start with a user turn; same-role neighbours are merged by the API.
  while (history.length && history[0].from !== "user") history.shift();
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) => ({
    role: m.from === "user" ? "user" : "assistant",
    content: i === history.length - 1
      ? `Dados atuais da pessoa (do app, JSON):\n${JSON.stringify(body.context ?? {})}\n\nMensagem:\n${m.text}`
      : m.text,
  }));

  const client = new Anthropic({ apiKey });
  let diet: unknown = null;
  let text = "";

  try {
    for (let turn = 0; turn < 3; turn++) {
      const res = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        system: SYSTEM,
        tools: TOOLS,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages,
      } as Anthropic.Beta.MessageCreateParamsNonStreaming);

      if (res.stop_reason === "refusal") {
        return json({ text: "Não consigo ajudar com isso. Posso montar sua dieta, sugerir refeições ou analisar sua semana." });
      }
      text += res.content.filter(b => b.type === "text").map(b => (b as { text: string }).text).join("");

      const calls = res.content.filter(b => b.type === "tool_use") as Anthropic.Beta.BetaToolUseBlock[];
      if (res.stop_reason !== "tool_use" || !calls.length) break;

      // pass the assistant turn back unchanged (thinking blocks included), then answer every tool call
      messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
      messages.push({
        role: "user",
        content: calls.map(c => {
          if (c.name === "propor_dieta") diet = c.input;
          return {
            type: "tool_result" as const,
            tool_use_id: c.id,
            content: c.name === "propor_dieta"
              ? "Proposta enviada ao app com o botão 'Usar esta dieta'. Agora escreva uma mensagem curta apresentando a dieta (sem repetir todos os itens)."
              : "Ferramenta desconhecida.",
            is_error: c.name !== "propor_dieta",
          };
        }),
      });
    }
  } catch (err) {
    console.error(err);
    const status = err instanceof Anthropic.APIError ? err.status : 0;
    return json({ error: status === 401 ? "bad_key" : status === 429 ? "rate_limited" : "upstream" }, 502);
  }

  return json({ text: text.trim() || (diet ? "Montei sua dieta. Confira abaixo e toque em \"Usar esta dieta\" para aplicar." : "Pode repetir? Não consegui formular a resposta."), diet });
});
