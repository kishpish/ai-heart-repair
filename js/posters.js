// Poster viewer: the two science-fair panels as Deep Zoom pyramids in OpenSeadragon.
//
//   import { mountPosters } from './posters.js';
//   const posters = mountPosters(document.querySelector('[data-posters]'), {
//     base: new URL('./', document.baseURI).href, // site root; data/docs.js paths resolve against it
//   });
//   posters.show('txsef-2'); // switch panel from elsewhere on the page
//
// The root arrives holding no-JS fallback figures. They are replaced by the viewer
// chrome straight away (with a preview image, so the section paints at once) and
// OpenSeadragon itself is only fetched when the root comes near the viewport.
// If OpenSeadragon cannot load or open a panel, the fallback figures are put back.

import { POSTER_PANELS, POSTER_PDF } from '../data/docs.js';

const OSD_SRC = new URL('../vendor/openseadragon/openseadragon.min.js', import.meta.url).href;
const SITE_ROOT = new URL('../', import.meta.url).href;

const LAZY_MARGIN = 600; // px from the viewport at which OpenSeadragon is fetched
const ZOOM_STEP = 1.6; // per press of a zoom button (mouse)
const ZOOM_STEP_TOUCH = 2; // phones start far further out, so each tap goes further
const MAX_PIXEL_RATIO = 2; // deepest zoom: 200% of native resolution
const NAVIGATOR_MIN_WIDTH = 900; // the overview map is only shown on stages this wide
const NAVIGATOR_MIN_ZOOM = 1.6; // ...and only once zoomed this far past the whole-poster view

const ICONS = {
  plus: '<path d="M8 2.5v11M2.5 8h11"/>',
  minus: '<path d="M2.5 8h11"/>',
  reset: '<path d="M3.2 9.2a5 5 0 1 0 1-4.4"/><path d="M3.4 2v3.2h3.2"/>',
  expand: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
  contract: '<path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5"/>',
  close: '<path d="M3 3l10 10M13 3L3 13"/>',
  download: '<path d="M8 2v8.5M4.5 7.5 8 11l3.5-3.5M2.5 13.5h11"/>',
};

let osdPromise = null;
let instances = 0;

function loadOpenSeadragon() {
  if (typeof window.OpenSeadragon === 'function') return Promise.resolve(window.OpenSeadragon);
  if (!osdPromise) {
    osdPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = OSD_SRC;
      script.async = true;
      script.onload = () => {
        if (typeof window.OpenSeadragon === 'function') resolve(window.OpenSeadragon);
        else reject(new Error('OpenSeadragon loaded but did not initialise'));
      };
      script.onerror = () => {
        osdPromise = null;
        script.remove();
        reject(new Error('OpenSeadragon could not be loaded'));
      };
      document.head.append(script);
    });
  }
  return osdPromise;
}

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
  }
  node.append(...children.filter((child) => child != null));
  return node;
}

function icon(name) {
  const span = document.createElement('span');
  span.className = 'poster-viewer__icon';
  span.setAttribute('aria-hidden', 'true');
  // Static markup from the ICONS table above; never data.
  span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" focusable="false">${ICONS[name]}</svg>`;
  return span;
}

function setIcon(holder, name) {
  holder.querySelector('.poster-viewer__icon').replaceWith(icon(name));
}

function fileName(path) {
  return path.split('/').pop();
}

export function mountPosters(root, options = {}) {
  const noop = { show: () => false };
  if (!root || !POSTER_PANELS.length) return noop;

  const base = new URL(options.base || SITE_ROOT, document.baseURI).href;
  const url = (path) => new URL(path, base).href;
  const uid = `poster-viewer-${++instances}`;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fallback = Array.from(root.childNodes);
  const fallbackImages = Array.from(root.querySelectorAll('figure img'));

  const state = {
    index: 0,
    mode: 'inline', // 'inline' | 'fullscreen' | 'window'
    OSD: null,
    viewer: null,
    opener: null,
    failed: false,
    wantViewer: !coarse, // fine pointers get the live viewer as soon as it has loaded
    scrollLock: null,
    hintTimer: 0,
    opening: false, // true from viewer.open() until the 'open' event
  };
  const panel = () => POSTER_PANELS[state.index];
  let observer = null; // watches for the root coming near the viewport

  // --- chrome --------------------------------------------------------------

  const tabs = POSTER_PANELS.map((p, i) => {
    const tab = el(
      'button',
      { type: 'button', class: 'poster-viewer__tab', 'aria-pressed': i === 0 ? 'true' : 'false' },
      el('span', { class: 'poster-viewer__tab-label', text: p.label }),
      el('span', { class: 'poster-viewer__tab-cap', text: p.caption }),
    );
    tab.addEventListener('click', () => select(i));
    return tab;
  });

  const closeBtn = el(
    'button',
    { type: 'button', class: 'poster-viewer__btn poster-viewer__close', hidden: true },
    icon('close'),
    el('span', { class: 'poster-viewer__btn-text', text: 'Close' }),
  );

  const help = el('p', {
    id: `${uid}-help`,
    class: 'poster-viewer__sr',
    text:
      'Zoomable poster. With keyboard focus on the poster, the arrow keys pan, plus and minus zoom in and out, and 0 resets the view. With a mouse, drag to pan and double-click to zoom in. With touch, pinch to zoom. On the page the mouse wheel scrolls as usual; hold Control or Command to zoom with it. In full screen the wheel zooms.',
  });

  const preview = el('div', { class: 'poster-viewer__preview' });
  const osdHost = el('div', { class: 'poster-viewer__osd' });
  const exploreBtn = el(
    'button',
    { type: 'button', class: 'poster-viewer__explore' },
    icon('expand'),
    el('span', { text: 'Explore the poster' }),
  );
  const hint = el('p', { class: 'poster-viewer__hint', 'aria-hidden': 'true' });
  const stage = el(
    'div',
    { class: 'poster-viewer__stage', role: 'group', 'aria-describedby': help.id },
    preview,
    osdHost,
    exploreBtn,
    hint,
  );

  const zoomInBtn = el(
    'button',
    { type: 'button', class: 'poster-viewer__btn poster-viewer__btn--icon', 'aria-label': 'Zoom in', title: 'Zoom in' },
    icon('plus'),
  );
  const zoomOutBtn = el(
    'button',
    { type: 'button', class: 'poster-viewer__btn poster-viewer__btn--icon', 'aria-label': 'Zoom out', title: 'Zoom out' },
    icon('minus'),
  );
  const zoomValue = el('span', { class: 'poster-viewer__zoom-value', 'aria-hidden': 'true', text: '' });
  const zoomStatus = el('span', { class: 'poster-viewer__sr', role: 'status' });
  const zoomReadout = el(
    'span',
    { class: 'poster-viewer__zoom', title: 'Zoom, as a percentage of the poster’s native resolution' },
    zoomValue,
    zoomStatus,
  );
  const resetBtn = el(
    'button',
    { type: 'button', class: 'poster-viewer__btn poster-viewer__btn--label', 'aria-label': 'Reset view', title: 'Reset view' },
    icon('reset'),
    el('span', { class: 'poster-viewer__btn-text', text: 'Reset view' }),
  );
  const fullBtn = el(
    'button',
    { type: 'button', class: 'poster-viewer__btn poster-viewer__btn--label poster-viewer__full', 'aria-label': 'Full screen', title: 'Full screen' },
    icon('expand'),
    el('span', { class: 'poster-viewer__btn-text', text: 'Full screen' }),
  );
  const tools = el(
    'div',
    { class: 'poster-viewer__tools', role: 'group', 'aria-label': 'Poster view' },
    zoomInBtn,
    zoomOutBtn,
    zoomReadout,
    resetBtn,
    fullBtn,
  );

  const pdfLink = el(
    'a',
    { class: 'poster-viewer__btn poster-viewer__link', href: url(POSTER_PDF), download: fileName(POSTER_PDF) },
    icon('download'),
    el('span', { text: 'Poster PDF' }),
  );
  const jpegLink = el(
    'a',
    { class: 'poster-viewer__btn poster-viewer__link' },
    icon('download'),
    el('span', { text: 'This panel, full-size JPEG' }),
  );
  const links = el('div', { class: 'poster-viewer__links' }, pdfLink, jpegLink);

  const captionCount = el('span', { class: 'poster-viewer__caption-n' });
  const captionText = el('span', { class: 'poster-viewer__caption-text' });
  const captionSize = el('span', { class: 'poster-viewer__caption-px' });
  const caption = el('p', { class: 'poster-viewer__caption' }, captionCount, captionText, captionSize);

  const frame = el(
    'div',
    { class: 'poster-viewer', 'data-input': coarse ? 'coarse' : 'fine', 'data-mode': 'inline', 'data-live': 'false' },
    el(
      'div',
      { class: 'poster-viewer__head' },
      el('div', { class: 'poster-viewer__tabs', role: 'group', 'aria-label': 'Poster panel' }, ...tabs),
      closeBtn,
    ),
    stage,
    help,
    el('div', { class: 'poster-viewer__bar' }, tools, links),
    caption,
  );

  // --- panel-dependent content ----------------------------------------------

  function previewImage(i) {
    const p = POSTER_PANELS[i];
    const img = el('img', { alt: '', decoding: 'async', loading: 'lazy', draggable: 'false' });
    const source = fallbackImages[i];
    const srcset = source && source.getAttribute('srcset');
    if (source && source.getAttribute('src')) {
      // Reuse whatever the fallback already asked the browser for, so nothing is fetched twice.
      if (srcset) img.setAttribute('srcset', srcset);
      if (srcset && source.getAttribute('sizes')) img.setAttribute('sizes', source.getAttribute('sizes'));
      img.src = source.src;
    } else if (coarse) {
      // The preview stays on screen until the reader opens the viewer.
      img.setAttribute('srcset', `${url(p.previewSmall)} 1200w, ${url(p.preview)} 2400w`);
      img.setAttribute('sizes', '100vw');
      img.src = url(p.previewSmall);
    } else {
      img.src = url(p.previewSmall); // replaced by tiles within moments
    }
    return img;
  }

  function renderPanel() {
    const p = panel();
    tabs.forEach((tab, i) => tab.setAttribute('aria-pressed', i === state.index ? 'true' : 'false'));
    stage.setAttribute('aria-label', p.alt);
    preview.replaceChildren(previewImage(state.index));
    preview.hidden = false;
    jpegLink.href = url(p.full);
    jpegLink.setAttribute('download', fileName(p.full));
    captionCount.textContent = `${state.index + 1}/${POSTER_PANELS.length}`;
    captionText.textContent = p.caption;
    captionSize.textContent = `${p.width} × ${p.height} px`;
    labelCanvas();
  }

  function labelCanvas() {
    const viewer = state.viewer;
    if (!viewer || !viewer.canvas) return;
    viewer.canvas.setAttribute('role', 'application');
    viewer.canvas.setAttribute('aria-roledescription', 'zoomable image');
    viewer.canvas.setAttribute('aria-label', `Poster, ${panel().label}. ${panel().caption}`);
    viewer.canvas.setAttribute('aria-describedby', help.id);
  }

  function select(i) {
    if (state.failed || i === state.index || !POSTER_PANELS[i]) return;
    state.index = i;
    renderPanel();
    if (state.viewer) {
      try {
        state.opening = true;
        state.viewer.open(url(panel().dzi)); // opens at the home view
      } catch (error) {
        fail(error);
      }
    }
    updateZoom(true);
  }

  // --- zoom readout and controls ---------------------------------------------

  function setDisabled(button, disabled) {
    if (disabled) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  }
  const isDisabled = (button) => button.getAttribute('aria-disabled') === 'true';

  function liveItem() {
    const viewer = state.viewer;
    return viewer && viewer.viewport && viewer.world.getItemCount() ? viewer.world.getItemAt(0) : null;
  }

  // 1 = one image pixel per CSS pixel.
  function nativeZoom() {
    const item = liveItem();
    if (item) return item.viewportToImageZoom(state.viewer.viewport.getZoom(true));
    const box = stage.getBoundingClientRect();
    const p = panel();
    return Math.min(box.width / p.width, box.height / p.height);
  }

  function updateZoom(settled) {
    const percent = Math.round(nativeZoom() * 100);
    const text = Number.isFinite(percent) && percent > 0 ? `${percent}%` : '';
    if (zoomValue.textContent !== text) zoomValue.textContent = text;
    if (settled && text && liveItem()) {
      const spoken = `Zoom ${percent} percent`;
      if (zoomStatus.textContent !== spoken) zoomStatus.textContent = spoken;
    }
    const item = liveItem();
    if (!item) {
      [zoomInBtn, zoomOutBtn, resetBtn].forEach((b) => setDisabled(b, true));
      return;
    }
    const vp = state.viewer.viewport;
    const target = vp.getZoom(false);
    if (settled) keepCentred();
    setDisabled(zoomInBtn, target >= vp.getMaxZoom() * 0.999);
    setDisabled(zoomOutBtn, target <= vp.getMinZoom() * 1.001);
    setDisabled(resetBtn, false);
    if (state.viewer.navigator) {
      // The overview map only earns its place once part of the poster is off screen.
      state.viewer.navigator.element.classList.toggle('is-idle', target < vp.getHomeZoom() * NAVIGATOR_MIN_ZOOM);
    }
  }

  // Along any axis where the whole poster fits in the stage there is nothing to pan to, so
  // the poster stays centred on that axis instead of sliding about in the margin.
  function keepCentred() {
    const viewer = state.viewer;
    if (!liveItem()) return;
    const vp = viewer.viewport;
    const view = vp.getBounds(false);
    const home = vp.getHomeBounds();
    const fitsX = view.width >= home.width * 0.999;
    const fitsY = view.height >= home.height * 0.999;
    viewer.panHorizontal = !fitsX;
    viewer.panVertical = !fitsY;
    const centre = vp.getCenter(false);
    const x = fitsX ? home.x + home.width / 2 : centre.x;
    const y = fitsY ? home.y + home.height / 2 : centre.y;
    if (Math.abs(x - centre.x) > 1e-6 || Math.abs(y - centre.y) > 1e-6) {
      vp.panTo(new state.OSD.Point(x, y));
    }
  }

  function zoomBy(factor) {
    if (!liveItem()) return;
    const vp = state.viewer.viewport;
    const next = Math.min(vp.getMaxZoom(), Math.max(vp.getMinZoom(), vp.getZoom(false) * factor));
    vp.zoomTo(next);
    vp.applyConstraints();
  }

  const step = coarse ? ZOOM_STEP_TOUCH : ZOOM_STEP;
  zoomInBtn.addEventListener('click', () => !isDisabled(zoomInBtn) && zoomBy(step));
  zoomOutBtn.addEventListener('click', () => !isDisabled(zoomOutBtn) && zoomBy(1 / step));
  resetBtn.addEventListener('click', () => {
    if (isDisabled(resetBtn) || !liveItem()) return;
    state.viewer.viewport.goHome();
  });

  // --- OpenSeadragon -----------------------------------------------------------

  function token(name, fallbackValue) {
    return getComputedStyle(frame).getPropertyValue(name).trim() || fallbackValue;
  }

  function showHint(text) {
    hint.textContent = text;
    hint.classList.add('is-shown');
    clearTimeout(state.hintTimer);
    state.hintTimer = setTimeout(() => hint.classList.remove('is-shown'), 2200);
  }

  // Inline, the page keeps the wheel and one-finger drags; in full screen the poster takes them.
  function applyGestureMode() {
    const viewer = state.viewer;
    if (!viewer) return;
    const immersive = state.mode !== 'inline';
    viewer.gestureSettingsMouse.scrollToZoom = immersive;
    viewer.setCooperativeGestures(!immersive);
  }

  function createViewer() {
    if (state.viewer || state.failed || !state.OSD) return;
    const OSD = state.OSD;
    const still = reducedMotion.matches;
    const immersive = state.mode !== 'inline';
    const wide = !coarse && stage.clientWidth >= NAVIGATOR_MIN_WIDTH;
    let viewer;
    try {
      viewer = OSD({
        element: osdHost,
        tileSources: url(panel().dzi),
        // Our own buttons drive the viewport; OpenSeadragon's image buttons are never built.
        showNavigationControl: false,
        showSequenceControl: false,
        showNavigator: wide,
        navigatorPosition: 'BOTTOM_RIGHT',
        navigatorWidth: '148px', // 4:3, like the panels
        navigatorHeight: '111px',
        navigatorAutoFade: false,
        navigatorOpacity: 1,
        navigatorBackground: token('--film', 'transparent'),
        navigatorBorderColor: token('--film-rule', 'currentColor'),
        navigatorDisplayRegionColor: token('--gel-lt', 'currentColor'),
        visibilityRatio: 1,
        constrainDuringPan: true,
        minZoomImageRatio: 1,
        maxZoomPixelRatio: MAX_PIXEL_RATIO,
        zoomPerClick: 2,
        animationTime: still ? 0 : 0.7,
        springStiffness: still ? 1000 : 8,
        cooperativeGestures: !immersive,
        gestureSettingsMouse: {
          scrollToZoom: immersive,
          clickToZoom: false,
          dblClickToZoom: true,
          flickEnabled: false,
        },
        gestureSettingsTouch: { flickEnabled: !still },
        gestureSettingsPen: { clickToZoom: false, dblClickToZoom: true },
        gestureSettingsUnknown: { flickEnabled: !still },
      });
    } catch (error) {
      fail(error);
      return;
    }
    state.viewer = viewer;
    state.opening = true;

    viewer.addHandler('open', () => {
      state.opening = false;
      frame.dataset.live = 'true';
      labelCanvas();
      updateZoom(true);
      const item = viewer.world.getItemAt(0);
      if (item) {
        const hidePreview = () => {
          if (state.viewer === viewer && viewer.world.getItemAt(0) === item) preview.hidden = true;
        };
        if (item.getFullyLoaded()) hidePreview();
        else {
          const onLoaded = (event) => {
            if (!event.fullyLoaded) return;
            item.removeHandler('fully-loaded-change', onLoaded);
            hidePreview();
          };
          item.addHandler('fully-loaded-change', onLoaded);
        }
      }
    });
    viewer.addHandler('open-failed', (event) => fail(new Error(event.message || 'The poster tiles could not be opened')));
    viewer.addHandler('animation', () => updateZoom(false));
    viewer.addHandler('animation-finish', () => updateZoom(true));
    viewer.addHandler('resize', () => updateZoom(true));
    // The preview sits under the canvas exactly where the home view draws, covering the wait
    // for tiles. Once the reader moves the view it no longer lines up, so it goes.
    const dropPreview = () => {
      if (!state.opening && liveItem()) preview.hidden = true;
    };
    viewer.addHandler('zoom', () => {
      dropPreview();
      updateZoom(false);
      keepCentred();
    });
    viewer.addHandler('pan', dropPreview);

    viewer.addHandler('canvas-key', (event) => {
      const original = event.originalEvent;
      if (!original || original.ctrlKey || original.altKey || original.metaKey) return;
      switch (original.code) {
        case 'KeyR': // rotate
        case 'KeyF': // flip
        case 'KeyJ': // previous / next page
        case 'KeyK':
          event.preventDefaultAction = true;
          break;
        case 'NumpadAdd':
          event.preventDefaultAction = true;
          original.preventDefault();
          zoomBy(1.25);
          break;
        case 'NumpadSubtract':
          event.preventDefaultAction = true;
          original.preventDefault();
          zoomBy(1 / 1.25);
          break;
        case 'Numpad0':
          event.preventDefaultAction = true;
          original.preventDefault();
          viewer.viewport.goHome();
          break;
        default:
      }
    });

    // Inline, a plain wheel scrolls the page (cooperative mode leaves the event alone).
    // Ctrl or Cmd + wheel, which is also what a trackpad pinch sends, zooms the poster.
    viewer.addHandler('canvas-scroll', (event) => {
      const original = event.originalEvent;
      if (state.mode !== 'inline' || !original || !(original.ctrlKey || original.metaKey)) return;
      if (!liveItem()) return;
      const vp = viewer.viewport;
      vp.zoomBy(Math.pow(viewer.zoomPerScroll, event.scroll), vp.pointFromPixel(event.position, true));
      vp.applyConstraints();
    });

    // A one-finger drag on the inline stage scrolls the page; say how to move the poster instead.
    viewer.addHandler('canvas-cooperative-gesture', (event) => {
      event.preventDefaultAction = true; // suppress OpenSeadragon's own overlay
      if (event.gesture === 'drag') showHint('Use two fingers to move the poster');
    });
  }

  function destroyViewer() {
    const viewer = state.viewer;
    state.viewer = null;
    frame.dataset.live = 'false';
    preview.hidden = false;
    if (viewer) {
      try {
        viewer.destroy();
      } catch (error) {
        /* already torn down */
      }
    }
    osdHost.replaceChildren();
    updateZoom(false);
  }

  function fail(error) {
    if (state.failed) return;
    state.failed = true;
    console.warn('Poster viewer unavailable; showing the static panels instead.', error);
    try {
      leaveImmersive(false);
    } catch (leaveError) {
      /* nothing to undo */
    }
    destroyViewer();
    observer && observer.disconnect();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    root.replaceChildren(...fallback);
    root.removeAttribute('data-posters-ready');
  }

  function start() {
    if (state.OSD || state.failed) return;
    loadOpenSeadragon().then(
      (OSD) => {
        if (state.failed) return;
        state.OSD = OSD;
        if (state.wantViewer) createViewer();
      },
      (error) => fail(error),
    );
  }

  // --- full screen and full-window modes --------------------------------------

  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const fsRequest = frame.requestFullscreen || frame.webkitRequestFullscreen;
  const fsEnabled = Boolean(fsRequest && (document.fullscreenEnabled || document.webkitFullscreenEnabled));
  const canPopover = typeof frame.showPopover === 'function';
  if (coarse) fullBtn.hidden = true; // touch readers reach the full-window viewer through "Explore the poster"

  function focusables() {
    return Array.from(frame.querySelectorAll('button, a[href], [tabindex="0"]')).filter(
      (node) => !node.hidden && node.getClientRects().length > 0,
    );
  }

  function onImmersiveKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      leaveImmersive(true);
      return;
    }
    if (event.key !== 'Tab' || state.mode !== 'window') return;
    // The page behind the full-window viewer is covered, so Tab cycles within the viewer.
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!frame.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setImmersive(mode) {
    state.mode = mode;
    frame.dataset.mode = mode;
    frame.classList.toggle('is-full', mode !== 'inline');
    frame.classList.toggle('is-window', mode === 'window');
    closeBtn.hidden = mode === 'inline';
    const exitLabel = mode === 'inline' ? 'Full screen' : 'Exit full screen';
    fullBtn.setAttribute('aria-label', exitLabel);
    fullBtn.title = exitLabel;
    fullBtn.querySelector('.poster-viewer__btn-text').textContent = exitLabel;
    setIcon(fullBtn, mode === 'inline' ? 'expand' : 'contract');
    applyGestureMode();
    updateZoom(false);
  }

  function enterWindow() {
    if (state.mode === 'window') return;
    const html = document.documentElement;
    state.scrollLock = { overflow: html.style.overflow, y: window.scrollY };
    html.style.overflow = 'hidden';
    setImmersive('window');
    frame.setAttribute('role', 'dialog');
    frame.setAttribute('aria-modal', 'true');
    frame.setAttribute('aria-label', 'Poster viewer');
    if (canPopover) {
      // The top layer keeps the viewer above everything, whatever its ancestors do with
      // transforms, overflow or stacking.
      try {
        frame.setAttribute('popover', 'manual');
        frame.showPopover();
      } catch (error) {
        frame.removeAttribute('popover');
      }
    }
    document.addEventListener('keydown', onImmersiveKeydown);
    if (coarse) {
      state.wantViewer = true;
      if (state.OSD) createViewer();
      else start(); // creates the viewer as soon as OpenSeadragon arrives
    }
    // "Explore the poster" is hidden once the viewer opens; "Full screen" stays put and keeps focus.
    if (!frame.contains(document.activeElement) || document.activeElement === exploreBtn) {
      closeBtn.focus({ preventScroll: true });
    }
  }

  function leaveWindow() {
    document.removeEventListener('keydown', onImmersiveKeydown);
    if (frame.hasAttribute('popover')) {
      try {
        frame.hidePopover();
      } catch (error) {
        /* was not showing */
      }
      frame.removeAttribute('popover');
    }
    frame.removeAttribute('role');
    frame.removeAttribute('aria-modal');
    frame.removeAttribute('aria-label');
    if (coarse) {
      state.wantViewer = false;
      destroyViewer(); // hand the memory back; the preview takes over again
    }
    setImmersive('inline');
    const lock = state.scrollLock;
    state.scrollLock = null;
    if (lock) {
      document.documentElement.style.overflow = lock.overflow;
      if (Math.abs(window.scrollY - lock.y) > 1) window.scrollTo({ top: lock.y, behavior: 'instant' });
    }
  }

  function enterImmersive(opener) {
    if (state.mode !== 'inline' || state.failed) return;
    state.opener = opener;
    if (!coarse && fsEnabled) {
      let request;
      try {
        request = fsRequest.call(frame);
      } catch (error) {
        enterWindow();
        return;
      }
      if (request && typeof request.catch === 'function') {
        request.catch(() => {
          if (state.mode === 'inline') enterWindow();
        });
      }
    } else {
      enterWindow();
    }
  }

  function leaveImmersive(restoreFocus) {
    const mode = state.mode;
    if (mode === 'inline') return;
    if (mode === 'fullscreen') {
      if (fsElement() === frame) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        const done = exit.call(document);
        if (done && typeof done.catch === 'function') done.catch(() => {});
        if (restoreFocus) return; // onFullscreenChange finishes up and returns focus
      }
      document.removeEventListener('keydown', onImmersiveKeydown);
      setImmersive('inline');
    } else {
      leaveWindow();
    }
    if (restoreFocus) returnFocus();
  }

  function returnFocus() {
    const opener = state.opener;
    state.opener = null;
    if (opener && opener.isConnected && !opener.hidden) opener.focus({ preventScroll: true });
  }

  function onFullscreenChange() {
    const on = fsElement() === frame;
    if (on && state.mode !== 'fullscreen') {
      setImmersive('fullscreen');
      // Browsers handle Escape in full screen themselves; this covers any that hand the key
      // to the page first.
      document.addEventListener('keydown', onImmersiveKeydown);
    } else if (!on && state.mode === 'fullscreen') {
      document.removeEventListener('keydown', onImmersiveKeydown);
      setImmersive('inline');
      returnFocus();
    }
  }

  fullBtn.addEventListener('click', () => {
    if (state.mode === 'inline') enterImmersive(fullBtn);
    else leaveImmersive(true);
  });
  closeBtn.addEventListener('click', () => leaveImmersive(true));
  exploreBtn.addEventListener('click', () => enterImmersive(exploreBtn));
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // --- mount ----------------------------------------------------------------

  function onResize() {
    if (!liveItem()) updateZoom(false);
  }
  window.addEventListener('resize', onResize);

  // The frame goes into the document before the preview gets its src: a lazy image only
  // waits for the viewport when it is connected.
  root.replaceChildren(frame);
  root.setAttribute('data-posters-ready', '');
  renderPanel();
  updateZoom(false);

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        start();
      },
      { rootMargin: `${LAZY_MARGIN}px 0px ${LAZY_MARGIN}px 0px` },
    );
    observer.observe(root);
  } else {
    start();
  }

  return {
    show(panelId) {
      const i = POSTER_PANELS.findIndex((p) => p.id === panelId);
      if (i < 0 || state.failed) return false;
      select(i);
      return true;
    },
  };
}
