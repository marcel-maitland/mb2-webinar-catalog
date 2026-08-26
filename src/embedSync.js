/* ============================================================
   Two-frame embed sync (TI dashboard).

   The TI page embeds the catalog as TWO iframes from this app:
     /all-bar/:slug   → tabs + search/filter bar only. The parent
                        page makes this iframe position:sticky, so
                        it pins natively with zero jitter.
     /all-grid/:slug  → the course/event grid only.

   Both frames are same-origin (events.dentlogics.com), so they
   talk directly over a BroadcastChannel: the bar broadcasts the
   active tab + filter state, the grid applies it. The grid says
   "hello" on load so a late-loading grid still gets the current
   state.
   ============================================================ */

export function createCatalogChannel(slug) {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(`mb2-catalog-${(slug || "mb2").toLowerCase()}`);
  } catch {
    return null;
  }
}

/* Broadcast a message, ignoring channel failures. */
export function post(channel, msg) {
  try {
    channel && channel.postMessage(msg);
  } catch {
    /* channel closed — ignore */
  }
}
