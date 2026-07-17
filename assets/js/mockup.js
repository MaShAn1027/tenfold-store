/* TENFOLD — procedural SVG tee mockups.
   Every product renders as a consistent studio-style flat-lay tee,
   colored and printed from its design spec in products.json. */

const TEE_PATH =
  "M78 26 L108 12 C118 24 142 24 152 12 L182 26 L206 68 L176 86 L172 62 " +
  "L172 214 C172 220 166 226 160 226 L100 226 C94 226 88 220 88 214 " +
  "L88 62 L84 86 L54 68 Z";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shade(hex, amt) {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  const r = c(n >> 16), g = c((n >> 8) & 255), b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function luminance(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/* deterministic pseudo-random from product id, so each design is stable */
function rng(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

/* graphic motifs by category family — abstract, brand-consistent print marks */
function motif(p, r) {
  const c = p.design.print_color;
  const fam = (p.category || "").toLowerCase();
  const pick = r();
  if (/(minimal|premium|basic|pima|organic|pocket|henley|longsleeve)/.test(fam)) return ""; // clean blank tee
  if (/(celestial|astro)/.test(fam)) {
    return `<circle cx="130" cy="118" r="17" fill="none" stroke="${c}" stroke-width="1.6"/>
      <circle cx="147" cy="105" r="2.4" fill="${c}"/>
      <path d="M108 132 q22 10 44 0" fill="none" stroke="${c}" stroke-width="1.4"/>`;
  }
  if (/(animal|pet|outdoor|cottage|mushroom|nature)/.test(fam)) {
    return `<path d="M114 128 q8 -26 16 -30 q8 4 16 30" fill="none" stroke="${c}" stroke-width="1.8"/>
      <path d="M104 132 h52" stroke="${c}" stroke-width="1.8"/>
      <circle cx="130" cy="100" r="3" fill="${c}"/>`;
  }
  if (/(music|band)/.test(fam)) {
    return `<path d="M118 132 v-30 l26 -6 v30" fill="none" stroke="${c}" stroke-width="1.8"/>
      <circle cx="114" cy="132" r="4.5" fill="${c}"/><circle cx="140" cy="126" r="4.5" fill="${c}"/>`;
  }
  if (/(y2k|retro|vintage|nostalgia)/.test(fam)) {
    return `<circle cx="130" cy="114" r="20" fill="none" stroke="${c}" stroke-width="1.6"/>
      <path d="M110 114 h40 M130 94 v40" stroke="${c}" stroke-width="1.1" opacity="0.75"/>`;
  }
  if (/(back|oversized|washed|street)/.test(fam)) {
    return `<rect x="112" y="100" width="36" height="30" fill="none" stroke="${c}" stroke-width="1.7"/>
      <path d="M112 110 h36" stroke="${c}" stroke-width="1.1"/>`;
  }
  if (/(embroider)/.test(fam)) {
    return `<path d="M120 112 q10 -12 20 0 q-10 12 -20 0" fill="none" stroke="${c}" stroke-width="1.8"/>`;
  }
  /* generic marks for humor / meme / text-led designs without typography */
  return pick < 0.5
    ? `<circle cx="130" cy="112" r="16" fill="none" stroke="${c}" stroke-width="1.7"/>
       <path d="M122 112 l6 6 l12 -14" fill="none" stroke="${c}" stroke-width="1.7"/>`
    : `<path d="M112 100 l36 28 M148 100 l-36 28" stroke="${c}" stroke-width="1.6"/>`;
}

/* split typography into up to 3 balanced lines */
function splitLines(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [text];
  const lines = [[]];
  const perLine = Math.ceil(words.join(" ").length / Math.min(3, Math.ceil(words.length / 2)));
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur.join(" ").length + w.length > perLine && cur.length && lines.length < 3) lines.push([w]);
    else cur.push(w);
  }
  return lines.map((l) => l.join(" "));
}

export function teeSVG(p, { large = false } = {}) {
  const d = p.design || {};
  const base = d.base_color || "#e8e4da";
  const print = d.print_color || "#16150f";
  const r = rng(p.id || p.name);
  const dark = luminance(base) < 0.45;
  const fold = shade(base, dark ? 26 : -18);
  const collar = shade(base, dark ? 38 : -30);

  let printLayer = "";
  const typo = d.typography && !/^(none|n\/a|-)?$/i.test(d.typography.trim()) ? d.typography : null;
  if (typo) {
    // take everything between the FIRST and LAST quote mark so internal
    // apostrophes (DON'T, AIN'T) don't truncate the phrase
    const qs = [...typo.matchAll(/['"“”‘’]/g)];
    let text = qs.length >= 2
      ? typo.slice(qs[0].index + 1, qs[qs.length - 1].index)
      : typo.split(/\b in \b|[;(]/)[0];
    text = text.trim().replace(/^['"“”‘’]+|['"“”‘’]+$/g, "");
    if (text.length > 42) text = text.slice(0, 42).replace(/\s+\S*$/, "");
    const lines = splitLines(text.toUpperCase());
    const serif = /serif|roman|editorial|classic/i.test(typo);
    // keep the longest line inside the 76px torso width (~0.62 glyph ratio)
    const size = Math.max(6, Math.min(12, 76 / (Math.max(...lines.map((l) => l.length)) * 0.62)));
    printLayer = lines
      .map((line, i) =>
        `<text x="130" y="${112 - (lines.length - 1) * (size * 0.7) + i * size * 1.4}"
          text-anchor="middle" fill="${print}"
          font-family="${serif ? "Georgia, serif" : "Futura, 'Helvetica Neue', sans-serif"}"
          font-size="${size}" font-weight="600" letter-spacing="${serif ? 0.4 : 1.1}">${esc(line)}</text>`
      )
      .join("");
  } else {
    printLayer = motif(p, r);
  }

  return `<svg viewBox="0 0 260 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(p.name)}">
    <path d="${TEE_PATH}" fill="${base}" stroke="${collar}" stroke-width="1.2"/>
    <path d="M108 12 C118 24 142 24 152 12 L148 16 C140 26 120 26 112 16 Z" fill="${collar}"/>
    <path d="M112 15 C121 25 139 25 148 15" fill="none" stroke="${shade(collar, dark ? 20 : -12)}" stroke-width="2.4"/>
    <path d="M88 70 q6 40 2 90 M172 70 q-6 40 -2 90" stroke="${fold}" stroke-width="1" fill="none" opacity="0.7"/>
    <path d="M100 210 q30 6 60 0" stroke="${fold}" stroke-width="1" fill="none" opacity="0.6"/>
    ${large ? `<path d="M78 26 L54 68 l30 18 4 -24" fill="${shade(base, dark ? -14 : -8)}" opacity="0.35"/>
    <path d="M182 26 L206 68 l-30 18 -4 -24" fill="${shade(base, dark ? -14 : -8)}" opacity="0.35"/>` : ""}
    <g>${printLayer}</g>
  </svg>`;
}
