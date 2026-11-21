// Charts are built from data/results.js as plain HTML (positioned marks on a
// track), so labels stay real text and reflow at any width. Each chart container
// ships with a <table> of the same numbers; it becomes the "Data table" view.

import { PATIENTS, MIN_DEPOTS, SEALED_SUMMARY, CASCADE, TARGET_DEFINITION, STIFFNESS } from "../data/results.js";

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
};

const signed = (v, digits = 3) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(digits);
const pct = (x) => `${(x * 100).toFixed(2)}%`;

// Move the fallback table into a disclosure and return the node to render into.
function prepare(root) {
  const table = root.querySelector(".chart__table");
  const body = h("div", { class: "chart__body" });
  if (table) {
    const wrap = h("details", { class: "chart__data" }, h("summary", {}, "Data table"), h("div", { class: "chart__scroll" }));
    table.before(body);
    table.after(wrap);
    wrap.querySelector(".chart__scroll").append(table);
  } else {
    root.append(body);
  }
  return body;
}

function axis(ticks, scale, name) {
  return h(
    "div",
    { class: "cx-axis", "aria-hidden": "true" },
    h("span"),
    h("div", { class: "cx-axis__track" }, ticks.map((t) => h("span", { class: "cx-tick", style: `left:${pct(scale(t.v))}` }, t.label))),
    h("span"),
    name ? h("p", { class: "cx-axis__name" }, name) : null
  );
}

// ---------------------------------------------------------------- sealed (Table 11)
function sealed(root) {
  const body = prepare(root);
  const lo = 0.7;
  const hi = 1.0;
  const x = (v) => (v - lo) / (hi - lo);
  const rows = PATIENTS.filter((p) => p.outcome === "designed").sort((a, b) => (a.role === b.role ? b.rho - a.rho : a.role === "unseen" ? -1 : 1));

  body.style.setProperty("--cx-aside", "12.5rem");
  body.append(
    h(
      "ul",
      { class: "cx-legend" },
      h("li", {}, h("i", { class: "cx-key cx-key--unseen" }), "Patient absent from training"),
      h("li", {}, h("i", { class: "cx-key" }), "Training patient"),
      h("li", {}, h("i", { class: "cx-key cx-key--line" }), `All 210 arms pooled: ${SEALED_SUMMARY.pooled.rho.toFixed(3)}`)
    )
  );
  const list = h("div", { class: "cx-rows", role: "list" });
  for (const p of rows) {
    list.append(
      h(
        "div",
        { class: "cx-row", role: "listitem" },
        h("span", { class: "cx-label" }, p.id, h("small", {}, p.role === "unseen" ? "absent from training" : "training")),
        h(
          "span",
          { class: "cx-track" },
          h("i", { class: `cx-dot${p.role === "unseen" ? " cx-dot--unseen" : ""}`, style: `left:${pct(x(p.rho))}` }),
          h("b", { class: "cx-val cx-val--left", style: `left:${pct(x(p.rho))}` }, p.rho.toFixed(3))
        ),
        h("span", { class: "cx-aside" }, `${p.arms} arms · bias ${signed(p.bias)} mL`)
      )
    );
  }
  list.append(
    h(
      "div",
      { class: "cx-ref", "aria-hidden": "true" },
      h("div", { class: "cx-ref__track" }, h("i", { class: "cx-ref__line", style: `left:${pct(x(SEALED_SUMMARY.pooled.rho))}` }))
    )
  );
  body.append(list);
  body.append(
    axis(
      [0.7, 0.8, 0.9, 1.0].map((v) => ({ v, label: v.toFixed(2) })),
      x,
      "Spearman rank correlation, sealed prediction against solved outcome (axis starts at 0.70)"
    )
  );
}

// ---------------------------------------------------------------- cascade (Algorithm 6)
function cascade(root) {
  const body = prepare(root);
  const sup = (n) => (n === 0 ? "1" : n === 1 ? "10" : `10<sup>${n}</sup>`);
  const detail = h("div", { class: "cascade__detail", "aria-live": "polite" });
  const list = h("ol", { class: "cascade__list" });
  const buttons = [];
  const show = (i) => {
    const st = CASCADE[i];
    buttons.forEach((b, j) => b.setAttribute("aria-pressed", String(i === j)));
    detail.replaceChildren(
      h("h5", {}, st.name),
      h("p", {}, st.detail),
      h("p", { class: "cascade__count", html: i === 0 ? `${sup(st.exp)} candidates enter` : `${sup(CASCADE[i - 1].exp)} in, ${sup(st.exp)} out` })
    );
  };
  CASCADE.forEach((st, i) => {
    const btn = h(
      "button",
      { class: "cascade__btn", type: "button", "aria-pressed": "false" },
      h("span", { class: "cascade__name" }, st.name),
      h("span", { class: "cascade__bar" }, h("i", { style: `width:${pct((st.exp / 7) * 0.86)}` }), h("b", { style: `left:${pct((st.exp / 7) * 0.86)}`, html: sup(st.exp) }))
    );
    btn.addEventListener("click", () => show(i));
    buttons.push(btn);
    list.append(h("li", {}, btn));
  });
  body.append(h("div", { class: "cascade" }, list, detail));
  show(0);
}

// ---------------------------------------------------------------- stiffness (Section 11.8)
function stiffness(root) {
  const body = prepare(root);
  const lo = -0.6;
  const hi = 1.9;
  const x = (v) => (v - lo) / (hi - lo);
  const list = h("div", { class: "cx-rows", role: "list" });
  STIFFNESS.forEach((s, i) => {
    list.append(
      h(
        "div",
        { class: "cx-row", role: "listitem" },
        h("span", { class: "cx-label" }, s.modulus, h("small", {}, s.role)),
        h(
          "span",
          { class: "cx-track" },
          h("i", { class: `cx-range${i === 1 ? " cx-range--good" : ""}`, style: `left:${pct(x(s.lo))};width:${pct(x(s.hi) - x(s.lo))}` }),
          h("b", { class: "cx-end cx-end--lo", style: `left:${pct(x(s.lo))}` }, signed(s.lo)),
          h("b", { class: "cx-end cx-end--hi", style: `left:${pct(x(s.hi))}` }, signed(s.hi))
        ),
        h("span")
      )
    );
  });
  list.append(
    h("div", { class: "cx-ref", "aria-hidden": "true" }, h("div", { class: "cx-ref__track" }, h("i", { class: "cx-ref__line cx-ref__line--plain", style: `left:${pct(x(0))}` })))
  );
  body.append(list);
  body.append(
    axis(
      [-0.5, 0, 0.5, 1.0, 1.5].map((v) => ({ v, label: v === 0 ? "0 (no change)" : signed(v, 1) })),
      x,
      "Change in end-systolic volume, mL. Left of zero is a benefit."
    )
  );
}

// ---------------------------------------------------------------- target definition (Table 8)
function target(root) {
  const body = prepare(root);
  const lo = Math.log10(0.04);
  const hi = Math.log10(60);
  const x = (v) => (Math.log10(v) - lo) / (hi - lo);
  const T = TARGET_DEFINITION;
  const lane = (label, sub, pts, kind, pooled) =>
    h(
      "div",
      { class: "cx-row", role: "listitem", style: "min-height:4.2rem" },
      h("span", { class: "cx-label", style: "font-family:var(--f-display);font-stretch:80%;font-weight:650;font-size:.95rem" }, label, h("small", {}, sub)),
      h(
        "span",
        { class: "cx-track", style: "height:4.2rem" },
        pts.map((p) => h("i", { class: `cx-dot cx-dot--${kind}`, style: `left:${pct(x(p.ratio))}`, title: `${p.id}: error ${p.error} mL, ${p.ratio} of the spread` })),
        h("b", { class: "cx-val cx-val--above", style: `left:${pct(x(pooled))}` }, `pooled ${pooled}`)
      ),
      h("span")
    );
  body.append(
    h(
      "ul",
      { class: "cx-legend" },
      h("li", {}, h("i", { class: "cx-key cx-key--bad" }), "Trained on absolute volume"),
      h("li", {}, h("i", { class: "cx-key cx-key--good" }), "Trained on change from the patient’s own baseline")
    )
  );
  const list = h("div", { class: "cx-rows", role: "list" });
  list.append(
    lane("Absolute", "0 of 3 folds usable", T.absolute, "bad", T.pooled.absolute),
    lane("Relative", "4 of 4 usable", T.relative, "good", T.pooled.relative),
    h(
      "div",
      { class: "cx-ref", "aria-hidden": "true" },
      h(
        "div",
        { class: "cx-ref__track" },
        h("i", { class: "cx-ref__zone", style: `left:0;width:${pct(x(T.threshold))}` }, h("span", {}, "usable")),
        h("i", { class: "cx-ref__line cx-ref__line--plain", style: `left:${pct(x(T.threshold))}` })
      )
    )
  );
  body.append(list);
  body.append(
    axis(
      [0.05, 0.5, 5, 50].map((v) => ({ v, label: String(v) })),
      x,
      "Held-out error ÷ within-patient design spread (log scale)"
    )
  );
}

// ---------------------------------------------------------------- patients (Tables 5, 11, 15, 16, 17)
function patients(root) {
  const body = prepare(root);
  const verdict = { designed: "Designed and verified", none: "No deliverable design", unscoreable: "Deliverable, but not scoreable" };
  const card = h("div", { class: "pt__card", "aria-live": "polite" });
  const list = h("ol", { class: "pt__list" });
  const buttons = [];
  const pool = ([a, b]) => `${a} of ${b.toLocaleString("en-US")}`;

  const show = (i) => {
    const p = PATIENTS[i];
    buttons.forEach((b, j) => b.setAttribute("aria-pressed", String(i === j)));
    const cell = (k, v, small) => h("div", {}, h("dt", {}, k), h("dd", {}, v, small ? h("small", {}, ` ${small}`) : null));
    const why =
      p.outcome === "designed"
        ? `${p.arms} verification arms solved. Sealed prediction against outcome: rank correlation ${p.rho.toFixed(3)}${p.role === "unseen" ? ", with no training data from this patient" : ""}.`
        : p.note;
    card.replaceChildren(
      h("h6", {}, p.id),
      h("p", { class: "pt__verdict", "data-outcome": p.outcome }, verdict[p.outcome]),
      h("p", { class: "pt__why" }, why),
      h(
        "dl",
        { class: "pt__grid" },
        cell("Depots the border zone holds", String(p.depots5), `at 5 mm spacing; ${p.depots10} at 10 mm`),
        cell("Border-zone sites over 6 mm thick", `${p.clearFloorPct}%`, `${p.clearFloor.toLocaleString("en-US")} of ${p.bzSites.toLocaleString("en-US")}`),
        cell("Border-zone thickness", `${p.bzMedian.toFixed(2)} mm`, `median; max ${p.bzMax.toFixed(2)}`),
        cell("Scar / border zone", `${p.scar}% / ${p.bz}%`, "of wall volume"),
        cell("Baseline ejection fraction", `${p.efUntreated}%`, "model, matched pressures"),
        cell("Fitted peak tension", `${p.t0} kPa`),
        cell("End-diastolic volume", `${p.edvModel.toFixed(1)} mL`, `model; imaged ${p.edvImaged.toFixed(1)}`),
        cell("End-systolic volume", `${p.esvModel.toFixed(1)} mL`, `model; imaged ${p.esvImaged.toFixed(1)}`),
        cell("Feasible scattered designs", pool(p.scattered), "drawn")
      )
    );
  };

  PATIENTS.forEach((p, i) => {
    const strip = h("span", { class: "pt__strip", "aria-hidden": "true" });
    for (let k = 0; k < 43; k++) strip.append(h("i", { class: k < p.depots5 ? "on" : "" }));
    const btn = h(
      "button",
      { class: "pt__btn", type: "button", "aria-pressed": "false", "data-outcome": p.outcome, "aria-label": `${p.id}: border zone holds ${p.depots5} depots. ${verdict[p.outcome]}.` },
      h("span", { class: "pt__id" }, p.id),
      strip,
      h("span", { class: "pt__n" }, String(p.depots5))
    );
    btn.addEventListener("click", () => show(i));
    buttons.push(btn);
    list.append(h("li", {}, btn));
  });

  body.append(
    h(
      "div",
      { class: "pt" },
      h(
        "div",
        {},
        list,
        h(
          "ul",
          { class: "pt__keys" },
          h("li", {}, h("i", { class: "k-min" }), `Minimum of ${MIN_DEPOTS}`),
          h("li", {}, h("i", {}), "Designed"),
          h("li", {}, h("i", { class: "k-none" }), "No feasible design"),
          h("li", {}, h("i", { class: "k-uns" }), "Not scoreable")
        )
      ),
      card
    )
  );
  show(3); // open on the patient whose anatomy rules a design out
}

const BUILDERS = { sealed, cascade, stiffness, target, patients };

export function initCharts(scope = document) {
  for (const root of scope.querySelectorAll("[data-chart]")) {
    const build = BUILDERS[root.dataset.chart];
    if (!build) continue;
    try {
      build(root);
    } catch (err) {
      console.error("chart failed:", root.dataset.chart, err);
    }
  }
}
