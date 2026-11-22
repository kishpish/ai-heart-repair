// Embedded PDF reader. Renders the paper on the page with the vendored PDF.js
// (legacy build), so it also works where the browser has no inline PDF viewer
// (iPhone Safari). No build step; the document list lives in data/docs.js.
//
//   import { mountReader } from './js/reader.js';
//   const reader = mountReader(el, { base, doc: 'full', page: 1, lazy: true });
//   reader.open('full', 40);
//
// Memory is the constraint on phones: pages are sized up front as empty
// placeholders, drawn only near the viewport, capped in pixels, and released
// again once they are far away.

import { DOCS } from '../data/docs.js';

const PDFJS_URL = new URL('../vendor/pdfjs/pdf.min.mjs', import.meta.url).href;
const WORKER_URL = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const SITE_ROOT = new URL('../', import.meta.url).href;

const CSS_UNITS = 96 / 72; // CSS px per PDF point at 100%
const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const FIT_MAX = 1.25; // fit-width stops growing here so wide windows do not get poster-sized pages
const MAX_DPR = 2;
const MAX_CANVAS_PIXELS = 4000000; // iOS Safari canvas memory
const MAX_CANVASES = 6;
const LAZY_MARGIN = '800px 0px';
const RENDER_MARGIN = '100% 0px'; // one viewport above and below

const ICONS = {
  prev: '<path d="M3.5 10 8 5.5l4.5 4.5"/>',
  next: '<path d="M3.5 6 8 10.5 12.5 6"/>',
  minus: '<path d="M3 8h10"/>',
  plus: '<path d="M3 8h10M8 3v10"/>',
  fit: '<path d="M2 3v10M14 3v10M5 8h6M7 6 5 8l2 2M9 6l2 2-2 2"/>',
  download: '<path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10"/>',
  open: '<path d="M9.5 2.5h4v4M13.5 2.5l-5 5M6.5 3.5h-4v10h10v-4"/>',
};

let pdfjsPromise = null;
let mountCount = 0;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = WORKER_URL;
      return lib;
    });
    pdfjsPromise.catch(() => {
      pdfjsPromise = null; // allow a retry on the next open()
    });
  }
  return pdfjsPromise;
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value === false || value == null) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
  }
  if (children) {
    for (const child of children) {
      if (child) node.appendChild(child);
    }
  }
  return node;
}

function icon(name) {
  const span = document.createElement('span');
  span.innerHTML =
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
  return span.firstChild;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function toPage(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function freeCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
  canvas.remove();
}

function pdfLinks(base) {
  const list = el('ul', { class: 'reader__notice-links' });
  for (const doc of DOCS) {
    list.appendChild(
      el('li', null, [el('a', { href: new URL(doc.src, base).href, text: doc.label + ' (PDF)' })]),
    );
  }
  return list;
}

/**
 * Mount the reader into `root`, replacing its fallback content.
 * @param {HTMLElement} root  div[data-reader] holding no-JS fallback links
 * @param {{base?: string, doc?: string, page?: number, standalone?: boolean, lazy?: boolean}} [options]
 * @returns {{open: (docId: string, page?: number) => Promise<object>, getState: () => object, focus: () => void}}
 */
export function mountReader(root, options) {
  const opts = options || {};
  const fallback = root.innerHTML;
  try {
    return createReader(root, opts);
  } catch (err) {
    console.warn('[reader] could not start', err);
    return restoreFallback(root, fallback, opts);
  }
}

// The reader could not be built at all: put the original links back, add one
// plain line, and hand back a controller that does nothing.
function restoreFallback(root, fallback, opts) {
  let base = SITE_ROOT;
  try {
    base = new URL(opts.base || SITE_ROOT, document.baseURI).href;
  } catch (_) {
    /* keep the module-relative root */
  }
  root.innerHTML = fallback;
  const line = el('p', { class: 'reader-fail', text: 'The embedded reader could not start in this browser.' });
  root.appendChild(line);
  if (!root.querySelector('a[href$=".pdf"]')) {
    line.textContent += ' The PDFs open directly:';
    root.appendChild(pdfLinks(base));
  }
  const state = { doc: opts.doc || (DOCS[0] && DOCS[0].id) || '', page: 1, pages: 0, scale: 1, fit: true, failed: true };
  return {
    open: () => Promise.resolve({ ...state }),
    getState: () => ({ ...state }),
    focus: () => {},
  };
}

function createReader(root, opts) {
  if (!DOCS.length) throw new Error('No documents listed in data/docs.js');

  const base = new URL(opts.base || SITE_ROOT, document.baseURI).href;
  const standalone = !!opts.standalone;
  const uid = 'reader-' + ++mountCount;
  const findDoc = (id) => DOCS.find((d) => d.id === id);
  const first = findDoc(opts.doc) || DOCS[0];

  const state = {
    doc: first.id,
    page: toPage(opts.page),
    pages: first.pages || 0,
    scale: 1,
    fit: true,
  };

  // --- runtime ---------------------------------------------------------------
  let pdfjs = null;
  let pdf = null;
  let loadingTask = null;
  let loadToken = 0;
  let loadPromise = null;
  let started = false;
  let failed = false;
  let target = state.page; // page to show once the document is ready
  let zoom = 1; // used when not in fit mode
  let slots = [];
  let wanted = [];
  let near = new Set();
  let pageObserver = null;
  let layoutGen = 0;
  let rendering = null;
  let pin = 0; // page held at the top after a jump, until the visitor scrolls
  let expectedTop = -1;
  let scrollFrame = 0;
  let resizeTimer = 0;
  let lastWidth = 0;
  let lastDpr = window.devicePixelRatio || 1;
  let lastEmit = '';
  let inputDirty = false;
  const lastPage = {};

  // --- DOM ---------------------------------------------------------------------
  const docButtons = DOCS.map((doc) =>
    el('button', { type: 'button', class: 'reader__btn', 'aria-pressed': 'false', 'data-doc': doc.id, text: doc.label }),
  );
  const note = el('p', { class: 'reader__note' });

  const prevBtn = el('button', { type: 'button', class: 'reader__btn reader__btn--icon', 'aria-label': 'Previous page', title: 'Previous page' }, [
    icon('prev'),
  ]);
  const nextBtn = el('button', { type: 'button', class: 'reader__btn reader__btn--icon', 'aria-label': 'Next page', title: 'Next page' }, [
    icon('next'),
  ]);
  const input = el('input', {
    class: 'reader__input',
    id: uid + '-page',
    type: 'text',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    autocomplete: 'off',
    enterkeyhint: 'go',
    'aria-describedby': uid + '-total',
  });
  const totalNum = el('span');
  const total = el('span', { class: 'reader__total', id: uid + '-total' }, [
    el('span', { class: 'reader__slash', 'aria-hidden': 'true', text: '/' }),
    el('span', { class: 'visually-hidden', text: 'of ' }),
    totalNum,
  ]);

  const zoomOutBtn = el('button', { type: 'button', class: 'reader__btn reader__btn--icon', 'aria-label': 'Zoom out', title: 'Zoom out' }, [
    icon('minus'),
  ]);
  const zoomInBtn = el('button', { type: 'button', class: 'reader__btn reader__btn--icon', 'aria-label': 'Zoom in', title: 'Zoom in' }, [
    icon('plus'),
  ]);
  const pct = el('span', { class: 'reader__pct' });
  const fitBtn = el(
    'button',
    {
      type: 'button',
      class: 'reader__btn reader__btn--icon reader__btn--labelled',
      'aria-label': 'Fit width',
      title: 'Fit width',
      'aria-pressed': 'true',
    },
    [icon('fit'), el('span', { class: 'reader__btn-text', text: 'Fit width' })],
  );

  const downloadLink = el('a', { class: 'reader__btn reader__btn--icon reader__btn--labelled', title: 'Download' }, [
    icon('download'),
    el('span', { class: 'reader__btn-text', text: 'Download' }),
  ]);
  const fullLink = standalone
    ? null
    : el('a', { class: 'reader__btn reader__btn--icon reader__btn--labelled', 'aria-label': 'Open full page', title: 'Open full page' }, [
        icon('open'),
        el('span', { class: 'reader__btn-text', text: 'Open full page' }),
      ]);

  const bar = el('div', { class: 'reader__bar', role: 'group', 'aria-label': 'Reader controls' }, [
    el('div', { class: 'reader__row reader__row--a' }, [
      el('div', { class: 'reader__group reader__docs', role: 'group', 'aria-label': 'Document' }, docButtons),
      note,
      el('div', { class: 'reader__group reader__links' }, [downloadLink, fullLink]),
    ]),
    el('div', { class: 'reader__row reader__row--b' }, [
      el('div', { class: 'reader__group reader__pager', role: 'group', 'aria-label': 'Page' }, [
        prevBtn,
        el('div', { class: 'reader__field' }, [
          el('label', { class: 'reader__field-label', for: uid + '-page', text: 'Page' }),
          input,
          total,
        ]),
        nextBtn,
      ]),
      el('div', { class: 'reader__group reader__zoom', role: 'group', 'aria-label': 'Zoom' }, [
        zoomOutBtn,
        pct,
        zoomInBtn,
        fitBtn,
      ]),
    ]),
  ]);

  const progressFill = el('span');
  const progress = el('div', { class: 'reader__progress', 'aria-hidden': 'true' }, [progressFill]);

  const notice = el('div', { class: 'reader__notice' });
  const pagesEl = el('div', { class: 'reader__pages' });
  const viewport = el('div', { class: 'reader__viewport', tabindex: '0', role: 'region' }, [notice, pagesEl]);
  const status = el('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });

  const shell = el(
    'div',
    { class: 'reader film ' + (standalone ? 'reader--standalone' : 'reader--embedded'), 'data-state': 'idle' },
    [bar, progress, viewport, status],
  );

  // --- small helpers ---------------------------------------------------------
  const currentDoc = () => findDoc(state.doc);
  const say = (text) => {
    status.textContent = text;
  };
  const setDisabled = (btn, off) => {
    if (off) btn.setAttribute('aria-disabled', 'true');
    else btn.removeAttribute('aria-disabled');
  };
  const isOff = (btn) => btn.getAttribute('aria-disabled') === 'true';

  function showNotice(kind, doc, detail) {
    notice.textContent = '';
    notice.hidden = false;
    notice.className = 'reader__notice';
    if (kind === 'error') {
      notice.classList.add('reader__notice--error');
      notice.appendChild(
        el('p', { class: 'reader__notice-line', text: 'The reader could not load ' + doc.label + '.' }),
      );
      notice.appendChild(el('p', { class: 'reader__notice-text', text: 'The PDFs open directly:' }));
      notice.appendChild(pdfLinks(base));
      return;
    }
    const line = el('p', { class: 'reader__notice-line', text: kind === 'loading' ? 'Loading ' + doc.label : doc.label });
    line.appendChild(el('span', { class: 'reader__notice-num', text: detail || '' }));
    notice.appendChild(line);
  }

  function emit() {
    const key = state.doc + '|' + state.page + '|' + state.pages;
    if (key === lastEmit) return;
    lastEmit = key;
    root.dispatchEvent(
      new CustomEvent('reader:page', {
        bubbles: true,
        detail: { doc: state.doc, page: state.page, pages: state.pages },
      }),
    );
  }

  function syncDocUI() {
    const doc = currentDoc();
    for (const btn of docButtons) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-doc') === doc.id ? 'true' : 'false');
    }
    note.textContent = doc.note || '';
    downloadLink.href = new URL(doc.src, base).href;
    downloadLink.setAttribute('download', doc.download || '');
    downloadLink.setAttribute('aria-label', 'Download ' + doc.label + ' (PDF)');
    viewport.setAttribute('aria-label', doc.label + ', document pages');
  }

  function syncPageUI() {
    if (!inputDirty) input.value = String(state.page);
    totalNum.textContent = state.pages ? String(state.pages) : '\u2013';
    setDisabled(prevBtn, state.page <= 1);
    setDisabled(nextBtn, !!state.pages && state.page >= state.pages);
    progressFill.style.width = state.pages ? clamp((state.page / state.pages) * 100, 0, 100) + '%' : '0';
    if (fullLink) {
      const url = new URL('read.html', base);
      url.searchParams.set('doc', state.doc);
      url.searchParams.set('page', String(state.page));
      fullLink.href = url.href;
    }
    emit();
  }

  function syncZoomUI() {
    pct.textContent = pdf ? Math.round(state.scale * 100) + '%' : '\u2013';
    setDisabled(zoomInBtn, !pdf || stepFrom(1) == null);
    setDisabled(zoomOutBtn, !pdf || stepFrom(-1) == null);
    fitBtn.setAttribute('aria-pressed', state.fit ? 'true' : 'false');
  }

  function setPage(n) {
    if (n === state.page) return false;
    state.page = n;
    lastPage[state.doc] = n;
    syncPageUI();
    return true;
  }

  // --- layout ----------------------------------------------------------------
  function fitScale() {
    const width = viewport.clientWidth;
    if (!width || !slots.length) return state.scale || 1;
    const cs = getComputedStyle(pagesEl);
    const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const avail = width - pad - 2; // 1px page border each side
    return clamp(avail / (slots[0].bw * CSS_UNITS), 0.1, FIT_MAX);
  }

  function sizeSlot(slot) {
    slot.w = Math.max(1, Math.floor(slot.bw * CSS_UNITS * state.scale));
    slot.h = Math.max(1, Math.round(slot.bh * CSS_UNITS * state.scale));
    slot.el.style.width = slot.w + 'px';
    slot.el.style.height = slot.h + 'px';
  }

  function pageTop(n) {
    const slot = slots[n - 1];
    return slot && n > 1 ? Math.max(0, slot.el.offsetTop - 8) : 0;
  }

  function setScrollTop(y) {
    viewport.scrollTop = y;
    expectedTop = viewport.scrollTop;
  }

  // First slot whose bottom edge is below y.
  function indexAt(y) {
    let lo = 0;
    let hi = slots.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const node = slots[mid].el;
      if (node.offsetTop + node.offsetHeight > y) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  function getAnchor() {
    if (!slots.length) return null;
    if (pin) return { pin };
    const top = viewport.scrollTop;
    const i = indexAt(top);
    const node = slots[i].el;
    const into = top - node.offsetTop;
    // Above the page (in the gap or padding): keep the distance in pixels.
    if (into < 0) return { i, px: into };
    return { i, frac: into / Math.max(1, node.offsetHeight) };
  }

  function restoreAnchor(anchor) {
    if (!anchor || !slots.length) return;
    if (anchor.pin) {
      setScrollTop(pageTop(anchor.pin));
      return;
    }
    const node = slots[anchor.i].el;
    const into = anchor.px != null ? anchor.px : anchor.frac * node.offsetHeight;
    setScrollTop(Math.max(0, node.offsetTop + into));
  }

  // The page taking up most of the viewport. At the very end it is the last page.
  function computeCurrent() {
    if (!slots.length) return state.page;
    const top = viewport.scrollTop;
    const height = viewport.clientHeight;
    const bottom = top + height;
    if (top > 0 && bottom >= viewport.scrollHeight - 1) return slots.length;
    let best = indexAt(top);
    let bestArea = -1;
    for (let i = best; i < slots.length; i++) {
      const node = slots[i].el;
      const y = node.offsetTop;
      if (y >= bottom) break;
      const visible = Math.min(bottom, y + node.offsetHeight) - Math.max(top, y);
      if (visible > bestArea + 1) {
        bestArea = visible;
        best = i;
      }
    }
    return best + 1;
  }

  function relayout() {
    if (!pdf || !slots.length) return;
    const anchor = getAnchor();
    const centred = viewport.scrollWidth <= viewport.clientWidth + 1;
    const xFrac = centred ? 0.5 : (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth;
    state.scale = state.fit ? fitScale() : zoom;
    layoutGen++;
    for (const slot of slots) {
      cancelRender(slot);
      dropText(slot); // rebuilt with the page; a stale text layer would sit off the glyphs
      sizeSlot(slot);
    }
    restoreAnchor(anchor);
    viewport.scrollLeft = Math.max(0, xFrac * viewport.scrollWidth - viewport.clientWidth / 2);
    lastWidth = viewport.clientWidth;
    lastDpr = window.devicePixelRatio || 1;
    syncZoomUI();
    if (!pin) setPage(computeCurrent());
    schedule();
  }

  // --- rendering -------------------------------------------------------------
  function cancelRender(slot) {
    if (slot.task) {
      try {
        slot.task.cancel();
      } catch (_) {
        /* already finished */
      }
      slot.task = null;
    }
  }

  function dropText(slot) {
    if (slot.textTask) {
      try {
        slot.textTask.cancel();
      } catch (_) {
        /* already finished */
      }
      slot.textTask = null;
    }
    if (slot.text) {
      slot.text.remove();
      slot.text = null;
    }
  }

  function release(slot) {
    cancelRender(slot);
    dropText(slot);
    if (slot.canvas) {
      freeCanvas(slot.canvas);
      slot.canvas = null;
    }
    slot.gen = -1;
    slot.el.classList.remove('is-rendered');
    if (slot.page) {
      try {
        slot.page.cleanup();
      } catch (_) {
        /* a render is still winding down */
      }
    }
  }

  const needsRender = (slot) => slot.gen !== layoutGen && slot.failGen !== layoutGen;

  // Decide which pages should hold a canvas: those near the viewport, nearest
  // the current page first, at most MAX_CANVASES. Everything else is cancelled
  // or, once over the cap, released (farthest first).
  function schedule() {
    if (!pdf) return;
    const centre = state.page;
    const order = Array.from(near)
      .filter((n) => slots[n - 1])
      .sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b)
      .slice(0, MAX_CANVASES);
    const keep = new Set(order);
    wanted = order.map((n) => slots[n - 1]);

    const spare = [];
    for (const slot of slots) {
      if (keep.has(slot.n)) continue;
      cancelRender(slot);
      if (slot.canvas) spare.push(slot);
    }
    spare.sort((a, b) => Math.abs(b.n - centre) - Math.abs(a.n - centre));
    let over = spare.length + wanted.length - MAX_CANVASES;
    for (const slot of spare) {
      if (over <= 0) break;
      release(slot);
      over--;
    }
    pump();
  }

  function pump() {
    if (rendering || !pdf) return;
    const next = wanted.find(needsRender);
    if (!next) return;
    rendering = next;
    const done = () => {
      if (rendering === next) rendering = null;
      pump();
    };
    renderSlot(next).then(done, done);
  }

  async function renderSlot(slot) {
    const token = loadToken;
    const gen = layoutGen;
    const live = () => token === loadToken && gen === layoutGen && wanted.indexOf(slot) !== -1;
    let canvas = null;
    try {
      if (!slot.page) slot.page = await pdf.getPage(slot.n);
      if (!live()) return;
      const page = slot.page;

      // Each page's own size, learned the first time it is needed.
      const natural = page.getViewport({ scale: 1 });
      if (!slot.sized) {
        slot.sized = true;
        if (Math.abs(natural.width - slot.bw) > 0.5 || Math.abs(natural.height - slot.bh) > 0.5) {
          const anchor = getAnchor();
          slot.bw = natural.width;
          slot.bh = natural.height;
          sizeSlot(slot);
          restoreAnchor(anchor);
        }
      }

      const pageViewport = page.getViewport({ scale: slot.w / natural.width });
      let ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      if (slot.w * slot.h * ratio * ratio > MAX_CANVAS_PIXELS) {
        ratio = Math.sqrt(MAX_CANVAS_PIXELS / (slot.w * slot.h));
      }
      canvas = el('canvas', { class: 'reader__canvas', 'aria-hidden': 'true' });
      canvas.width = Math.max(1, Math.floor(slot.w * ratio));
      canvas.height = Math.max(1, Math.floor(slot.h * ratio));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas is not available');

      const task = page.render({
        canvasContext: ctx,
        viewport: pageViewport,
        transform: [canvas.width / pageViewport.width, 0, 0, canvas.height / pageViewport.height, 0, 0],
      });
      slot.task = task;
      await task.promise;
      if (slot.task === task) slot.task = null;
      if (!live()) {
        freeCanvas(canvas);
        return;
      }

      const old = slot.canvas;
      slot.canvas = canvas;
      slot.gen = gen;
      slot.el.insertBefore(canvas, slot.el.firstChild);
      slot.el.classList.add('is-rendered');
      freeCanvas(old);
      canvas = null;
      buildTextLayer(slot, page, pageViewport, token, gen);
    } catch (err) {
      freeCanvas(canvas);
      if (err && err.name === 'RenderingCancelledException') return;
      if (token !== loadToken) return;
      if (gen === layoutGen) {
        slot.failGen = gen;
        if (!slot.canvas) slot.num.textContent = 'Page ' + slot.n + ' could not be drawn.';
        console.warn('[reader] page ' + slot.n + ' failed to render', err);
      }
    }
  }

  // Selectable, screen-readable text over the canvas (PDF.js TextLayer).
  async function buildTextLayer(slot, page, pageViewport, token, gen) {
    const live = () => token === loadToken && gen === layoutGen && slot.gen === gen && slot.canvas;
    let layer = null;
    try {
      dropText(slot);
      const div = el('div', { class: 'textLayer' });
      // Horizontal scale of this box; PDF.js sizes the fonts from it.
      div.style.setProperty('--scale-factor', String(pageViewport.scale));
      layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: div,
        viewport: pageViewport,
      });
      slot.textTask = layer;
      // PDF.js sets the box from the unrounded viewport; pin it to the canvas box
      // instead so both scale together. The layer is laid out unrotated.
      const turned = pageViewport.rotation % 180 !== 0;
      div.style.width = (turned ? slot.h : slot.w) + 'px';
      div.style.height = (turned ? slot.w : slot.h) + 'px';
      await layer.render();
      if (slot.textTask === layer) slot.textTask = null;
      if (!live()) return;
      div.appendChild(el('div', { class: 'endOfContent' }));
      slot.el.appendChild(div);
      slot.text = div;
    } catch (_) {
      // Cancelled, or this page has no usable text: the canvas still shows it.
      if (layer && slot.textTask === layer) slot.textTask = null;
    }
  }

  // --- documents -------------------------------------------------------------
  function teardown() {
    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }
    for (const slot of slots) {
      cancelRender(slot);
      dropText(slot);
      freeCanvas(slot.canvas);
      slot.canvas = null;
    }
    slots = [];
    wanted = [];
    near = new Set();
    rendering = null;
    pin = 0;
    pagesEl.textContent = '';
    pdf = null;
    if (loadingTask) {
      const old = loadingTask;
      loadingTask = null;
      Promise.resolve()
        .then(() => old.destroy())
        .catch(() => {});
    }
  }

  function buildPages(firstPage) {
    const natural = firstPage.getViewport({ scale: 1 });
    const frag = document.createDocumentFragment();
    slots = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const num = el('span', { class: 'reader__page-num', 'aria-hidden': 'true', text: String(n) });
      const node = el('div', { class: 'reader__page', 'data-page': String(n), role: 'group', 'aria-label': 'Page ' + n }, [
        num,
      ]);
      slots.push({
        n,
        el: node,
        num,
        bw: natural.width,
        bh: natural.height,
        w: 0,
        h: 0,
        sized: n === 1,
        page: n === 1 ? firstPage : null,
        canvas: null,
        text: null,
        textTask: null,
        task: null,
        gen: -1,
        failGen: -1,
      });
      frag.appendChild(node);
    }
    notice.hidden = true;
    pagesEl.appendChild(frag);
    state.scale = state.fit ? fitScale() : zoom;
    layoutGen++;
    for (const slot of slots) sizeSlot(slot);
    lastWidth = viewport.clientWidth;

    pageObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number(entry.target.getAttribute('data-page'));
          if (entry.isIntersecting) near.add(n);
          else near.delete(n);
        }
        schedule();
      },
      { root: viewport, rootMargin: RENDER_MARGIN },
    );
    for (const slot of slots) pageObserver.observe(slot.el);
  }

  function load(docId) {
    const token = ++loadToken;
    const doc = findDoc(docId);
    teardown();
    started = true;
    failed = false;
    state.doc = doc.id;
    state.pages = doc.pages || 0;
    state.page = state.pages ? clamp(target, 1, state.pages) : target;
    inputDirty = false;
    shell.setAttribute('data-state', 'loading');
    syncDocUI();
    syncPageUI();
    syncZoomUI();
    showNotice('loading', doc);
    say('Loading ' + doc.label);

    const run = (async () => {
      try {
        const lib = await loadPdfjs();
        if (token !== loadToken) return;
        pdfjs = lib;
        const task = lib.getDocument({
          url: new URL(doc.src, base).href,
          enableXfa: false,
          // Fetch only the pages being read (range requests), not the whole file in the background.
          disableAutoFetch: true,
          disableStream: true,
          isEvalSupported: false,
        });
        loadingTask = task;
        task.onProgress = (p) => {
          if (token !== loadToken || !p || !p.total) return;
          const num = notice.querySelector('.reader__notice-num');
          if (num) num.textContent = Math.min(100, Math.round((p.loaded / p.total) * 100)) + '%';
        };
        const loaded = await task.promise;
        if (token !== loadToken) return;
        const firstPage = await loaded.getPage(1);
        if (token !== loadToken) return;

        pdf = loaded;
        state.pages = pdf.numPages;
        buildPages(firstPage);
        const n = clamp(target, 1, state.pages);
        target = n;
        pin = n;
        setScrollTop(pageTop(n));
        viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
        state.page = n;
        lastPage[state.doc] = n;
        shell.setAttribute('data-state', 'ready');
        syncPageUI();
        syncZoomUI();
        say(doc.label + ' loaded, ' + state.pages + ' pages');
        near.add(n); // draw the landing page without waiting for the observer
        schedule();
      } catch (err) {
        if (token !== loadToken) return;
        console.warn('[reader] could not load ' + doc.src, err);
        teardown();
        failed = true;
        shell.setAttribute('data-state', 'error');
        showNotice('error', doc);
        syncZoomUI();
        say('Could not load ' + doc.label + '. Direct links to the PDFs are shown instead.');
      }
    })();
    loadPromise = run;
    return run;
  }

  function goTo(page) {
    const n = state.pages ? clamp(toPage(page), 1, state.pages) : toPage(page);
    target = n;
    if (!pdf) {
      // Not loaded yet: remember the page; (re)start loading if nothing is in flight.
      setPage(n);
      if (!started || failed) return load(state.doc);
      return loadPromise || Promise.resolve();
    }
    pin = n;
    setScrollTop(pageTop(n));
    setPage(n);
    schedule();
    return Promise.resolve();
  }

  // Resolves once the newest load has settled, so a call that was overtaken
  // by a later one still reports the final state.
  function settled() {
    const pending = loadPromise;
    return Promise.resolve(pending).then(() => (loadPromise === pending ? undefined : settled()));
  }

  // Switch document if needed and bring `page` (a PDF page number) to the top
  // of the reader's viewport. Safe before the first load and when repeated.
  // Never rejects: failures are shown in the reader itself.
  function open(docId, page) {
    const doc = docId == null ? currentDoc() : findDoc(docId);
    if (!doc) {
      console.warn('[reader] unknown document id: ' + docId);
      return Promise.resolve(getState());
    }
    stopLazy();
    if (doc.id !== state.doc) {
      target = toPage(page);
      load(doc.id);
    } else {
      goTo(page == null ? state.page : page);
    }
    return settled().then(getState, getState);
  }

  function getState() {
    return { doc: state.doc, page: state.page, pages: state.pages, scale: state.scale, fit: state.fit };
  }

  // --- zoom ------------------------------------------------------------------
  function stepFrom(dir) {
    const now = state.scale;
    if (dir > 0) {
      const up = ZOOM_STEPS.find((s) => s > now + 0.005);
      return up == null ? null : up;
    }
    let down = null;
    for (const s of ZOOM_STEPS) {
      if (s < now - 0.005) down = s;
    }
    return down;
  }

  function zoomBy(dir) {
    if (!pdf) return;
    const next = stepFrom(dir);
    if (next == null) return;
    state.fit = false;
    zoom = next;
    relayout();
    say('Zoom ' + Math.round(state.scale * 100) + ' percent');
  }

  function zoomFit() {
    state.fit = true;
    if (!pdf) {
      syncZoomUI();
      return;
    }
    relayout();
    say('Fit width, ' + Math.round(state.scale * 100) + ' percent');
  }

  // --- events ----------------------------------------------------------------
  for (const btn of docButtons) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-doc');
      if (id === state.doc && (pdf || (started && !failed))) return;
      open(id, lastPage[id] || 1);
    });
  }
  prevBtn.addEventListener('click', () => {
    if (!isOff(prevBtn)) goTo(state.page - 1);
  });
  nextBtn.addEventListener('click', () => {
    if (!isOff(nextBtn)) goTo(state.page + 1);
  });
  zoomOutBtn.addEventListener('click', () => {
    if (!isOff(zoomOutBtn)) zoomBy(-1);
  });
  zoomInBtn.addEventListener('click', () => {
    if (!isOff(zoomInBtn)) zoomBy(1);
  });
  fitBtn.addEventListener('click', zoomFit);

  function commitInput() {
    const n = parseInt(input.value, 10);
    inputDirty = false;
    if (Number.isFinite(n) && n > 0) {
      stopLazy();
      goTo(n);
    }
    input.value = String(state.page);
  }
  input.addEventListener('input', () => {
    inputDirty = true;
  });
  input.addEventListener('change', commitInput);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitInput();
    } else if (event.key === 'Escape') {
      inputDirty = false;
      input.value = String(state.page);
    }
  });
  input.addEventListener('focus', () => {
    try {
      input.select();
    } catch (_) {
      /* not selectable in this browser */
    }
  });
  input.addEventListener('blur', () => {
    if (inputDirty) commitInput();
  });

  viewport.addEventListener(
    'scroll',
    () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        if (!pdf) return;
        if (pin && Math.abs(viewport.scrollTop - expectedTop) > 1) pin = 0;
        if (!pin && setPage(computeCurrent())) schedule();
      });
    },
    { passive: true },
  );

  viewport.addEventListener('keydown', (event) => {
    if (event.target !== viewport || event.ctrlKey || event.metaKey || event.altKey) return;
    const pageStep = Math.max(40, viewport.clientHeight * 0.9);
    switch (event.key) {
      case 'PageDown':
        viewport.scrollTop += pageStep;
        break;
      case 'PageUp':
        viewport.scrollTop -= pageStep;
        break;
      case 'Home':
        viewport.scrollTop = 0;
        break;
      case 'End':
        viewport.scrollTop = viewport.scrollHeight;
        break;
      case '+':
      case '=':
        zoomBy(1);
        break;
      case '-':
      case '_':
        zoomBy(-1);
        break;
      case '0':
        zoomFit();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  // Keep a drag selection from jumping when the pointer leaves the glyphs.
  viewport.addEventListener('pointerdown', (event) => {
    const layer = event.target && event.target.closest ? event.target.closest('.textLayer') : null;
    if (!layer) return;
    layer.classList.add('selecting');
    const end = () => {
      layer.classList.remove('selecting');
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  });

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!pdf) return;
        const width = viewport.clientWidth;
        const dpr = window.devicePixelRatio || 1;
        if (!width) return; // hidden
        const widthChanged = Math.abs(width - lastWidth) >= 1;
        if (dpr !== lastDpr || (widthChanged && state.fit && Math.abs(fitScale() - state.scale) > 0.001)) {
          relayout();
        } else if (widthChanged) {
          lastWidth = width;
        }
      }, 150);
    }).observe(viewport);
  }

  // --- start -----------------------------------------------------------------
  let lazyObserver = null;
  function stopLazy() {
    if (lazyObserver) {
      lazyObserver.disconnect();
      lazyObserver = null;
    }
  }

  syncDocUI();
  syncZoomUI();
  input.value = String(state.page);
  totalNum.textContent = state.pages ? String(state.pages) : '\u2013';
  setDisabled(prevBtn, state.page <= 1);
  progressFill.style.width = state.pages ? clamp((state.page / state.pages) * 100, 0, 100) + '%' : '0';
  if (fullLink) {
    const url = new URL('read.html', base);
    url.searchParams.set('doc', state.doc);
    url.searchParams.set('page', String(state.page));
    fullLink.href = url.href;
  }
  showNotice('idle', first, first.note || '');

  root.textContent = '';
  root.appendChild(shell);

  if (opts.lazy && typeof IntersectionObserver === 'function') {
    lazyObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          stopLazy();
          if (!started) load(state.doc);
        }
      },
      { rootMargin: LAZY_MARGIN },
    );
    lazyObserver.observe(root);
  } else {
    load(state.doc);
  }

  return {
    open,
    getState,
    focus() {
      try {
        viewport.focus({ preventScroll: true });
      } catch (_) {
        viewport.focus();
      }
    },
  };
}
