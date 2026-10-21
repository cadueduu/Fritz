// Meal analysis on Google Gemini (free tier). Given a photo of a plate (or a text description, or a
// single food name), returns each food with an estimated portion, a confidence and likely
// alternatives. The model picks foods from the TACO table and nutrition comes from the table itself;
// it only estimates values for foods TACO lacks. The app asks the user to check every item.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// The TACO table lives in the repo (src/data/taco.json, built by scripts/build-taco.mjs); load it once per instance.
type TacoRow = [number, string, string, number, number, number, number, number];
const TACO_URL = Deno.env.get("TACO_URL") || "https://raw.githubusercontent.com/cadueduu/fritz/main/src/data/taco.json";
let taco: Promise<TacoRow[]> | null = null;
const loadTaco = () =>
  (taco ??= fetch(TACO_URL).then((r): Promise<TacoRow[]> => (r.ok ? r.json() : Promise.reject(r.status))).catch(err => {
    console.error("TACO load failed", err);
    taco = null; // try again on the next request
    return [] as TacoRow[];
  }));

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const systemPrompt = (rows: TacoRow[]) => `Você é um nutricionista brasileiro que analisa refeições para um app de registro alimentar.
Identifique cada alimento separadamente (ex.: arroz, feijão, frango grelhado, salada, molho, bebida) e estime a quantidade em gramas pelo tamanho no prato, talheres e prato como referência. Para bebidas, use ml como gramas.
Dê valores nutricionais POR 100 g do alimento como preparado (cozido, grelhado, frito…), preferindo a tabela TACO; para produtos industrializados use rótulos típicos.
Para cada item, dê a confiança da identificação (0 a 100) e até 3 alternativas plausíveis caso a identificação esteja errada (ex.: frango grelhado → frango frito, peixe grelhado), também com valores por 100 g.
Inclua óleo/azeite/manteiga visível ou provável só se houver sinal claro. Não invente itens que não aparecem.
Se a imagem não for comida, devolva itens vazio e explique em "aviso".
Nomes em português do Brasil, curtos e específicos (ex.: "Arroz branco cozido", "Peito de frango grelhado").

${rows.length ? `Para cada item e cada alternativa, informe taco_id: o id do alimento mais próximo na tabela TACO abaixo, considerando o preparo (cozido, grelhado, frito, cru). Use 0 só se nenhum item da tabela servir (por exemplo, um produto industrializado específico); nesse caso os valores por 100 g que você der serão usados.

Tabela TACO (id: nome):
${rows.map(t => `${t[0]}: ${t[1]}`).join("\n")}` : "Use taco_id 0 em todos os itens."}`;

const NUTRI = {
  kcal: { type: "NUMBER", description: "kcal por 100 g" },
  p: { type: "NUMBER", description: "proteína g por 100 g" },
  c: { type: "NUMBER", description: "carboidrato g por 100 g" },
  g: { type: "NUMBER", description: "gordura g por 100 g" },
  f: { type: "NUMBER", description: "fibra g por 100 g" },
};

const SCHEMA = {
  type: "OBJECT",
  required: ["itens"],
  properties: {
    itens: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["nome", "taco_id", "gramas", "confianca", "kcal", "p", "c", "g", "f", "alternativas"],
        properties: {
          nome: { type: "STRING" },
          taco_id: { type: "INTEGER", description: "id na tabela TACO, ou 0" },
          gramas: { type: "NUMBER", description: "quantidade estimada em gramas" },
          confianca: { type: "INTEGER", description: "0 a 100" },
          ...NUTRI,
          alternativas: {
            type: "ARRAY",
            items: { type: "OBJECT", required: ["nome", "taco_id", "kcal", "p", "c", "g", "f"], properties: { nome: { type: "STRING" }, taco_id: { type: "INTEGER" }, ...NUTRI } },
          },
        },
      },
    },
    aviso: { type: "STRING", description: "Observação curta para a pessoa, se necessário" },
  },
};

type Food = { nome: string; taco_id?: number; kcal: number; p: number; c: number; g: number; f: number };

/** Uses the TACO values when the model matched a table entry; otherwise keeps its own estimate. */
const ground = <T extends Food>(byId: Map<number, TacoRow>, x: T) => {
  const t = byId.get(Number(x.taco_id));
  return t
    ? { ...x, taco_nome: t[1], fonte: "TACO", kcal: t[3], p: t[4], c: t[5], g: t[6], f: t[7] }
    : { ...x, taco_nome: null, fonte: "IA" };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "missing_key" }, 500);
  const models = [...new Set([Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash"])];

  let body: { imagem?: string; mime?: string; texto?: string; alimento?: string; refeicao?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const rows = await loadTaco();
  const byId = new Map<number, TacoRow>(rows.map(t => [t[0], t]));
  const SYSTEM = systemPrompt(rows);

  const parts: unknown[] = [];
  if (body.imagem) {
    if (body.imagem.length > 6_000_000) return json({ error: "too_big" }, 413);
    parts.push({ inlineData: { mimeType: body.mime || "image/jpeg", data: body.imagem } });
    parts.push({ text: `Foto da refeição${body.refeicao ? ` (${body.refeicao})` : ""}. Identifique os alimentos e estime as porções.${body.texto ? ` A pessoa comentou: "${body.texto}".` : ""}` });
  } else if (body.alimento) {
    parts.push({ text: `A pessoa corrigiu um item para: "${body.alimento}". Devolva exatamente 1 item com esse alimento, uma porção comum em gramas e os valores por 100 g.` });
  } else if (body.texto) {
    parts.push({ text: `A pessoa descreveu o que comeu${body.refeicao ? ` no ${body.refeicao}` : ""}: "${body.texto}". Separe em itens e estime as porções (use as quantidades citadas; se faltarem, assuma porções comuns).` });
  } else {
    return json({ error: "no_input" }, 400);
  }

  let last = 0;
  while (models.length) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${models[0]}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json", responseSchema: SCHEMA },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought).map((p: { text: string }) => p.text).join("");
        try {
          const out = JSON.parse(text);
          const itens = (Array.isArray(out.itens) ? out.itens : []).map((i: Food & { alternativas?: Food[] }) => ({
            ...ground(byId, i),
            alternativas: (Array.isArray(i.alternativas) ? i.alternativas : []).map(a => ground(byId, a)),
          }));
          return json({ itens, aviso: typeof out.aviso === "string" ? out.aviso : "" });
        } catch {
          console.error("bad model json", text.slice(0, 500));
          last = 502;
          break; // try the next model
        }
      }
      last = res.status;
      const detail = await res.text();
      console.error(models[0], res.status, detail);
      if (res.status === 401 || res.status === 403 || /API.?key/i.test(detail)) return json({ error: "bad_key" }, 502);
      if (res.status !== 500 && res.status !== 503) break; // 400 (e.g. unsupported image), 404, 429: try the next model
      await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
    }
    models.shift();
  }
  return json({ error: last === 429 ? "rate_limited" : "overloaded" }, 502);
});
