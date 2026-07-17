/* TENFOLD — shop page: filters, sort, search, product modal */
import { teeSVG } from "./mockup.js";
import { store, cart, initChrome, renderCart, media, initTilt } from "./main.js";

const $ = (s, el = document) => el.querySelector(s);
const PAGE = 30;

const state = { cats: new Set(), price: null, sort: "featured", q: "", shown: PAGE };

const CAT_LABELS = {}; // filled from data

function fmtCat(c) {
  return (CAT_LABELS[c] || c).replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function collection(p) { return p.collection || "Graphic"; }

function apply(products) {
  let list = [...products];
  if (state.cats.size) list = list.filter((p) => state.cats.has(collection(p)));
  if (state.price) list = list.filter((p) => p.price_usd >= state.price[0] && p.price_usd < state.price[1]);
  if (state.q) {
    const q = state.q.toLowerCase();
    list = list.filter((p) =>
      [p.name, p.category, p.theme, ...(p.style || [])].join(" ").toLowerCase().includes(q)
    );
  }
  const sorts = {
    "price-asc": (a, b) => a.price_usd - b.price_usd,
    "price-desc": (a, b) => b.price_usd - a.price_usd,
    "name": (a, b) => a.name.localeCompare(b.name),
  };
  if (sorts[state.sort]) list.sort(sorts[state.sort]);
  return list;
}

function render(products) {
  const list = apply(products);
  const grid = $("#grid");
  $("#result-count").textContent = `${list.length} styles`;
  grid.innerHTML = list
    .slice(0, state.shown)
    .map(
      (p, i) => `<article class="card reveal" style="--d:${(i % 3) * 0.06}s" data-id="${p.id}">
        <div class="card-media">
          <span class="card-tag">${collection(p)}</span>
          ${media(p)}
          <button class="card-quick" data-quick="${p.id}" aria-label="Quick add">+</button>
        </div>
        <div class="card-info">
          <div>
            <div class="card-name">${p.name}</div>
            <div class="card-cat">${fmtCat(p.category)}</div>
          </div>
          <div class="card-price">$${p.price_usd}</div>
        </div>
      </article>`
    )
    .join("");
  $("#load-more").style.display = list.length > state.shown ? "grid" : "none";
  grid.querySelectorAll(".card").forEach((c) =>
    c.addEventListener("click", (e) => {
      if (e.target.closest(".card-quick")) { cart.add(c.dataset.id, "M"); return; }
      openModal(store.byId(c.dataset.id));
    })
  );
  // stagger-reveal the freshly rendered cards
  requestAnimationFrame(() =>
    requestAnimationFrame(() => grid.querySelectorAll(".card").forEach((c) => c.classList.add("in")))
  );
}

function openModal(p) {
  if (!p) return;
  const modal = $("#modal");
  let size = "M";
  modal.innerHTML = `
    <button class="modal-close" id="modal-close">✕</button>
    <div class="modal-media">${media(p, { large: true })}</div>
    <div class="modal-body">
      <div class="micro" style="color:var(--ink-soft)">${collection(p)} · ${fmtCat(p.category)}</div>
      <h3>${p.name}</h3>
      <div class="modal-price">$${p.price_usd}</div>
      <p class="modal-desc">${p.design?.graphic_desc || p.theme || ""}</p>
      <div class="modal-evidence"><b>Why it's here</b> — ${p.evidence || "curated pick"}</div>
      <div>
        <div class="micro" style="margin-bottom:10px">Size</div>
        <div class="sizes">${["XS", "S", "M", "L", "XL", "XXL"]
          .map((s) => `<button class="size ${s === "M" ? "on" : ""}" data-s="${s}">${s}</button>`)
          .join("")}</div>
      </div>
      <button class="btn solid" id="add-cart" style="justify-content:center">Add to bag — $${p.price_usd}</button>
      <div class="drawer-note">Combed organic cotton · 220 gsm · Pre-shrunk · Ships worldwide</div>
    </div>`;
  modal.querySelectorAll(".size").forEach((b) =>
    b.addEventListener("click", () => {
      modal.querySelectorAll(".size").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      size = b.dataset.s;
    })
  );
  $("#add-cart", modal).addEventListener("click", () => {
    cart.add(p.id, size);
    modal.classList.remove("open");
  });
  $("#modal-close", modal).addEventListener("click", () => {
    modal.classList.remove("open");
    $("#overlay").classList.remove("open");
  });
  modal.classList.add("open");
  $("#overlay").classList.add("open");
}

async function init() {
  initChrome();
  const products = await store.load();
  renderCart();
  initTilt($("#grid"));

  // build collection filter from data
  const cols = [...new Set(products.map(collection))].sort();
  $("#f-collections").innerHTML = cols
    .map(
      (c) =>
        `<label><input type="checkbox" value="${c}"> ${c} <span style="margin-left:auto;font-size:11px">${products.filter((p) => collection(p) === c).length}</span></label>`
    )
    .join("");
  $("#f-collections").addEventListener("change", (e) => {
    e.target.checked ? state.cats.add(e.target.value) : state.cats.delete(e.target.value);
    state.shown = PAGE;
    render(products);
  });
  $("#f-price").addEventListener("change", (e) => {
    const v = e.target.value;
    state.price = v === "all" ? null : v.split("-").map(Number);
    state.shown = PAGE;
    render(products);
  });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(products); });
  $("#search").addEventListener("input", (e) => {
    state.q = e.target.value.trim();
    state.shown = PAGE;
    render(products);
  });
  $("#load-more-btn").addEventListener("click", () => { state.shown += PAGE; render(products); });

  // deep link ?c=Collection
  const c = new URLSearchParams(location.search).get("c");
  if (c && cols.includes(c)) {
    state.cats.add(c);
    $(`#f-collections input[value="${c}"]`).checked = true;
  }
  render(products);
}

init();
