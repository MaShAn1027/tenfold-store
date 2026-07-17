/* Generate real product mockups via the Printful Mockup Generator API.

   Prerequisites (one-time, done by the store owner):
     1. Printful account + API token (Settings → Stores → API) — export PRINTFUL_API_KEY=...
     2. Print files hosted at a public base URL — export PRINT_BASE_URL=https://.../print
        (Printful's mockup API fetches files by URL; it does not accept raw uploads.)

   Usage:  node scripts/printful_mockups.mjs [--limit 20] [--product 71]
     --product  Printful catalog product id (default 71 = Bella+Canvas 3001 unisex tee)

   For each product in print/manifest.json "generated", this script:
     - creates a mockup task (front placement, matching shirt color where possible)
     - polls until done, downloads the first mockup to assets/img/products/<id>.jpg
     - stamps "image" into data/products.json so the site switches from SVG to photo. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = process.env.PRINTFUL_API_KEY;
const BASE = process.env.PRINT_BASE_URL?.replace(/\/$/, "");
if (!KEY || !BASE) {
  console.error("需要环境变量 PRINTFUL_API_KEY 和 PRINT_BASE_URL，见文件头注释。");
  process.exit(1);
}

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const PRODUCT_ID = Number(opt("product", 71));
const LIMIT = Number(opt("limit", Infinity));

const API = "https://api.printful.com";
const headers = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function pf(path, init = {}) {
  const res = await fetch(API + path, { headers, ...init });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body.result;
}

// map our base_color to the nearest Printful variant color by RGB distance
function nearestVariant(variants, hex) {
  const want = parseInt(hex.slice(1), 16);
  const [wr, wg, wb] = [want >> 16, (want >> 8) & 255, want & 255];
  let best = null, bestD = Infinity;
  for (const v of variants) {
    if (!v.color_code) continue;
    const c = parseInt(v.color_code.slice(1), 16);
    const d = (wr - (c >> 16)) ** 2 + (wg - ((c >> 8) & 255)) ** 2 + (wb - (c & 255)) ** 2;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

const products = JSON.parse(readFileSync(join(root, "data", "products.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "print", "manifest.json"), "utf8"));
const outDir = join(root, "assets", "img", "products");
mkdirSync(outDir, { recursive: true });

const { variants } = await pf(`/mockup-generator/printfiles/${PRODUCT_ID}`).then(() =>
  pf(`/products/${PRODUCT_ID}`)
).then((r) => ({ variants: r.variants }));

let done = 0;
for (const id of manifest.generated.slice(0, LIMIT)) {
  const p = products.find((x) => x.id === id);
  const dest = join(outDir, `${id}.jpg`);
  if (!p || existsSync(dest)) continue;
  try {
    const variant = nearestVariant(variants, p.design.base_color);
    const task = await pf(`/mockup-generator/create-task/${PRODUCT_ID}`, {
      method: "POST",
      body: JSON.stringify({
        variant_ids: [variant.id],
        format: "jpg",
        files: [{ placement: "front", image_url: `${BASE}/${id}.png`, position: {
          area_width: 1800, area_height: 2400, width: 1800, height: 2160, top: 120, left: 0,
        } }],
      }),
    });
    let result;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      result = await pf(`/mockup-generator/task?task_key=${task.task_key}`);
      if (result.status === "completed") break;
      if (result.status === "failed") throw new Error(result.error || "task failed");
    }
    const url = result.mockups?.[0]?.mockup_url;
    if (!url) throw new Error("no mockup url");
    const img = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(dest, img);
    p.image = `assets/img/products/${id}.jpg`;
    done++;
    console.log(`✓ ${id} (${p.name}) → ${variant.color}`);
    // Printful mockup API rate limit: ~2 requests/min on free tier
    await new Promise((r) => setTimeout(r, 25000));
  } catch (e) {
    console.error(`✗ ${id}: ${e.message}`);
  }
}

writeFileSync(join(root, "data", "products.json"), JSON.stringify(products, null, 1));
console.log(`\n${done} mockups downloaded; products.json updated.`);
