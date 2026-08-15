/* ============================================================
   Embed auto-height broadcaster.

   When the app runs inside an iframe (e.g. the TI / MB2 Shield
   embed), it continuously reports its full content height to the
   parent page via postMessage. A small script on the parent page
   listens for these messages and stretches the iframe to fit, so
   the inner scrollbar disappears and the whole page scrolls as one.

   Does nothing when the app runs standalone (not framed).
   ============================================================ */

export function initEmbedAutoHeight() {
  if (window.parent === window) return; // not embedded — nothing to do

  let last = 0;
  const send = () => {
    const h = Math.max(
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0
    );
    if (h > 0 && Math.abs(h - last) > 2) {
      last = h;
      window.parent.postMessage({ type: "mb2-embed-height", height: h }, "*");
    }
  };

  // Watch for any layout change (filters, tab switches, images loading…)
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(send);
    if (document.documentElement) ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
  }
  window.addEventListener("load", send);
  window.addEventListener("resize", send);
  // Safety net: catch anything the observers miss (fonts, late images).
  setInterval(send, 1000);
  send();
}
