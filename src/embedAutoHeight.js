/* ============================================================
   Embed integration for the TI / MB2 Shield iframe.

   1. AUTO-HEIGHT — reports the app's full content height to the
      parent page via postMessage. The parent-page snippet
      stretches the iframe to fit, so the inner scrollbar
      disappears and the whole page scrolls as one.

   2. PINNED MENU — the parent-page snippet streams the iframe's
      position on every scroll. When the top of the catalog
      scrolls past the top of the browser window, we slide the
      unified header (title + tabs) and the filter bar down by
      the same distance, so they appear stuck to the top of the
      window — real "sticky" behavior across the iframe boundary.

   Does nothing when the app runs standalone (not framed).
   ============================================================ */

export function initEmbedAutoHeight() {
  if (window.parent === window) return; // not embedded — nothing to do

  /* ---------- 1. Height reporting ---------- */
  let last = 0;
  const measure = () =>
    Math.max(
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0
    );
  const send = () => {
    const h = measure();
    if (h > 0 && Math.abs(h - last) > 2) {
      last = h;
      window.parent.postMessage({ type: "mb2-embed-height", height: h }, "*");
    }
  };
  const sendAlways = () => {
    const h = measure();
    if (h > 0) {
      last = h;
      window.parent.postMessage({ type: "mb2-embed-height", height: h }, "*");
    }
  };

  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(send);
    if (document.documentElement) ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
  }
  window.addEventListener("load", sendAlways);
  window.addEventListener("resize", send);
  // Heartbeat: re-announce even when unchanged, so a parent page that
  // attaches its listener late (or reloads the script) still syncs up.
  setInterval(sendAlways, 1500);
  sendAlways();

  /* ---------- 2. Menu pinning ----------
     The parent page streams the iframe's position on every scroll.
     Applying each update directly causes a visible one-frame jitter,
     and a CSS transition makes the bars trail far behind during
     continuous scrolling. Instead we chase the target offset in a
     requestAnimationFrame loop: each frame the bars close most of the
     remaining distance, then snap exactly onto the target. Fast scrolls
     look locked; the frame-boundary noise is absorbed. */
  let targetOff = 0;
  let currentOff = 0;
  let rafActive = false;

  const applyOff = (off) => {
    const header = document.querySelector(".unifiedStickyHeader");
    if (!header) return;
    const bar = document.querySelector(".unifiedBody .filterBar");
    const els = bar ? [header, bar] : [header];
    for (const el of els) {
      el.style.transform = off > 0.5 ? `translate3d(0, ${off}px, 0)` : "";
    }
    header.classList.toggle("unifiedPinned", off > 0.5);
  };

  const tick = () => {
    const diff = targetOff - currentOff;
    if (Math.abs(diff) < 0.75) {
      currentOff = targetOff;
      applyOff(currentOff);
      rafActive = false;
      return;
    }
    currentOff += diff * 0.55; // close over half the gap every frame
    applyOff(currentOff);
    requestAnimationFrame(tick);
  };

  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.type !== "mb2-embed-scroll" || typeof d.top !== "number") return;

    // How far the visitor has scrolled past the top of the catalog.
    // Popups also read this to position within the visible region.
    const scrollPast = Math.max(0, -d.top);
    window.__mb2EmbedScrollOff = scrollPast;

    const header = document.querySelector(".unifiedStickyHeader");
    if (!header) return;
    const bar = document.querySelector(".unifiedBody .filterBar");
    const els = bar ? [header, bar] : [header];

    // The tabs bar doesn't start at the top of the document (the title
    // sits above it), so subtract its natural starting position —
    // otherwise it pins one title-height below the top, leaving a gap.
    // rect.top reflects any transform we've already applied; removing
    // currentOff recovers the untransformed position.
    const naturalTop = header.getBoundingClientRect().top - currentOff;

    // Cap so the menu never slides past the end of the content.
    const stackH = els.reduce((s, el) => s + el.offsetHeight, 0);
    const max = Math.max(0, measure() - naturalTop - stackH - 200);
    targetOff = Math.min(Math.max(0, scrollPast - naturalTop), max);

    if (!rafActive) {
      rafActive = true;
      requestAnimationFrame(tick);
    }
  });
}
