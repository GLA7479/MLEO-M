/** @param {Window | undefined} win */
export function prefersReducedMotion(win = typeof window !== "undefined" ? window : undefined) {
  if (!win?.matchMedia) return false;
  return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scroll a scrollable container so `target`'s top sits just below the container's top (+ offset).
 * @param {HTMLElement | null} container
 * @param {HTMLElement | null} target
 * @param {{ offset?: number }} [options]
 */
export function scrollPanelSectionTopIntoView(container, target, options = {}) {
  if (!container || !target) return;
  const offset = Number(options.offset) || 8;
  const behavior = prefersReducedMotion() ? "auto" : "smooth";
  const cRect = container.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const nextTop = container.scrollTop + (tRect.top - cRect.top) - offset;
  container.scrollTo({ top: Math.max(0, nextTop), behavior });
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
