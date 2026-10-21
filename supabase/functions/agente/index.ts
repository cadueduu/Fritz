// Leve agent on Google Gemini (free tier). The app sends the conversation plus a summary of the
// user's data. Before a diet the agent runs an anamnesis, noting answers with salvar_anamnese (the
// app saves those to the profile); diet, meal, weight and water proposals only take effect when
// the user taps the confirm button in the app.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
Quando tiver o suficiente — ou se a pessoa pedir para montar logo —, diga em uma frase o que vai considerar e chame propor_dieta. Use a anamnese de verdade: intestino preso → mais fibra, água e frutas laxativas; sono ruim → evitar cafeína à noite e jantar pesado; gastrite/refluxo → evitar irritantes e refeições volumosas à noite; diabetes → carboidratos de baixo índice glicêmico e bem distribuídos; treino → refeição com carboidrato e proteína perto do horário.

Outras ações (use as ferramentas sem pedir confirmação; o app mostra um botão):
• "Comi…", "almocei…", "jantei…" → registrar_refeicao, uma por refeição, estimando porções, kcal e macros pela tabela TACO. Sem quantidade, assuma uma porção comum e diga qual.
• "Pesei…", "estou com X kg" → registrar_peso.
• "Bebi X copos/ml de água" → registrar_agua com o TOTAL do dia (some ao já registrado; 1 copo = 250 ml; máximo 8).
• Análise da semana ou do progresso → responda com os números reais: média de kcal vs meta, dias acima da meta, proteína média, refeições fora do plano, tendência de peso, e 2 ou 3 ajustes práticos.

Regras para dietas:
• Metas pelo objetivo: Mifflin-St Jeor × fator de atividade. Emagrecer: déficit pelo ritmo escolhido. Cutting: déficit pelo ritmo e proteína 2,2 g/kg. Bulking: excedente de 250–400 kcal e proteína 2,0 g/kg. Recomposição: déficit leve (~250 kcal) e proteína 2,0 g/kg. Manter: no gasto. Nunca abaixo de 1.500 kcal (homens) ou 1.200 kcal (mulheres). Fibra 25–35 g. As kcal das refeições devem somar perto da meta.
• Porções realistas e comuns no Brasil: no máximo 2 fatias de pão, 2 a 3 ovos e 1 a 2 frutas por refeição; carboidrato do almoço até ~200 g cozido (no bulking pode passar um pouco); proteína até ~200 g por refeição.
• Use os horários de rotina.horarios_das_refeicoes. Respeite restrições, alergias e o que a pessoa não gosta. Inclua 1 a 3 substituições por refeição.

Você não é médico. Diante de doenças, medicamentos, gestação, sinais de transtorno alimentar ou sintomas intestinais persistentes (sangue nas fezes, dor forte, emagrecimento sem querer), oriente procurar um profissional.

Formato: texto simples e curto, sem títulos nem tabelas markdown; use "•" para listas. Quando usar propor_dieta ou registrar_*, escreva só uma frase curta apresentando o que propôs.`;

const MEALS = ["cafe", "lanche1", "almoco", "lanche2", "jantar"];
const num = (description: string) => ({ type: "NUMBER", description });
const int = (description: string) => ({ type: "INTEGER", description });
const str = (description: string) => ({ type: "STRING", description });

const TOOLS = [{
  functionDeclarations: [
    {
      name: "propor_dieta",
      description: "Mostra à pessoa uma dieta completa (metas diárias e refeições) com o botão 'Usar esta dieta'.",
      parameters: {
        type: "OBJECT",
        required: ["resumo", "metas", "refeicoes"],
        properties: {
          resumo: str("1–2 frases com a lógica da dieta"),
          metas: {
            type: "OBJECT",
            required: ["kcal", "p", "c", "g", "f"],
            properties: { kcal: int("Calorias por dia"), p: int("Proteína g"), c: int("Carboidrato g"), g: int("Gordura g"), f: int("Fibra g") },
          },
          refeicoes: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              required: ["id", "nome", "horario", "kcal", "itens", "substituicoes"],
              properties: {
                id: { type: "STRING", enum: MEALS },
                nome: str("Ex.: Café da manhã"),
                horario: str("HH:MM"),
                kcal: int("kcal da refeição"),
                itens: { type: "ARRAY", items: { type: "STRING" }, description: "Alimento e porção, ex.: '2 ovos mexidos'" },
                substituicoes: { type: "ARRAY", items: { type: "STRING" }, description: "Ex.: 'Pão ↔ 2 col. de tapioca'" },
              },
            },
          },
        },
      },
    },
    {
      name: "salvar_anamnese",
      description: "Anota no perfil as respostas da pessoa na anamnese (um item por tema), para não perguntar de novo e usar ao montar a dieta.",
      parameters: {
        type: "OBJECT",
        required: ["itens"],
        properties: {
          itens: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
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
      parameters: {
        type: "OBJECT",
        required: ["refeicao", "descricao", "kcal", "p", "c", "g", "f"],
        properties: {
          refeicao: { type: "STRING", enum: [...MEALS, "extra"], description: "Refeição do plano, ou 'extra' se for fora do plano" },
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
      parameters: { type: "OBJECT", required: ["kg"], properties: { kg: num("Peso em kg"), data: str("YYYY-MM-DD; omita para hoje") } },
    },
    {
      name: "registrar_agua",
      description: "Mostra o total de água de hoje em copos de 250 ml com o botão 'Atualizar água'.",
      parameters: { type: "OBJECT", required: ["copos"], properties: { copos: int("Total de copos hoje, 0 a 8") } },
    },
  ],
}];

const ACTION_TYPE: Record<string, string> = { salvar_anamnese: "anamnese", propor_dieta: "dieta", registrar_refeicao: "refeicao", registrar_peso: "peso", registrar_agua: "agua" };

interface ChatMsg { from: "user" | "agent"; text: string }
interface Part { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; thought?: boolean }
interface Content { role: "user" | "model"; parts: Part[] }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "missing_key" }, 500);
  // free-tier models get overloaded (503) or hit per-model quotas (429); fall back down this list
  const models = [...new Set([Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest", "gemini-flash-lite-latest"])];

  let body: { messages?: ChatMsg[]; context?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const history = (body.messages ?? []).filter(m => m && typeof m.text === "string" && m.text.trim()).slice(-20);
  while (history.length && history[0].from !== "user") history.shift();
  if (!history.length || history[history.length - 1].from !== "user") return json({ error: "no_question" }, 400);

  const contents: Content[] = history.map((m, i) => ({
    role: m.from === "user" ? "user" : "model",
    parts: [{
      text: i === history.length - 1
        ? `Dados atuais da pessoa (JSON):\n${JSON.stringify(body.context ?? {})}\n\nMensagem:\n${m.text}`
        : m.text,
    }],
  }));

  const actions: { type: string; [k: string]: unknown }[] = [];
  let text = "";

  const call = async () => {
    let last = 0;
    while (models.length) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${models[0]}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents,
            tools: TOOLS,
            generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
          }),
        });
        if (res.ok) return { data: await res.json() };
        last = res.status;
        console.error(models[0], res.status, await res.text());
        if (res.status === 400 || res.status === 401 || res.status === 403) return { error: "bad_key" };
        if (res.status === 402) return { error: "no_credits" }; // billing project out of prepaid credits
        if (res.status !== 500 && res.status !== 503) break; // 404 / 429: this model won't work now, try the next
        await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
      }
      models.shift();
    }
    return { error: last === 429 ? "rate_limited" : "overloaded" };
  };

  for (let turn = 0; turn < 3; turn++) {
    const { data, error } = await call();
    if (error) return json({ error }, 502);
    const content: Content | undefined = data.candidates?.[0]?.content;
    if (!content?.parts?.length) {
      if (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason === "SAFETY") {
        return json({ text: "Não consigo ajudar com isso. Posso montar sua dieta, registrar refeições ou analisar sua semana.", actions: [] });
      }
      break;
    }
    text += content.parts.filter(p => p.text && !p.thought).map(p => p.text).join("");
    const calls = content.parts.filter(p => p.functionCall).map(p => p.functionCall!);
    if (!calls.length) break;

    calls.forEach(c => { if (ACTION_TYPE[c.name]) actions.push({ type: ACTION_TYPE[c.name], ...(c.args ?? {}) }); });
    // send the model turn back unchanged (it may carry thought signatures), then the function results
    contents.push(content);
    contents.push({
      role: "user",
      parts: calls.map(c => ({
        functionResponse: {
          name: c.name,
          response: ACTION_TYPE[c.name]
            ? (c.name === "salvar_anamnese"
              ? { ok: true, nota: "Anotado no perfil. Continue a conversa: comente brevemente a resposta, se útil, e faça as próximas perguntas ou monte a dieta se já tiver o suficiente." }
              : { ok: true, nota: "Mostrado à pessoa com um botão para confirmar. Escreva só uma frase curta apresentando o que propôs." })
            : { erro: "Ferramenta desconhecida" },
        },
      })) as Part[],
    });
  }

  return json({
    text: text.trim() || (actions.some(a => a.type !== "anamnese") ? "Preparei isso para você. Confira e toque para confirmar." : actions.length ? "Anotado. Pode seguir me contando." : "Pode repetir? Não consegui formular a resposta."),
    actions,
  });
});
