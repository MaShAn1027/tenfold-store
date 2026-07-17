/* Merge raw research outputs (data/raw/*.json) into data/products.json.
   Each raw file is either a JSON array of products or {products:[...], design_language:[...]}. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawDir = join(root, "data", "raw");

const COLLECTION_RULES = [
  [/premium|pima|organic|longsleeve|pocket|henley|luxury/, "Premium"],
  [/heavyweight|oversized|washed|back-print|embroider|street/, "Street"],
  [/meme|ironic|i-heart|minimal-text|niche-identity|statement/, "Statement"],
];

function collectionOf(cat = "") {
  for (const [re, col] of COLLECTION_RULES) if (re.test(cat.toLowerCase())) return col;
  return "Graphic";
}

const HEX = /^#[0-9a-f]{6}$/i;
function fixHex(v, fallback) {
  if (typeof v !== "string") return fallback;
  let s = v.trim();
  if (/^[0-9a-f]{6}$/i.test(s)) s = "#" + s;
  if (/^#[0-9a-f]{3}$/i.test(s)) s = "#" + [...s.slice(1)].map((c) => c + c).join("");
  return HEX.test(s) ? s.toLowerCase() : fallback;
}

function extractJSON(text) {
  // tolerate markdown fences / stray prose around the JSON
  const s = text.indexOf("["), o = text.indexOf("{");
  const start = s === -1 ? o : o === -1 ? s : Math.min(s, o);
  const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
  if (start === -1 || end <= start) throw new Error("no JSON found");
  return JSON.parse(text.slice(start, end + 1));
}

const seen = new Map();
const meta = { design_language: [], sources: {} };
let dropped = 0;

for (const f of readdirSync(rawDir).filter((f) => f.endsWith(".json")).sort()) {
  const source = f.replace(".json", "");
  let data;
  try {
    data = extractJSON(readFileSync(join(rawDir, f), "utf8"));
  } catch (e) {
    console.error(`✗ ${f}: ${e.message}`);
    continue;
  }
  if (!Array.isArray(data)) {
    if (Array.isArray(data.design_language)) meta.design_language.push(...data.design_language);
    data = data.products || [];
  }
  let kept = 0;
  for (const p of data) {
    if (!p || typeof p.name !== "string" || !p.name.trim()) { dropped++; continue; }
    const price = Math.round(Number(p.price_usd));
    if (!Number.isFinite(price) || price < 5 || price > 300) { dropped++; continue; }
    const key = p.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
    if (seen.has(key)) { dropped++; continue; }
    const d = p.design || {};
    seen.set(key, {
      // stable slug id: survives re-compiles when new sources are added
      id: "tf-" + key.trim().replace(/\s+/g, "-").slice(0, 40),
      name: p.name.trim(),
      collection: collectionOf(p.category),
      category: (p.category || "misc").toLowerCase().trim(),
      theme: p.theme || "",
      style: Array.isArray(p.style) ? p.style.slice(0, 5) : [],
      price_usd: price,
      evidence: p.evidence || "",
      source,
      design: {
        base_color: fixHex(d.base_color, "#e8e4da"),
        print_color: fixHex(d.print_color, "#16150f"),
        graphic_desc: d.graphic_desc || "",
        typography: d.typography || "none",
      },
    });
    kept++;
  }
  meta.sources[source] = kept;
  console.log(`✓ ${source}: ${kept} products`);
}

const products = [...seen.values()];
writeFileSync(join(root, "data", "products.json"), JSON.stringify(products, null, 1));
writeFileSync(join(root, "data", "catalog-meta.json"), JSON.stringify(meta, null, 1));

const byCol = {};
for (const p of products) byCol[p.collection] = (byCol[p.collection] || 0) + 1;
console.log(`\nTotal: ${products.length} products (${dropped} dropped)`);
console.log(byCol);
