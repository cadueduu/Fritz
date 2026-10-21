// Builds the TACO food table (src/data/taco.json) used by the app search and, fetched from GitHub,
// by the `analisar` function.
// Source: Tabela Brasileira de Composição de Alimentos (TACO, 4ª ed., NEPA/UNICAMP), as CSV in
// https://github.com/raulfdm/taco-api (MIT) under references/csv.
// Usage: node scripts/build-taco.mjs <path-to-taco-api>/references/csv
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/build-taco.mjs <taco-api>/references/csv'); process.exit(1); }

// minimal CSV parser: quoted fields with commas, no embedded newlines
const parse = file => {
  const [head, ...lines] = readFileSync(join(dir, file), 'utf8').trim().split(/\r?\n/);
  const split = l => [...l.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)].slice(0, -1).map(m => m[2] ?? m[1]);
  const keys = split(head);
  return lines.map(l => Object.fromEntries(split(l).map((v, i) => [keys[i], v])));
};

const cats = Object.fromEntries(parse('categories.csv').map(c => [c.id, c.name]));
const nut = Object.fromEntries(parse('nutrients.csv').map(n => [n.foodId, n]));
const n = v => (v === '' || v == null ? 0 : Math.round(Number(v) * 10) / 10);

// [id, name, category, kcal, protein, carbs, fat, fiber] per 100 g
const rows = parse('food.csv').map(f => {
  const x = nut[f.id];
  return [Number(f.id), f.name, cats[f.categoryId], n(x.kcal), n(x.protein), n(x.carbohydrates), n(x.lipids), n(x.dietaryFiber)];
});

writeFileSync('src/data/taco.json', JSON.stringify(rows));
console.log(rows.length, 'foods');
