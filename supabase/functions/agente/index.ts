// Leve agent. The conversation runs on Google Gemini (free tier), falling back to Claude Haiku when
// Gemini is overloaded, out of quota or not configured. When the conversation decides to build a
// diet, the montar_dieta tool hands the person's data to Claude Sonnet, which writes the diet.
// The app sends the conversation plus a summary of the user's data. Anamnesis notes are saved to
// the profile by the app; diet, meal, weight and water proposals only take effect when the user
// taps the confirm button in the app.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@1.0.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CHAT_MODEL_FALLBACK = "claude-haiku-5-5";
const GEMINI_CALL_MS = 15_000;
const DIET_MODEL = "claude-sonnet-5-5";

const SYSTEM = `Você é o Agente Leve, assistente de nutrição de um app brasileiro. Fale em português do Brasil, de forma direta, acolhedora e sem culpa. Junto com cada mensagem você recebe os dados atuais da pessoa em JSON (perfil, objetivo, rotina, preferências, anamnese já respondida, metas, plano, registros, água e pesagens). Use esses dados de verdade: cite números, compare com as metas, aponte padrões.

ANTES DE MONTAR UMA DIETA, faça uma anamnese como um nutrólogo faria. Não monte a dieta na primeira mensagem: converse primeiro, com 1 a 3 perguntas curtas por mensagem (dê opções entre parênteses quando ajudar), e não repita o que já está nos dados ou em anamnese_ja_respondida. Cubra, na ordem que fizer sentido:
1. Objetivo em detalhe: emagrecer, cutting, bulking (ganhar massa), recomposição, manter, performance ou saúde; prazo; motivação; o que já tentou e o que funcionou ou não.
2. Saúde: doenças (diabetes, pressão, tireoide, colesterol, gastrite/refluxo, outras), cirurgias, exames recentes alterados, medicamentos e suplementos em uso. Para mulheres: ciclo menstrual, gestação ou amamentação.
3. Sono: horas por noite, qualidade, se acorda cansado.
4. Intestino: com que frequência evacua, consistência das fezes (ressecado, normal, mole), gases, inchaço, desconforto.
5. Hidratação, álcool (frequência e quantidade), cigarro.
6. Fome e comportamento: horários de mais fome, beliscos, doces, ansiedade ou compulsão, como come no fim de semana.
7. Treino: tipo (musculação, corrida, esporte), duração, intensidade, horário.
8. Logística: quem cozinha, tempo para cozinhar, se leva marmita, come fora, orçamento.
9. Alergias, intolerâncias e preferências que ainda não estejam nos dados.
Sempre que a pessoa responder algo da anamnese, chame salvar_anamnese com o tema e um resumo objetivo da resposta (ex.: tema "Intestino", resposta "evacua a cada 2 dias, fezes ressecadas, inchaço à tarde").
Quando tiver o suficiente — ou se a pessoa pedir para montar logo, ajustar ou refazer a dieta —, chame montar_dieta passando em "pedido" o que a pessoa quer e o que a dieta deve considerar além dos dados (ex.: "quer jantar mais leve, intestino preso, treina às 18h"). A dieta é montada por um especialista e aparece para a pessoa com o botão "Usar esta dieta".

Outras ações (use as ferramentas sem pedir confirmação; o app mostra um botão):
• "Comi…", "almocei…", "jantei…" → registrar_refeicao, uma por refeição, estimando porções, kcal e macros pela tabela TACO. Sem quantidade, assuma uma porção comum e diga qual.
• "Pesei…", "estou com X kg" → registrar_peso.
• "Bebi X copos/ml de água" → registrar_agua com o TOTAL do dia (some ao já registrado; 1 copo = 250 ml; máximo 8).
• Análise da semana ou do progresso → responda com os números reais: média de kcal vs meta, dias acima da meta, proteína média, refeições fora do plano, tendência de peso, e 2 ou 3 ajustes práticos.

Você não é médico. Diante de doenças, medicamentos, gestação, sinais de transtorno alimentar ou sintomas intestinais persistentes (sangue nas fezes, dor forte, emagrecimento sem querer), oriente procurar um profissional.

Formato: texto simples e curto, sem títulos nem tabelas markdown; use "•" para listas. Quando usar montar_dieta ou registrar_*, escreva só uma frase curta apresentando o que propôs.`;

const DIET_SYSTEM = `Você é um nutricionista brasileiro montando um plano alimentar para um app de emagrecimento. Você recebe os dados da pessoa em JSON (perfil, objetivo, rotina com horários das refeições, preferências, anamnese, registros recentes) e o pedido dela. Monte uma dieta de 5 refeições (cafe, lanche1, almoco, lanche2, jantar).

Regras:
• Metas pelo objetivo: Mifflin-St Jeor × fator de atividade (sedentário 1,2; leve 1,375; moderada 1,55; alta 1,725). Emagrecer: déficit pelo ritmo (≈1.100 kcal por kg/semana). Cutting: déficit pelo ritmo e proteína 2,2 g/kg. Bulking: excedente de 250–400 kcal e proteína 2,0 g/kg. Recomposição: déficit leve (~250 kcal) e proteína 2,0 g/kg. Manter: no gasto. Nunca abaixo de 1.500 kcal (homens) ou 1.200 kcal (mulheres). Fibra 25–35 g.
• A soma das kcal das refeições deve ficar a até 5% da meta diária, e os macros devem fechar com as kcal (4/4/9).
• Porções realistas e comuns no Brasil, em gramas ou medidas caseiras, com valores da tabela TACO: no máximo 2 fatias de pão, 2 a 3 ovos e 1 a 2 frutas por refeição; carboidrato do almoço até ~200 g cozido (no bulking pode passar um pouco); proteína até ~200 g por refeição.
• Use os horários de rotina.horarios_das_refeicoes. Respeite restrições, alergias e o que a pessoa não gosta. Se houver treino, ponha carboidrato e proteína perto do horário.
• Use a anamnese: intestino preso → mais fibra, água e frutas laxativas; sono ruim → sem cafeína à noite e jantar leve; gastrite/refluxo → evitar irritantes e refeições volumosas à noite; diabetes → carboidratos de baixo índice glicêmico e bem distribuídos.
• Inclua 1 a 3 substituições permitidas por refeição.
• Em "resumo", explique em 1–2 frases a lógica (meta, déficit/excedente e o que foi adaptado).`;

// Tool schemas in JSON Schema; converted for Gemini below.
const MEALS = ["cafe", "lanche1", "almoco", "lanche2", "jantar"];
type JSONSchema = Record<string, unknown>;
const num = (description: string) => ({ type: "number", description });
const int = (description: string) => ({ type: "integer", description });
const str = (description: string) => ({ type: "string", description });

const TOOLS: { name: string; description: string; input_schema: JSONSchema }[] = [
  {
    name: "montar_dieta",
    description: "Pede ao especialista uma dieta completa para a pessoa, usando todos os dados dela. Use quando ela pedir para montar, ajustar ou refazer a dieta, ou ao fim da anamnese.",
    input_schema: { type: "object", required: ["pedido"], properties: { pedido: str("O que a pessoa pediu e o que considerar além dos dados") } },
  },
  {
    name: "salvar_anamnese",
    description: "Anota no perfil as respostas da pessoa na anamnese (um item por tema), para não perguntar de novo e usar ao montar a dieta.",
    input_schema: {
      type: "object",
      required: ["itens"],
      properties: {
        itens: {
          type: "array",
          items: {
            type: "object",
            required: ["tema", "resposta"],
            properties: { tema: str("Ex.: Sono, Intestino, Saúde, Medicamentos, Treino, Álcool, Fome, Logística, Objetivo"), resposta: str("Resumo objetivo do que a pessoa respondeu") },
          },
        },
      },
    },
  },
  {
    name: "registrar_refeicao",
    description: "Mostra uma refeição que a pessoa disse ter comido, com kcal e macros estimados, e o botão 'Adicionar ao dia'.",
    input_schema: {
      type: "object",
      required: ["refeicao", "descricao", "kcal", "p", "c", "g", "f"],
      properties: {
        refeicao: { type: "string", enum: [...MEALS, "extra"], description: "Refeição do plano, ou 'extra' se for fora do plano" },
        data: str("YYYY-MM-DD; omita para hoje"),
        horario: str("HH:MM; omita para agora"),
        descricao: str("Itens e porções, ex.: '2 ovos mexidos, 1 fatia de pão integral'"),
        kcal: num("kcal total"), p: num("Proteína g"), c: num("Carboidrato g"), g: num("Gordura g"), f: num("Fibra g"),
      },
    },
  },
  {
    name: "registrar_peso",
    description: "Mostra uma pesagem com o botão 'Salvar pesagem'.",
    input_schema: { type: "object", required: ["kg"], properties: { kg: num("Peso em kg"), data: str("YYYY-MM-DD; omita para hoje") } },
  },
  {
    name: "registrar_agua",
    description: "Mostra o total de água de hoje em copos de 250 ml com o botão 'Atualizar água'.",
    input_schema: { type: "object", required: ["copos"], properties: { copos: int("Total de copos hoje, 0 a 8") } },
  },
];

/** Gemini's function-declaration schema: upper-case types, no additionalProperties. */
const toGemini = (s: unknown): unknown => {
  if (Array.isArray(s)) return s.map(toGemini);
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "additionalProperties") continue;
    out[k] = k === "type" && typeof v === "string" ? v.toUpperCase() : toGemini(v);
  }
  return out;
};
const GEMINI_TOOLS = [{ functionDeclarations: TOOLS.map(t => ({ name: t.name, description: t.description, parameters: toGemini(t.input_schema) })) }];

const DIET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "metas", "refeicoes"],
  properties: {
    resumo: { type: "string" },
    metas: {
      type: "object",
      additionalProperties: false,
      required: ["kcal", "p", "c", "g", "f"],
      properties: { kcal: { type: "integer" }, p: { type: "integer" }, c: { type: "integer" }, g: { type: "integer" }, f: { type: "integer" } },
    },
    refeicoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "nome", "horario", "kcal", "itens", "substituicoes"],
        properties: {
          id: { type: "string", enum: MEALS },
          nome: { type: "string" },
          horario: { type: "string" },
          kcal: { type: "integer" },
          itens: { type: "array", items: { type: "string" } },
          substituicoes: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const ACTION_TYPE: Record<string, string> = { salvar_anamnese: "anamnese", registrar_refeicao: "refeicao", registrar_peso: "peso", registrar_agua: "agua" };
const NOTE_PROPOSED = "Mostrado à pessoa com um botão para confirmar. Escreva só uma frase curta apresentando o que propôs.";
const NOTE_ANAMNESE = "Anotado no perfil. Continue a conversa: comente brevemente a resposta, se útil, e faça as próximas perguntas ou monte a dieta se já tiver o suficiente.";

interface ChatMsg { from: "user" | "agent"; text: string }
type Action = { type: string; [k: string]: unknown };
type Turn = { text: string; actions: Action[] };
class ChatError extends Error {}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!geminiKey && !anthropicKey) return json({ error: "missing_key" }, 500);
  const claude = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

  let body: { messages?: ChatMsg[]; context?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const history = (body.messages ?? []).filter(m => m && typeof m.text === "string" && m.text.trim()).slice(-20);
  while (history.length && history[0].from !== "user") history.shift();
  if (!history.length || history[history.length - 1].from !== "user") return json({ error: "no_question" }, 400);
  const context = JSON.stringify(body.context ?? {});
  const withContext = (m: ChatMsg, i: number) =>
    i === history.length - 1 ? `Dados atuais da pessoa (JSON):\n${context}\n\nMensagem:\n${m.text}` : m.text;

  /** Claude Sonnet writes the diet from the person's data; returns the action or throws. */
  const buildDiet = async (pedido: string): Promise<Action> => {
    if (!claude) throw new ChatError("missing_key");
    const conversa = history.slice(-10).map(m => `${m.from === "user" ? "Pessoa" : "Agente"}: ${m.text}`).join("\n");
    const res = await claude.beta.messages.create({
      model: DIET_MODEL,
      max_tokens: 16000,
      system: DIET_SYSTEM,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: DIET_SCHEMA } },
      messages: [{ role: "user", content: `Dados da pessoa (JSON):\n${context}\n\nConversa recente:\n${conversa}\n\nPedido: ${pedido || "montar a dieta"}` }],
    });
    if (res.stop_reason === "refusal") throw new ChatError("refusal");
    const text = res.content.filter(b => b.type === "text").map(b => (b as { text: string }).text).join("");
    return { type: "dieta", ...JSON.parse(text) };
  };

  /** Runs one tool call; returns what to tell the chat model and collects the action for the app. */
  const runTool = async (name: string, args: Record<string, unknown>, actions: Action[]) => {
    if (name === "montar_dieta") {
      try {
        actions.push(await buildDiet(String(args.pedido ?? "")));
        return { ok: true, nota: NOTE_PROPOSED };
      } catch (err) {
        console.error("diet", err);
        return { ok: false, erro: "Não foi possível montar a dieta agora. Peça desculpas e sugira tentar de novo em instantes." };
      }
    }
    if (!ACTION_TYPE[name]) return { erro: "Ferramenta desconhecida" };
    actions.push({ type: ACTION_TYPE[name], ...args });
    return { ok: true, nota: name === "salvar_anamnese" ? NOTE_ANAMNESE : NOTE_PROPOSED };
  };

  /** Conversation on Gemini; throws ChatError with a reason when it can't answer. */
  const chatGemini = async (): Promise<Turn> => {
    if (!geminiKey) throw new ChatError("missing_key");
    const models = [...new Set([Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest", "gemini-flash-lite-latest"])];
    // deno-lint-ignore no-explicit-any
    const contents: any[] = history.map((m, i) => ({ role: m.from === "user" ? "user" : "model", parts: [{ text: withContext(m, i) }] }));
    const actions: Action[] = [];
    let text = "";
    const call = async () => {
      let last = 0;
      for (const model of models) {
        let res: Response;
        try {
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
            // a call once hung until the platform killed the function at 150 s; past this Claude answers
            signal: AbortSignal.timeout(GEMINI_CALL_MS),
            body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, tools: GEMINI_TOOLS, generationConfig: { temperature: 0.4, maxOutputTokens: 8192 } }),
          });
          if (res.ok) return await res.json();
        } catch (err) {
          console.error("gemini", model, "no answer in", GEMINI_CALL_MS, "ms", err);
          throw new ChatError("overloaded");
        }
        last = res.status;
        console.error("gemini", model, res.status, await res.text());
        if (res.status === 400 || res.status === 401 || res.status === 403) throw new ChatError("bad_key");
        if (res.status === 402) throw new ChatError("no_credits");
        // overloaded: Claude answers now instead of waiting through retries
        if (res.status >= 500) throw new ChatError("overloaded");
        // 404 / 429: try the next model
      }
      throw new ChatError(last === 429 ? "rate_limited" : "overloaded");
    };
    for (let turn = 0; turn < 3; turn++) {
      const data = await call();
      const content = data.candidates?.[0]?.content;
      if (!content?.parts?.length) {
        if (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason === "SAFETY") {
          return { text: "Não consigo ajudar com isso. Posso montar sua dieta, registrar refeições ou analisar sua semana.", actions: [] };
        }
        break;
      }
      // deno-lint-ignore no-explicit-any
      const parts: any[] = content.parts;
      text += parts.filter(p => p.text && !p.thought).map(p => p.text).join("");
      const calls = parts.filter(p => p.functionCall).map(p => p.functionCall as { name: string; args?: Record<string, unknown> });
      if (!calls.length) break;
      // send the model turn back unchanged (it may carry thought signatures), then the function results
      contents.push(content);
      const results = [];
      for (const c of calls) results.push({ functionResponse: { name: c.name, response: await runTool(c.name, c.args ?? {}, actions) } });
      contents.push({ role: "user", parts: results });
    }
    return { text, actions };
  };

  /** Same conversation on Claude Haiku, used when Gemini can't answer. */
  const chatClaude = async (): Promise<Turn> => {
    if (!claude) throw new ChatError("missing_key");
    const messages: Anthropic.MessageParam[] = history.map((m, i) => ({ role: m.from === "user" ? "user" : "assistant", content: withContext(m, i) }));
    const actions: Action[] = [];
    let text = "";
    for (let turn = 0; turn < 4; turn++) {
      const res = await claude.messages.create({
        model: CHAT_MODEL_FALLBACK,
        max_tokens: 4096,
        system: SYSTEM,
        tools: TOOLS as Anthropic.Tool[],
        output_config: { effort: "low" },
        messages,
      });
      if (res.stop_reason === "refusal") return { text: "Não consigo ajudar com isso. Posso montar sua dieta, registrar refeições ou analisar sua semana.", actions };
      text += res.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
      const calls = res.content.filter(b => b.type === "tool_use") as Anthropic.ToolUseBlock[];
      if (res.stop_reason !== "tool_use" || !calls.length) break;
      // pass the assistant turn back unchanged (thinking blocks included), then answer every tool call in one message
      messages.push({ role: "assistant", content: res.content as Anthropic.ContentBlockParam[] });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const c of calls) results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(await runTool(c.name, c.input as Record<string, unknown>, actions)) });
      messages.push({ role: "user", content: results });
    }
    return { text, actions };
  };

  let turn: Turn;
  try {
    turn = await chatGemini();
  } catch (geminiErr) {
    console.error("gemini failed, trying claude", geminiErr instanceof Error ? geminiErr.message : geminiErr);
    try {
      turn = await chatClaude();
    } catch (claudeErr) {
      console.error("claude failed", claudeErr);
      // with no Claude key, Gemini's failure is the one worth reporting
      const reason = claudeErr instanceof ChatError && claudeErr.message === "missing_key" && geminiErr instanceof Error ? geminiErr.message
        : claudeErr instanceof ChatError ? claudeErr.message
        : claudeErr instanceof Anthropic.APIError ? (claudeErr.status === 401 ? "bad_key" : claudeErr.status === 429 ? "rate_limited" : "overloaded")
        : geminiErr instanceof Error ? geminiErr.message : "overloaded";
      return json({ error: reason }, 502);
    }
  }

  const { text, actions } = turn;
  return json({
    text: text.trim() || (actions.some(a => a.type !== "anamnese") ? "Preparei isso para você. Confira e toque para confirmar." : actions.length ? "Anotado. Pode seguir me contando." : "Pode repetir? Não consegui formular a resposta."),
    actions,
  });
});
