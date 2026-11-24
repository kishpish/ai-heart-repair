// Page behaviour. Each feature is mounted on its own so one failure cannot take
// down the rest; without JavaScript the page still reads top to bottom.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const BASE = new URL("./", document.baseURI).href;

function safely(name, fn) {
  try {
    const out = fn();
    if (out && typeof out.catch === "function") out.catch((err) => console.error(`${name} failed`, err));
  } catch (err) {
    console.error(`${name} failed`, err);
  }
}

// ------------------------------------------------------------------ navigation
safely("nav", () => {
  const toggle = $(".nav__toggle");
  const list = $("#nav-list");
  const close = () => {
    list.dataset.open = "false";
    toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    const open = list.dataset.open !== "true";
    list.dataset.open = String(open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  list.addEventListener("click", (e) => e.target.closest("a") && close());
  const nav = toggle.closest(".nav");
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || list.dataset.open !== "true") return;
    const inside = list.contains(document.activeElement);
    close();
    if (inside) toggle.focus();
  });
  nav.addEventListener("focusout", (e) => e.relatedTarget && !nav.contains(e.relatedTarget) && close());
  document.addEventListener("click", (e) => !nav.contains(e.target) && close());

  // mark the section in view
  const links = new Map($$("a", list).map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        links.forEach((a, id) => (id === en.target.id ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
      }
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  links.forEach((_, id) => {
    const sec = document.getElementById(id);
    if (sec) io.observe(sec);
  });
  // the hero has no nav entry: crossing it clears the marker
  const hero = $(".hero");
  if (hero) io.observe(hero);
});

// ------------------------------------------------------------------ tabs (pipeline, citation)
function tabs(tablist) {
  const items = $$('[role="tab"]', tablist);
  const select = (tab, focus) => {
    for (const t of items) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
  };
  tablist.addEventListener("click", (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) select(tab, false);
  });
  tablist.addEventListener("keydown", (e) => {
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    let j = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % items.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = items.length - 1;
    if (j < 0) return;
    e.preventDefault();
    select(items[j], true);
  });
}
safely("tabs", () => $$('[role="tablist"]').forEach(tabs));

// ------------------------------------------------------------------ citation copy
safely("cite", () => {
  const box = $("[data-cite]");
  const status = $(".cite__status", box);
  $("[data-copy]", box).addEventListener("click", async () => {
    const panel = $$('[role="tabpanel"]', box).find((p) => !p.hidden);
    const text = $("[data-cite-text]", panel).textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "Copied.";
    } catch {
      const range = document.createRange();
      range.selectNodeContents($("[data-cite-text]", panel));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      status.textContent = "Selected. Press Ctrl or Cmd + C to copy.";
    }
    setTimeout(() => (status.textContent = ""), 4000);
  });
});

// ------------------------------------------------------------------ the 3D heart in the hero
safely("heart", async () => {
  const box = $("[data-heart]");
  if (!box) return;
  const canvas = $("canvas", box);
  try {
    const { createHeart } = await import("./heart3d.js");
    await createHeart(canvas, { src: new URL("assets/heart/heart.bin", BASE).href });
    box.dataset.ready = "true";
  } catch (err) {
    // No WebGL, or the geometry did not load: draw the 2D cross-section instead.
    console.warn("3D heart unavailable, using the 2D drawing:", err);
    const { createVentricle } = await import("./ventricle.js");
    const flat = document.createElement("canvas");
    flat.className = "ventricle";
    flat.width = flat.height = 720;
    flat.setAttribute("role", "img");
    flat.setAttribute("aria-label", "Animated short-axis cross-section of a left ventricle: grey healthy muscle thickens with each beat, a crimson scar does not move, ochre border zones move less, and teal gel depots sit in the border zones.");
    box.replaceChildren(flat);
    box.dataset.fallback = "true";
    createVentricle(flat, "hero");
  }
});

// ------------------------------------------------------------------ the scroll story
safely("ventricle", async () => {
  const { createVentricle } = await import("./ventricle.js");
  const stage = $('[data-ventricle="story"]');
  if (!stage) return;
  const heart = createVentricle(stage, "healthy");
  const readout = $("[data-story-readout]");
  const lines = {
    healthy: "wall thickens, cavity shrinks",
    infarct: "scar does not contract",
    permanent: "under 1% of muscle cells renewed per year",
    remodel: "radius up, wall thinner, stress up",
    gel: "wall thicker, so stress should fall",
    guess: "sites chosen by eye",
  };
  const steps = $$(".step");
  const activate = (step) => {
    for (const s of steps) s.dataset.active = String(s === step);
    heart.setState(step.dataset.step);
    readout.textContent = lines[step.dataset.step] || "";
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) if (en.isIntersecting) activate(en.target);
    },
    // On narrow screens the drawing is pinned over the top of the viewport, so the
    // reading line sits lower.
    { rootMargin: matchMedia("(max-width: 56rem)").matches ? "-66% 0px -30% 0px" : "-48% 0px -48% 0px" }
  );
  steps.forEach((s) => io.observe(s));
  activate(steps[0]);
});

// ------------------------------------------------------------------ charts
safely("charts", async () => {
  const { initCharts } = await import("./charts.js");
  initCharts();
});

// ------------------------------------------------------------------ poster viewer
safely("posters", async () => {
  const root = $("[data-posters]");
  if (!root) return;
  const { mountPosters } = await import("./posters.js");
  mountPosters(root, { base: BASE });
});

// ------------------------------------------------------------------ paper reader and source tags
safely("reader", async () => {
  const root = $("[data-reader]");
  if (!root) return;
  const { mountReader } = await import("./reader.js");
  // Open on the abstract (PDF page 2); the title page is one step up.
  const reader = mountReader(root, { base: BASE, doc: "full", page: 2, standalone: false, lazy: true });

  // A source tag opens the paper at that page, here on the page.
  document.addEventListener("click", (e) => {
    const tag = e.target.closest("a[data-doc][data-page]");
    if (!tag || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    Promise.resolve(reader.open(tag.dataset.doc, Number(tag.dataset.page))).catch((err) => {
      console.error("reader.open failed", err);
      location.href = tag.href;
    });
  });
});

// ------------------------------------------------------------------ deep links
// The poster viewer and reader change the page height after the browser has scrolled
// to #hash, so line the target up again once they are in place.
safely("hash", () => {
  if (location.hash.length < 2) return;
  let touched = false;
  for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) addEventListener(type, () => (touched = true), { once: true, passive: true });
  const align = () => {
    if (touched) return;
    let target = null;
    try {
      target = document.querySelector(location.hash);
    } catch {
      /* not a selector */
    }
    if (target) target.scrollIntoView({ behavior: "instant", block: "start" });
  };
  addEventListener("load", () => [500, 1500, 3000].forEach((ms) => setTimeout(align, ms)));
});
