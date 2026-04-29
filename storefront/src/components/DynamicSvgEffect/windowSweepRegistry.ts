/**
 * Shared window-level scroll registry for DynamicSvgEffect (`effect: 'lightsweep'`).
 *
 * One scroll + resize listener total, regardless of how many entries opt in.
 * Per element, computes a scroll progress 0..1 (0 = element's top edge just
 * touched the viewport bottom, 1 = element's bottom edge just exited the
 * viewport top) and hands it to the entry's `onProgress` callback. Updates
 * are rAF-throttled and rects are cached, refreshed only on scroll/resize.
 */

export interface WindowSweepHandlers {
  el: HTMLElement;
  /** Called with progress in [0, 1] where 0 = element entering, 1 = exiting. */
  onProgress: (progress: number) => void;
}

interface Entry extends WindowSweepHandlers {
  rect: DOMRect;
  lastProgress: number;
  firedOnce: boolean;
}

const entries = new Set<Entry>();
let rafId: number | null = null;
let attached = false;

// Cull entries this many px outside the viewport — far enough that the user
// can't see the art, close enough that re-entry is responsive.
const CULL_MARGIN_PX = 200;
// Skip onProgress when the change is below this fraction. The mask-position
// formula (75% → 25%) means a 0.003 change ≈ 0.15% mask shift — invisible.
const QUANTIZE_THRESHOLD = 0.003;

function refreshRects() {
  entries.forEach(e => { e.rect = e.el.getBoundingClientRect(); });
}

function tick() {
  rafId = null;
  const vh = window.innerHeight;
  entries.forEach(e => {
    const r = e.rect;
    const offscreen = r.bottom < -CULL_MARGIN_PX || r.top > vh + CULL_MARGIN_PX;

    // Cull: skip entries fully outside the viewport once we've fired the
    // boundary value at least once. The downstream spring will settle there
    // and stop emitting on its own.
    if (offscreen && e.firedOnce) return;

    // Total scroll distance over which the element travels through the viewport.
    const total = vh + r.height;
    if (total <= 0) return;
    // How far the element has scrolled from "just entering" to "just exited".
    const distance = vh - r.top;
    const progress = Math.max(0, Math.min(1, distance / total));

    // Quantize: skip no-op-ish updates so the spring + CSS-var write chain
    // doesn't fire for sub-perceptible deltas.
    if (e.firedOnce && Math.abs(progress - e.lastProgress) < QUANTIZE_THRESHOLD) return;

    e.lastProgress = progress;
    e.firedOnce = true;
    e.onProgress(progress);
  });
}

function schedule() {
  if (rafId === null) rafId = requestAnimationFrame(tick);
}

function onScrollOrResize() {
  refreshRects();
  schedule();
}

function attach() {
  if (attached) return;
  // capture: catches scrolls from any nested scroll container too.
  window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });
  attached = true;
}

function detach() {
  if (!attached) return;
  window.removeEventListener('scroll', onScrollOrResize, { capture: true } as EventListenerOptions);
  window.removeEventListener('resize', onScrollOrResize);
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  attached = false;
}

/**
 * Register an element + progress handler. Returns an unregister function.
 * Listeners auto-attach on first registration and auto-detach when the last
 * entry unregisters. Fires once synchronously on register.
 */
export function registerWindowSweep(handlers: WindowSweepHandlers): () => void {
  const entry: Entry = {
    ...handlers,
    rect: handlers.el.getBoundingClientRect(),
    lastProgress: 0,
    firedOnce: false,
  };
  entries.add(entry);
  attach();
  schedule();
  return () => {
    entries.delete(entry);
    if (entries.size === 0) detach();
  };
}
