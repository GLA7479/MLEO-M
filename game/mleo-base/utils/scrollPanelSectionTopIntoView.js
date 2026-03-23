/** @param {Window | undefined} win */
export function prefersReducedMotion(win = typeof window !== "undefined" ? window : undefined) {
  if (!win?.matchMedia) return false;
  return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Nearest ancestor that scrolls vertically (overflow auto/scroll/overlay).
 * @param {HTMLElement | null} from
 * @returns {HTMLElement | null}
 */
export function findVerticalScrollContainer(from) {
  if (typeof window === "undefined" || !from) return null;
  const root = document.documentElement;
  let el = from.parentElement;
  while (el && el !== root) {
    const st = window.getComputedStyle(el);
    const oy = st.overflowY;
    if (
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      el.scrollHeight > el.clientHeight + 2
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Scroll `container` so `headerEl` (section title row) sits just below any in-container sticky chrome
 * (e.g. resource rail marked `data-base-panel-sticky-chrome`), using viewport geometry. Always `auto`
 * behavior for a deterministic final position.
 *
 * @param {HTMLElement | null} container
 * @param {HTMLElement | null} headerEl
 * @param {{ padding?: number }} [options]
 */
export function scrollPanelHeaderIntoView(container, headerEl, options = {}) {
  if (!container || !headerEl) return;
  const pad = Number(options.padding) || 6;

  const cRect = container.getBoundingClientRect();
  const hRect = headerEl.getBoundingClientRect();

  const sticky = container.querySelector("[data-base-panel-sticky-chrome]");
  let reserveFromViewportTop = pad;
  if (sticky) {
    const sRect = sticky.getBoundingClientRect();
    reserveFromViewportTop = Math.max(pad, sRect.bottom - cRect.top + pad);
  }

  const nextTop = container.scrollTop + (hRect.top - cRect.top) - reserveFromViewportTop;
  container.scrollTo({ top: Math.max(0, nextTop), behavior: "auto" });
}

/** @deprecated Prefer scrollPanelHeaderIntoView for section open alignment */
export function scrollPanelSectionTopIntoView(container, target, options = {}) {
  scrollPanelHeaderIntoView(container, target, { padding: Number(options.offset) || 8 });
}

/** Run after the next two animation frames (layout/paint settled before measuring). */
export function runAfterDoubleRaf(callback) {
  if (typeof window === "undefined" || typeof callback !== "function") return;
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

/**
 * Scroll `container` so `headerEl` is aligned after layout; uses {@link runAfterDoubleRaf} internally.
 * @param {HTMLElement | null} container
 * @param {HTMLElement | null} headerEl
 * @param {{ padding?: number }} [options]
 */
export function scheduleScrollPanelHeaderIntoView(container, headerEl, options = {}) {
  if (!container || !headerEl) return;
  runAfterDoubleRaf(() => {
    scrollPanelHeaderIntoView(container, headerEl, options);
  });
}

/** `data-base-inner-panel-header` for the open key, with legacy `data-base-inner-panel` fallback. */
export function queryInnerPanelHeaderElement(panelKey) {
  if (typeof document === "undefined" || panelKey == null) return null;
  const key = String(panelKey);
  let headerEl = null;
  try {
    headerEl = document.querySelector(`[data-base-inner-panel-header="${CSS.escape(key)}"]`);
  } catch {
    headerEl = document.querySelector(`[data-base-inner-panel-header="${key}"]`);
  }
  if (!headerEl) {
    try {
      headerEl = document.querySelector(`[data-base-inner-panel="${CSS.escape(key)}"]`);
    } catch {
      headerEl = document.querySelector(`[data-base-inner-panel="${key}"]`);
    }
  }
  return headerEl;
}

/**
 * Prefer mobile or desktop BASE overlay scroll roots when they contain the header; else nearest scroller.
 * @param {HTMLElement | null} headerEl
 * @param {HTMLElement | null | undefined} mobileRoot
 * @param {HTMLElement | null | undefined} desktopRoot
 */
export function resolvePanelScrollContainerForElement(headerEl, mobileRoot, desktopRoot) {
  if (!headerEl) return null;
  if (mobileRoot?.contains(headerEl)) return mobileRoot;
  if (desktopRoot?.contains(headerEl)) return desktopRoot;
  return findVerticalScrollContainer(headerEl);
}
