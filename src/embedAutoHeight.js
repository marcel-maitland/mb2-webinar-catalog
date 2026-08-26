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
     Position updates cross the iframe boundary one frame behind the
     actual scroll, so during a fast fling a visible bounce is
     physically unavoidable. Strategy: apply every update immediately
     (bars track exactly, no trailing), and during FAST scrolling fade
     the bars out — the bounce happens while they're invisible, and the
     moment scrolling settles they fade back in already locked in
     place. Slow, deliberate scrolling never triggers the fade. */
  let currentOff = 0;
  let lastScroll = 0;
  let lastTime = 0;
  let hidden = false;
  let showTimer = null;

  const getEls = () => {
    const header = document.querySelector(".unifiedStickyHeader");
    if (!header) return null;
    const bar = document.querySelector(".unifiedBody .filterBar");
    return { header, els: bar ? [header, bar] : [header] };
  };

  const setHidden = (next) => {
    if (hidden === next) return;
    hidden = next;
    const found = getEls();
    if (!found) return;
    for (const el of found.els) el.classList.toggle("unifiedPinFading", next);
  };

  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.type !== "mb2-embed-scroll" || typeof d.top !== "number") return;

    // How far the visitor has scrolled past the top of the catalog.
    // Popups also read this to position within the visible region.
    const scrollPast = Math.max(0, -d.top);
    window.__mb2EmbedScrollOff = scrollPast;

    // Two-frame embed: the bar frame is pinned NATIVELY by the parent
    // page and the grid frame has no bars — never translate anything.
    if (document.querySelector("[data-mb2-embed-ui]")) return;

    const found = getEls();
    if (!found) return;
    const { header, els } = found;

    // The tabs bar doesn't start at the top of the document (the title
    // sits above it), so subtract its natural starting position —
    // otherwise it pins one title-height below the top, leaving a gap.
    // rect.top reflects any transform we've already applied; removing
    // currentOff recovers the untransformed position.
    const naturalTop = header.getBoundingClientRect().top - currentOff;

    // Cap so the menu never slides past the end of the content.
    const stackH = els.reduce((s, el) => s + el.offsetHeight, 0);
    const max = Math.max(0, measure() - naturalTop - stackH - 200);
    const off = Math.min(Math.max(0, scrollPast - naturalTop), max);

    // Scroll velocity (px per ~frame) — decides whether to fade.
    const now = performance.now();
    const dt = Math.max(1, now - lastTime);
    const velocity = (Math.abs(scrollPast - lastScroll) / dt) * 16.7;
    lastScroll = scrollPast;
    lastTime = now;

    // Apply instantly — no chasing, no trailing.
    currentOff = off;
    const pinned = off > 0.5;
    for (const el of els) {
      el.style.transform = pinned ? `translate3d(0, ${off}px, 0)` : "";
    }
    header.classList.toggle("unifiedPinned", pinned);

    // Fast fling while pinned → hide the bars so the unavoidable
    // one-frame bounce happens out of sight. Reveal ~130ms after the
    // scrolling calms down, already in exactly the right spot.
    if (pinned && velocity > 45) {
      setHidden(true);
    }
    if (hidden) {
      clearTimeout(showTimer);
      showTimer = setTimeout(() => setHidden(false), 130);
    }
    if (!pinned) setHidden(false);
  });
}
