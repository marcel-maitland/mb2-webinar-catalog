// src/App.jsx
import { useEffect, useMemo, useState } from "react";

/**
 * Webinar Catalog – App.jsx (Vite + React)
 * Updates you requested:
 * ✅ Filters/tags on the LEFT (sticky sidebar)
 * ✅ Course thumbnail inside each card
 * ✅ Keep 2 registration buttons (NO big blue bottom CTA)
 * ✅ Still shows vendor logo (if provided)
 * ✅ Works with your JSON field names exactly
 *
 * IMPORTANT:
 * - Set DATA_URL to your live JSON endpoint (the one returning {"items":[...]}).
 * - If DATA_URL is left blank, it will show SAMPLE so builds never fail.
 */

const DATA_URL = ""; // <-- paste your JSON endpoint here

const SAMPLE = {
  updated_at: "2026-02-12T20:52:02.602Z",
  count: 1,
  items: [
    {
      id: "1",
      "Date of the Event": "2026-04-08T05:00:00.000Z",
      "Name of Event":
        "ASSESSING DENTAL IMPLANT HEALTH: The Foundation of Successful Maintenance",
      "Time of the event": "7:00 - 8:00pm Central Time",
      "Registration Link":
        "https://younginnovations.zoom.us/webinar/register/WN_3FPNZbeCS4aBUJGmSMixag#/registration",
      "2nd time of the Event": "8:00pm - 9:00pm Central Time",
      "Second Registration Link":
        "https://younginnovations.zoom.us/webinar/register/WN__oGdsXX2TUKZ59zpSTo-7g#/registration",
      "Presenter / Vendor (Tag)": "Young Innovations",
      "Vender Logo":
        "https://img.rdhmag.com/files/base/ebm/rdhmag/image/2021/08/young_innovations_logo.png",

      // OPTIONAL: If you add this field later, the thumbnail will use it.
      // "Course Thumb": "https://.....png"
    },
  ],
};

function safeStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function isValidUrl(u) {
  try {
    const s = safeStr(u);
    if (!s) return false;
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function parseDate(value) {
  const s = safeStr(value);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateLong(d) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(d) {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function endOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function normalizeItem(raw) {
  const date = parseDate(raw["Date of the Event"]);
  const title = safeStr(raw["Name of Event"]) || "Untitled Event";
  const vendor = safeStr(raw["Presenter / Vendor (Tag)"]);
  const vendorLogo = safeStr(raw["Vender Logo"]);
  const time1 = safeStr(raw["Time of the event"]);
  const link1 = safeStr(raw["Registration Link"]);
  const time2 = safeStr(raw["2nd time of the Event"]);
  const link2 = safeStr(raw["Second Registration Link"]);

  // Thumbnail preference order:
  // 1) "Course Thumb" (if you add it)
  // 2) "Course Thumbnail"
  // 3) "Thumbnail"
  const thumb =
    safeStr(raw["Course Thumb"]) ||
    safeStr(raw["Course Thumbnail"]) ||
    safeStr(raw["Thumbnail"]);

  const sessions = [
    { label: time1, url: link1 },
    { label: time2, url: link2 },
  ].filter((s) => safeStr(s.label) || isValidUrl(s.url));

  return {
    id: safeStr(raw.id) || `${title}-${safeStr(raw["Date of the Event"])}`,
    date,
    title,
    vendor,
    vendorLogo,
    thumb,
    sessions,
    raw,
  };
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // Filters
  const [query, setQuery] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [vendorFilter, setVendorFilter] = useState("All");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr("");

      try {
        if (!DATA_URL) {
          if (!cancelled) setData(SAMPLE);
          return;
        }

        const res = await fetch(DATA_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => {
    const rawItems = Array.isArray(data?.items) ? data.items : [];
    return rawItems.map(normalizeItem);
  }, [data]);

  const vendors = useMemo(() => {
    const set = new Set();
    for (const it of items) if (it.vendor) set.add(it.vendor);
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const filtered = useMemo(() => {
    const now = new Date();
    const q = safeStr(query).toLowerCase();

    return items
      .filter((it) => {
        if (!showPast && it.date) {
          if (endOfLocalDay(it.date) < now) return false;
        }
        return true;
      })
      .filter((it) => {
        if (vendorFilter === "All") return true;
        return it.vendor === vendorFilter;
      })
      .filter((it) => {
        if (!q) return true;
        const hay = [
          it.title,
          it.vendor,
          it.sessions.map((s) => s.label).join(" "),
          it.date ? formatDateLong(it.date) : "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const ad = a.date ? a.date.getTime() : Number.POSITIVE_INFINITY;
        const bd = b.date ? b.date.getTime() : Number.POSITIVE_INFINITY;
        return ad - bd;
      });
  }, [items, query, showPast, vendorFilter]);

  const clearFilters = () => {
    setQuery("");
    setShowPast(false);
    setVendorFilter("All");
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <h1 style={styles.h1}>Webinar Catalog</h1>
            <p style={styles.sub}>
              Browse upcoming webinars, register instantly, and filter by vendor.
            </p>
          </div>

          {/* keep search in header, but filters live on left */}
          <div style={styles.headerSearchWrap}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, vendors, dates…"
              style={styles.search}
              aria-label="Search"
            />
          </div>
        </div>
      </header>

      <div style={styles.shell}>
        {/* LEFT SIDEBAR FILTERS */}
        <aside style={styles.sidebar} aria-label="Filters">
          <div style={styles.sideCard}>
            <div style={styles.sideTitle}>Filters</div>

            <div style={styles.sideGroup}>
              <div style={styles.sideLabel}>Vendor</div>
              <select
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                style={styles.select}
                aria-label="Filter by vendor"
              >
                {vendors.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.sideGroup}>
              <label style={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={showPast}
                  onChange={(e) => setShowPast(e.target.checked)}
                />
                <span>Show past events</span>
              </label>
            </div>

            <button type="button" onClick={clearFilters} style={styles.clearBtn}>
              Clear filters
            </button>

            <div style={styles.sideDivider} />

            <div style={styles.sideStat}>
              <div style={styles.mutedSm}>Results</div>
              <div style={styles.sideStatNum}>
                {filtered.length} <span style={styles.mutedSm}>of {items.length}</span>
              </div>
            </div>

            <div style={styles.sideStat}>
              <div style={styles.mutedSm}>Last updated</div>
              <div style={styles.sideStatNum}>
                {data?.updated_at ? (
                  <>
                    {formatDateShort(new Date(data.updated_at))}{" "}
                    <span style={styles.mutedSm}>
                      {new Date(data.updated_at).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN LIST */}
        <main style={styles.main}>
          {loading && (
            <div style={styles.centerBox}>
              <div style={styles.spinner} />
              <div style={styles.muted}>Loading webinars…</div>
            </div>
          )}

          {!loading && err && (
            <div style={styles.errorBox}>
              <strong style={{ display: "block", marginBottom: 8 }}>
                Couldn’t load the catalog
              </strong>
              <div style={{ marginBottom: 10 }}>{err}</div>
              <div style={styles.muted}>
                Tip: Confirm your JSON endpoint returns valid JSON with an{" "}
                <code>items</code> array.
              </div>
            </div>
          )}

          {!loading && !err && filtered.length === 0 && (
            <div style={styles.centerBox}>
              <div style={styles.muted}>No events match your filters.</div>
            </div>
          )}

          {!loading && !err && filtered.length > 0 && (
            <div className="mb2-grid" style={styles.grid}>
              {filtered.map((it) => (
                <EventCard key={it.id} item={it} />
              ))}
            </div>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
}

function EventCard({ item }) {
  const showThumb = isValidUrl(item.thumb);
  const showVendorLogo = isValidUrl(item.vendorLogo);

  return (
    <article style={styles.card}>
      {/* Thumbnail */}
      {showThumb ? (
        <div style={styles.thumbWrap}>
          <img src={item.thumb} alt={`${item.title} thumbnail`} style={styles.thumbImg} />
        </div>
      ) : (
        <div style={styles.thumbPlaceholder} aria-hidden="true">
          <div style={styles.thumbPlaceholderInner}>
            <div style={styles.thumbPlaceholderTitle}>Webinar</div>
            <div style={styles.thumbPlaceholderSub}>
              {item.vendor || "Dentlogics"}
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div style={styles.cardBody}>
        <div style={styles.cardTopRow}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.badges}>
              {item.date && <span style={styles.badge}>{formatDateShort(item.date)}</span>}
              {item.vendor && <span style={styles.badgeAlt}>{item.vendor}</span>}
            </div>

            <h3 style={styles.title} title={item.title}>
              {item.title}
            </h3>

            {item.date ? (
              <div style={styles.when}>
                <span style={styles.muted}>Date:</span> {formatDateLong(item.date)}
              </div>
            ) : null}
          </div>

          {showVendorLogo ? (
            <img
              src={item.vendorLogo}
              alt={item.vendor ? `${item.vendor} logo` : "Vendor logo"}
              style={styles.vendorLogo}
              loading="lazy"
              onError={(e) => {
                // if the logo URL 404s, hide it gracefully
                e.currentTarget.style.display = "none";
              }}
            />
          ) : null}
        </div>

        {/* Session buttons (no big CTA at bottom) */}
        <div style={styles.sessions}>
          {item.sessions.map((s, idx) => {
            const label = safeStr(s.label) || `Session ${idx + 1}`;
            const urlOk = isValidUrl(s.url);

            return (
              <div key={`${item.id}-s-${idx}`} style={styles.sessionRow}>
                <div style={styles.sessionLabel}>{label}</div>
                {urlOk ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener"
                    style={styles.sessionBtn}
                  >
                    Register →
                  </a>
                ) : (
                  <span style={styles.sessionBtnDisabled}>No link</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.footerInner}>
        <div style={styles.muted}>© {new Date().getFullYear()} Dentlogics</div>
      </div>
    </footer>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f7f8fb",
    color: "#0f172a",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial',
  },
  header: {
    background: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  headerInner: {
    maxWidth: 1300,
    margin: "0 auto",
    padding: "18px 16px",
    display: "flex",
    gap: 16,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  h1: { margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: 0.2 },
  sub: { margin: "4px 0 0", color: "#475569", fontSize: 14 },

  headerSearchWrap: { flex: "1 1 420px", display: "flex", justifyContent: "flex-end" },
  search: {
    width: "min(520px, 100%)",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    outline: "none",
    background: "#fff",
  },

  shell: {
    maxWidth: 1300,
    margin: "0 auto",
    padding: "18px 16px 28px",
    display: "grid",
    gridTemplateColumns: "280px 1fr",
    gap: 16,
    alignItems: "start",
  },

  sidebar: {
    position: "sticky",
    top: 90,
    alignSelf: "start",
  },
  sideCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 10px 30px rgba(2,6,23,.06)",
  },
  sideTitle: { fontWeight: 900, fontSize: 16, marginBottom: 10 },
  sideGroup: { marginBottom: 12 },
  sideLabel: { fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 6 },
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#fff",
  },
  checkboxRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "#334155",
    userSelect: "none",
  },
  clearBtn: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    fontWeight: 900,
    cursor: "pointer",
  },
  sideDivider: { height: 1, background: "#e2e8f0", margin: "14px 0" },
  sideStat: { display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  sideStatNum: { fontWeight: 900, color: "#0f172a" },
  mutedSm: { color: "#64748b", fontSize: 12 },

  main: { minWidth: 0 },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
    gap: 16,
  },

  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    boxShadow: "0 10px 30px rgba(2,6,23,.06)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },

  thumbWrap: { width: "100%", aspectRatio: "21 / 9", background: "#0b1220" },
  thumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },

  thumbPlaceholder: {
    width: "100%",
    aspectRatio: "21 / 9",
    background: "linear-gradient(135deg, #e2e8f0, #f8fafc)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlaceholderInner: { textAlign: "center" },
  thumbPlaceholderTitle: { fontWeight: 1000, fontSize: 18, color: "#0f172a" },
  thumbPlaceholderSub: { fontWeight: 800, fontSize: 12, color: "#475569", marginTop: 4 },

  cardBody: { padding: 14 },

  cardTopRow: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  badges: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  badge: {
    fontSize: 12,
    fontWeight: 900,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #dbeafe",
  },
  badgeAlt: {
    fontSize: 12,
    fontWeight: 900,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #ffedd5",
  },

  vendorLogo: {
    width: 92,
    height: 40,
    objectFit: "contain",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#fff",
    padding: 6,
    flexShrink: 0,
  },

  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 1000,
    lineHeight: 1.25,
  },

  when: { marginTop: 8, fontSize: 13, color: "#0f172a" },

  sessions: { marginTop: 12, display: "flex", flexDirection: "column", gap: 10 },

  sessionRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: "12px 12px",
    background: "#ffffff",
  },
  sessionLabel: { fontSize: 14, color: "#334155", fontWeight: 800, lineHeight: 1.3 },

  sessionBtn: {
    textDecoration: "none",
    fontWeight: 1000,
    fontSize: 14,
    padding: "9px 12px",
    borderRadius: 12,
    border: "1px solid #dbeafe",
    background: "#eff6ff",
    color: "#1d4ed8",
    whiteSpace: "nowrap",
  },
  sessionBtnDisabled: {
    fontWeight: 900,
    fontSize: 14,
    padding: "9px 12px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#94a3b8",
    whiteSpace: "nowrap",
  },

  muted: { color: "#64748b" },

  centerBox: {
    padding: 26,
    borderRadius: 16,
    border: "1px dashed #cbd5e1",
    background: "#ffffff",
    textAlign: "center",
  },
  errorBox: {
    padding: 18,
    borderRadius: 16,
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#7f1d1d",
  },
  spinner: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "2px solid #cbd5e1",
    borderTopColor: "#2563eb",
    margin: "0 auto 10px",
    animation: "spin 0.8s linear infinite",
  },

  footer: { padding: "18px 16px 24px" },
  footerInner: { maxWidth: 1300, margin: "0 auto" },
};

// Responsive behavior (no external CSS file needed)
if (typeof document !== "undefined") {
  const styleId = "mb2-layout-css";
  if (!document.getElementById(styleId)) {
    const tag = document.createElement("style");
    tag.id = styleId;
    tag.innerHTML = `
      @keyframes spin { to { transform: rotate(360deg); } }

      /* Grid columns */
      @media (min-width: 860px) {
        .mb2-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (min-width: 1180px) {
        .mb2-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      /* Sidebar collapses on small screens */
      @media (max-width: 880px) {
        /* the shell is inline-styled, so we target via body descendant */
        body .mb2-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(tag);
  }
}
