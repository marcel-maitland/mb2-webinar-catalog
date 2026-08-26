/* ============================================================
   Two-frame embed sync (TI dashboard).

   The TI page embeds the catalog as TWO iframes from this app:
     /all-bar/:slug   → tabs + search/filter bar only. The parent
                        page makes this iframe position:sticky, so
                        it pins natively with zero jitter.
     /all-grid/:slug  → the course/event grid only.

   Messages between the two frames RELAY THROUGH THE PARENT page
   ({type:'mb2-sync'} → parent script forwards to the sibling
   frame). This confines the sync to the one page instance the
   visitor is looking at. (BroadcastChannel was used originally,
   but it is shared across ALL open browser tabs of the site — two
   open dashboards would answer each other's state requests with
   conflicting tabs and flip the grids into an infinite remount
   loop.)
   ============================================================ */

export function createCatalogChannel(slug) {
  const s = (slug || "mb2").toLowerCase();
  const listeners = new Set();

  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.type !== "mb2-sync" || d.slug !== s) return;
    for (const fn of [...listeners]) {
      try { fn({ data: d.payload }); } catch { /* listener error */ }
    }
  });

  return {
    postMessage(payload) {
      try {
        window.parent.postMessage({ type: "mb2-sync", slug: s, payload }, "*");
      } catch { /* no parent */ }
    },
    addEventListener(_type, fn) { listeners.add(fn); },
    removeEventListener(_type, fn) { listeners.delete(fn); },
  };
}

/* Broadcast a message, ignoring channel failures. */
export function post(channel, msg) {
  try {
    channel && channel.postMessage(msg);
  } catch {
    /* channel closed — ignore */
  }
}
