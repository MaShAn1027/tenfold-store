/* Render typography-led designs into print-ready PNGs (4500x5400, transparent)
   for Printful DTG upload. Pictorial designs are skipped and listed in the
   manifest as needing illustration work. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "print");
mkdirSync(outDir, { recursive: true });

const products = JSON.parse(readFileSync(join(root, "data", "products.json"), "utf8"));

const W = 4500, H = 5400;

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function extractText(typo) {
  // first-to-last quote span, so internal apostrophes don't truncate
  const qs = [...typo.matchAll(/['"“”‘’]/g)];
  let text = qs.length >= 2
    ? typo.slice(qs[0].index + 1, qs[qs.length - 1].index)
    : typo.split(/\b in \b|[;(]/)[0];
  text = text.trim().replace(/^['"“”‘’]+|['"“”‘’]+$/g, "");
  return text.length >= 2 ? text : null;
}

function splitLines(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const target = Math.min(4, Math.max(1, Math.round(words.length / 2.5)));
  const per = Math.ceil(text.length / target);
  const lines = [[]];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur.join(" ").length + w.length > per && cur.length && lines.length < 4) lines.push([w]);
    else cur.push(w);
  }
  return lines.map((l) => l.join(" "));
}

function printSVG(p) {
  const typo = p.design.typography;
  const text = extractText(typo);
  if (!text) return null;
  const serif = /serif|roman|editorial|classic|western|script/i.test(typo);
  const font = serif ? "Georgia" : "Futura";
  const lines = splitLines(text.toUpperCase());
  const maxChars = Math.max(...lines.map((l) => l.length));
  // ~0.62 average glyph width ratio; fill 82% of canvas width
  const size = Math.min(560, (W * 0.82) / (maxChars * 0.62));
  const lineH = size * 1.32;
  const startY = H / 2 - ((lines.length - 1) * lineH) / 2;
  const tspans = lines
    .map((l, i) => `<text x="${W / 2}" y="${startY + i * lineH}" text-anchor="middle"
      font-family="${font}" font-size="${size}" font-weight="700"
      letter-spacing="${serif ? 2 : 14}" fill="${p.design.print_color}">${esc(l)}</text>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${tspans}</svg>`;
}

const manifest = { generated: [], needs_illustration: [], no_print: [] };

for (const p of products) {
  const typo = p.design?.typography || "none";
  if (/^(none|n\/a|-)?$/i.test(typo.trim())) {
    // premium basics legitimately have no print; pictorial-only designs need an illustrator
    (p.design.graphic_desc && !/no graphic|no logo/i.test(p.design.graphic_desc)
      ? manifest.needs_illustration
      : manifest.no_print
    ).push(p.id);
    continue;
  }
  const svg = printSVG(p);
  if (!svg) { manifest.needs_illustration.push(p.id); continue; }
  await sharp(Buffer.from(svg), { density: 72 }).png().toFile(join(outDir, `${p.id}.png`));
  manifest.generated.push(p.id);
}

writeFileSync(join(root, "print", "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`print files: ${manifest.generated.length} generated, ${manifest.needs_illustration.length} need illustration, ${manifest.no_print.length} blank premium basics`);
