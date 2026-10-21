// Meal analysis on Google Gemini (free tier). Given a photo of a plate (or a text description, or a
// single food name), returns each food with an estimated portion, a confidence and likely
// alternatives. The model names each food the way the TACO table does and the server looks it up
// there, so nutrition comes from the table; the model's own values are used only for foods TACO lacks.
// The table is not sent to the model, which keeps each request small. The app asks the user to check
// every item.
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

// Matching a model-written TACO-style name ("Frango, peito, sem pele, grelhado") to a table row:
// same main food, same way of cooking, then the closest overlap of words.
const STOP = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "tipo", "com", "ao", "na", "no", "para"]);
const SYN: Record<string, string> = { branco: "1", branca: "1" }; // "arroz branco" is "Arroz, tipo 1" in TACO
const PREP = new Set(["cru", "cozid", "frit", "grelhad", "assad", "refogad", "torrad", "ensopad", "empanad", "milanesa"]);
const stem = (w: string) => w.replace(/(a|o|as|os)$/, "");
const toks = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w)).map(w => SYN[w] ?? w);
type Indexed = { r: TacoRow; t: Set<string>; head: string; prep: Set<string> };
const indexRows = (rows: TacoRow[]): Indexed[] =>
  rows.map(r => { const t = toks(r[1]); return { r, t: new Set(t), head: t[0], prep: new Set(t.map(stem).filter(w => PREP.has(w))) }; });
const findTaco = (index: Indexed[], name: string): TacoRow | null => {
  const g = toks(name);
  if (!g.length) return null;
  const gPrep = g.map(stem).filter(w => PREP.has(w));
  let best: TacoRow | null = null, score = 0;
  for (const x of index) {
    if (x.head !== g[0]) continue;
    if (gPrep.length && !gPrep.every(p => x.prep.has(p))) continue;
    const s = (2 * g.filter(w => x.t.has(w)).length) / (g.length + x.t.size);
    if (s > score) { score = s; best = x.r; }
  }
  return score >= 0.6 ? best : null;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `Você é um nutricionista brasileiro que analisa refeições para um app de registro alimentar.
Identifique cada alimento separadamente (ex.: arroz, feijão, frango grelhado, salada, molho, bebida) e estime a quantidade em gramas pelo tamanho no prato, talheres e prato como referência. Para bebidas, use ml como gramas.
Dê valores nutricionais POR 100 g do alimento como preparado (cozido, grelhado, frito…), preferindo a tabela TACO; para produtos industrializados use rótulos típicos.
Para cada item, dê a confiança da identificação (0 a 100) e até 3 alternativas plausíveis caso a identificação esteja errada (ex.: frango grelhado → frango frito, peixe grelhado), também com valores por 100 g.
Inclua óleo/azeite/manteiga visível ou provável só se houver sinal claro. Não invente itens que não aparecem.
Se a imagem não for comida, devolva itens vazio e explique em "aviso".
Nomes em português do Brasil, curtos e específicos (ex.: "Arroz branco cozido", "Peito de frango grelhado").

Para cada item e cada alternativa, preencha "taco" com o nome no formato da Tabela TACO: alimento, depois tipo/parte, depois preparo, separados por vírgula. Exemplos: "Arroz, tipo 1, cozido", "Arroz, integral, cozido", "Feijão, carioca, cozido", "Frango, peito, sem pele, grelhado", "Carne, bovina, patinho, sem gordura, grelhado", "Ovo, de galinha, inteiro, frito", "Batata, inglesa, cozida", "Alface, crespa, crua", "Banana, prata, crua", "Pão, trigo, francês". Os valores por 100 g que você der só serão usados se o alimento não estiver na TACO.`;

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
        required: ["nome", "taco", "gramas", "confianca", "kcal", "p", "c", "g", "f", "alternativas"],
        properties: {
          nome: { type: "STRING" },
          taco: { type: "STRING", description: "nome no formato da Tabela TACO" },
          gramas: { type: "NUMBER", description: "quantidade estimada em gramas" },
          confianca: { type: "INTEGER", description: "0 a 100" },
          ...NUTRI,
          alternativas: {
            type: "ARRAY",
            items: { type: "OBJECT", required: ["nome", "taco", "kcal", "p", "c", "g", "f"], properties: { nome: { type: "STRING" }, taco: { type: "STRING" }, ...NUTRI } },
          },
        },
      },
    },
    aviso: { type: "STRING", description: "Observação curta para a pessoa, se necessário" },
  },
};

type Food = { nome: string; taco?: string; kcal: number; p: number; c: number; g: number; f: number };

/** Uses the TACO values when the model's TACO-style name is in the table; otherwise keeps its own estimate. */
const ground = <T extends Food>(index: Indexed[], x: T) => {
  const t = findTaco(index, String(x.taco || x.nome || ""));
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
  const models = [...new Set([Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest", "gemini-flash-lite-latest"])];

  let body: { imagem?: string; mime?: string; texto?: string; alimento?: string; refeicao?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const index = indexRows(await loadTaco());

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
            ...ground(index, i),
            alternativas: (Array.isArray(i.alternativas) ? i.alternativas : []).map(a => ground(index, a)),
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
      if (res.status === 402) return json({ error: "no_credits" }, 502); // billing project out of prepaid credits
      if (res.status !== 500 && res.status !== 503) break; // 400 (e.g. unsupported image), 404, 429: try the next model
      await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
    }
    models.shift();
  }
  return json({ error: last === 429 ? "rate_limited" : "overloaded" }, 502);
});
