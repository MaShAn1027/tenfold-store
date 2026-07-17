/* TENFOLD — shared: cart state, drawer, reveal animations */
import { teeSVG } from "./mockup.js";

const CART_KEY = "tenfold_cart_v1";

/* real Printful mockup when available, procedural SVG otherwise */
export function media(p, opts) {
  return p.image
    ? `<img src="${p.image}" alt="${p.name.replace(/"/g, "&quot;")}" loading="lazy" />`
    : teeSVG(p, opts);
}

export const store = {
  products: [],
  async load() {
    if (this.products.length) return this.products;
    const res = await fetch("data/products.json");
    this.products = await res.json();
    return this.products;
  },
  byId(id) { return this.products.find((p) => p.id === id); },
};

export const cart = {
  read() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } },
  write(items) { localStorage.setItem(CART_KEY, JSON.stringify(items)); renderCart(); },
  add(id, size) {
    const items = this.read();
    const hit = items.find((i) => i.id === id && i.size === size);
    if (hit) hit.qty += 1; else items.push({ id, size, qty: 1 });
    this.write(items);
    bumpCartCount();
    openDrawer();
  },
  setQty(id, size, qty) {
    let items = this.read();
    const hit = items.find((i) => i.id === id && i.size === size);
    if (hit) hit.qty = qty;
    items = items.filter((i) => i.qty > 0);
    this.write(items);
  },
  count() { return this.read().reduce((n, i) => n + i.qty, 0); },
  total() { return this.read().reduce((n, i) => n + i.qty * (store.byId(i.id)?.price_usd || 0), 0); },
};

const $ = (s, el = document) => el.querySelector(s);

export function openDrawer() {
  $("#drawer")?.classList.add("open");
  $("#overlay")?.classList.add("open");
}
export function closeAll() {
  $("#drawer")?.classList.remove("open");
  $("#overlay")?.classList.remove("open");
  $("#modal")?.classList.remove("open");
}

export function renderCart() {
  const box = $("#drawer-items");
  if (!box) return;
  const items = cart.read();
  $("#cart-count").textContent = cart.count();
  $("#cart-total").textContent = `$${cart.total().toFixed(2)}`;
  if (!items.length) {
    box.innerHTML = `<div class="empty-cart">Your bag is empty.</div>`;
    return;
  }
  box.innerHTML = items
    .map((i) => {
      const p = store.byId(i.id);
      if (!p) return "";
      return `<div class="cart-item">
        <div class="thumb">${media(p)}</div>
        <div>
          <div class="card-name">${p.name}</div>
          <small>Size ${i.size} · $${p.price_usd}</small>
          <div class="qty">
            <button data-q="-1" data-id="${p.id}" data-size="${i.size}">−</button>
            <span>${i.qty}</span>
            <button data-q="1" data-id="${p.id}" data-size="${i.size}">+</button>
          </div>
        </div>
        <div class="card-price">$${(p.price_usd * i.qty).toFixed(0)}</div>
      </div>`;
    })
    .join("");
  box.querySelectorAll("[data-q]").forEach((b) =>
    b.addEventListener("click", () => {
      const items2 = cart.read();
      const hit = items2.find((x) => x.id === b.dataset.id && x.size === b.dataset.size);
      if (hit) cart.setQty(hit.id, hit.size, hit.qty + Number(b.dataset.q));
    })
  );
}

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initChrome() {
  $("#cart-open")?.addEventListener("click", openDrawer);
  $("#drawer-close")?.addEventListener("click", closeAll);
  $("#overlay")?.addEventListener("click", closeAll);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });
  $("#checkout")?.addEventListener("click", () => {
    alertBar("Checkout is not wired up yet — payment integration (Stripe) is the next milestone.");
  });

  observeReveals();

  // scroll progress bar
  const bar = $("#progress");
  if (bar) {
    const onScroll = () => {
      const h = document.documentElement;
      bar.style.transform = `scaleX(${h.scrollTop / (h.scrollHeight - h.clientHeight || 1)})`;
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // header: transparent over dark hero → paper after scroll
  const header = $("#header");
  if (header) {
    const onScroll = () => header.classList.toggle("scrolled", scrollY > 40);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // custom cursor ring
  const cursor = $("#cursor");
  if (cursor && !REDUCED && matchMedia("(pointer: fine)").matches) {
    let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y;
    cursor.style.opacity = "0";
    addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; cursor.style.opacity = "1"; }, { passive: true });
    (function loop() {
      x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      cursor.style.left = x + "px"; cursor.style.top = y + "px";
      requestAnimationFrame(loop);
    })();
    document.addEventListener("mouseover", (e) =>
      cursor.classList.toggle("hot", !!e.target.closest("a, button, .card, .rail-card, .h-col, .hbar-row"))
    );
  }
}

export function observeReveals(root = document) {
  const io = new IntersectionObserver(
    (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
    { threshold: 0.12 }
  );
  root.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
}

/* 3D tilt for product cards */
export function initTilt(container) {
  if (REDUCED || !matchMedia("(pointer: fine)").matches) return;
  container.addEventListener("mousemove", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const r = card.getBoundingClientRect();
    const rx = ((e.clientY - r.top) / r.height - 0.5) * -7;
    const ry = ((e.clientX - r.left) / r.width - 0.5) * 9;
    card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) translateZ(4px)`;
  });
  container.addEventListener("mouseout", (e) => {
    const card = e.target.closest(".card");
    if (card && !card.contains(e.relatedTarget)) card.style.transform = "";
  });
}

/* animated counters (respects reduced motion) */
export function initCounters() {
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target;
      const end = Number(el.dataset.end ?? el.textContent);
      if (REDUCED || !Number.isFinite(end)) { el.textContent = end; continue; }
      const t0 = performance.now(), dur = 1400;
      (function tick(t) {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 4)));
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    }
  }, { threshold: 0.4 });
  document.querySelectorAll("[data-count]").forEach((el) => io.observe(el));
}

/* infinite marquee: fill two identical tracks */
export function fillMarquee(idA, idB, items) {
  const html = items.map((t) => `<span>${t}<i>◍</i></span>`).join("");
  const a = $("#" + idA), b = $("#" + idB);
  if (a) a.innerHTML = html;
  if (b) b.innerHTML = html;
}

export function bumpCartCount() {
  const el = $("#cart-count");
  if (!el) return;
  el.classList.add("pop");
  setTimeout(() => el.classList.remove("pop"), 300);
}

let barTimer;
export function alertBar(msg) {
  let bar = $("#alert-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "alert-bar";
    bar.style.cssText =
      "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#16150f;color:#f6f4ef;" +
      "padding:13px 24px;border-radius:999px;font-size:13px;z-index:120;max-width:90vw;text-align:center;" +
      "box-shadow:0 18px 40px rgba(0,0,0,.25);transition:opacity .3s;";
    document.body.appendChild(bar);
  }
  bar.textContent = msg;
  bar.style.opacity = "1";
  clearTimeout(barTimer);
  barTimer = setTimeout(() => (bar.style.opacity = "0"), 3200);
}
