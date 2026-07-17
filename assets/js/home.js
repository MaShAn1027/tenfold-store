/* TENFOLD — home page: hero, rail, marquees, counters, catalog viz */
import { teeSVG } from "./mockup.js";
import { store, initChrome, renderCart, media, observeReveals, initTilt, initCounters, fillMarquee } from "./main.js";

const $ = (s, el = document) => el.querySelector(s);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

initChrome();
const products = await store.load();
renderCart();

/* ---------- hero: floating tee + mouse parallax ---------- */
const heroPick = [...products]
  .filter((p) => (p.collection === "Street" || p.collection === "Premium") && p.price_usd >= 60)
  .sort((a, b) => b.price_usd - a.price_usd)[0] || products[0];
const heroTee = $("#hero-tee");
heroTee.innerHTML = media(heroPick, { large: true });
if (!REDUCED && matchMedia("(pointer: fine)").matches) {
  const hero = $(".hero");
  hero.addEventListener("mousemove", (e) => {
    const dx = e.clientX / innerWidth - 0.5, dy = e.clientY / innerHeight - 0.5;
    heroTee.style.translate = `${dx * -26}px ${dy * -18}px`;
  });
  hero.addEventListener("mouseleave", () => (heroTee.style.translate = ""));
}

/* ---------- marquees ---------- */
fillMarquee("marquee-a", "marquee-b", [
  "299 curated styles", "Heavyweight 220 gsm", "Organic combed cotton",
  "Evidence-based design", "Ships worldwide", "No filler, ever",
]);
fillMarquee("marquee2-a", "marquee2-b",
  products.filter((p) => p.collection === "Statement").slice(0, 6).map((p) => p.name)
);

/* ---------- collection rail (drag to scroll) ---------- */
const COLS = ["Premium", "Street", "Graphic", "Statement"];
const rail = $("#rail");
rail.innerHTML = COLS.map((c, i) => {
  const list = products.filter((p) => p.collection === c);
  const cover = list[Math.floor(list.length / 3)] || list[0];
  return `<a class="rail-card reveal" style="--d:${i * 0.08}s" href="shop.html?c=${c}">
    ${cover ? teeSVG(cover) : ""}
    <span class="t-arrow">↗</span>
    <span class="t-name">${c}</span>
    <span class="t-count">${list.length} styles</span>
  </a>`;
}).join("");
let drag = null;
rail.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, left: rail.scrollLeft, moved: false };
  rail.classList.add("dragging");
});
addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 5) drag.moved = true;
  rail.scrollLeft = drag.left - dx;
});
addEventListener("pointerup", () => { drag = null; rail.classList.remove("dragging"); });
rail.addEventListener("click", (e) => { if (drag?.moved) e.preventDefault(); }, true);

/* ---------- featured grid ---------- */
const featured = COLS.flatMap((c) => products.filter((p) => p.collection === c).slice(0, 2)).slice(0, 6);
const grid = $("#featured");
grid.innerHTML = featured.map((p, i) => `
  <a class="card reveal" style="--d:${(i % 3) * 0.08}s" href="shop.html">
    <div class="card-media"><span class="card-tag">${p.collection}</span>${media(p)}</div>
    <div class="card-info">
      <div><div class="card-name">${p.name}</div><div class="card-cat">${p.category.replace(/-/g, " ")}</div></div>
      <div class="card-price">$${p.price_usd}</div>
    </div>
  </a>`).join("");
initTilt(grid);

/* ---------- animated counters ---------- */
$("#stat-count").dataset.end = products.length;
document.querySelectorAll("[data-count]").forEach((el) => (el.dataset.end ??= el.textContent));
initCounters();

/* ---------- catalog viz ---------- */
const tip = document.createElement("div");
tip.className = "viz-tip";
document.body.appendChild(tip);
function bindTips(root) {
  root.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      tip.innerHTML = el.dataset.tip;
      tip.style.left = e.clientX + "px";
      tip.style.top = e.clientY - 8 + "px";
      tip.classList.add("show");
    });
    el.addEventListener("mouseleave", () => tip.classList.remove("show"));
  });
}

/* price histogram — one series, sequential accent, hover tooltips */
const BANDS = [
  ["Under $20", (p) => p < 20],
  ["$20–29", (p) => p >= 20 && p < 30],
  ["$30–39", (p) => p >= 30 && p < 40],
  ["$40–59", (p) => p >= 40 && p < 60],
  ["$60–79", (p) => p >= 60 && p < 80],
  ["$80+", (p) => p >= 80],
];
const bandCounts = BANDS.map(([label, fn]) => [label, products.filter((p) => fn(p.price_usd)).length]);
const maxBand = Math.max(...bandCounts.map(([, n]) => n));
$("#chart-price").innerHTML = `
  <div class="histo">
    ${bandCounts.map(([label, n]) => `
      <div class="h-col" data-tip="${label} — <b>${n}</b> styles">
        <div class="h-bar" style="height:${(n / maxBand) * 100}%"></div>
      </div>`).join("")}
  </div>
  <div class="h-axis">${bandCounts.map(([label]) => `<span>${label}</span>`).join("")}</div>`;
$("#table-price").innerHTML =
  `<tr><th>Price band</th><th>Styles</th></tr>` +
  bandCounts.map(([l, n]) => `<tr><td>${l}</td><td>${n}</td></tr>`).join("");

/* collection split — horizontal bars, identity by row label (no color legend needed) */
const colCounts = COLS.map((c) => [c, products.filter((p) => p.collection === c).length])
  .sort((a, b) => b[1] - a[1]);
const maxCol = Math.max(...colCounts.map(([, n]) => n));
$("#chart-collection").innerHTML = `
  <div class="hbars" style="padding:12px 0 26px">
    ${colCounts.map(([c, n]) => `
      <div class="hbar-row" data-tip="${c} — <b>${n}</b> styles (${Math.round((n / products.length) * 100)}%)">
        <span class="hb-label">${c}</span>
        <div class="hbar-track"><div class="hbar-fill" style="width:${(n / maxCol) * 100}%"></div></div>
        <span class="hb-val">${n}</span>
      </div>`).join("")}
  </div>`;
$("#table-collection").innerHTML =
  `<tr><th>Collection</th><th>Styles</th></tr>` +
  colCounts.map(([c, n]) => `<tr><td>${c}</td><td>${n}</td></tr>`).join("");

bindTips(document);
document.querySelectorAll(".viz-table-toggle").forEach((btn) =>
  btn.addEventListener("click", () => {
    const t = $("#table-" + btn.dataset.table);
    t.classList.toggle("show");
    btn.textContent = t.classList.contains("show") ? "Hide table" : "View as table";
  })
);

/* re-observe injected reveal elements */
observeReveals();
