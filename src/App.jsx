// src/App.jsx
import { useEffect, useMemo, useState } from "react";

/**
 * MB2 Webinar Catalog – App.jsx (Vite + React)
 * - Handles the JSON shape you pasted (items[] with "Date of the Event", "Name of Event", etc.)
 * - Shows BOTH registration links (when present)
 * - Shows vendor logo (when present)
 * - Search + basic filtering
 */

const DATA_URL =
  // ✅ Put your deployed JSON endpoint here if you have one.
  // If you already had one in your previous App.jsx, replace this constant with that exact URL.
  // Example: "https://your-site.netlify.app/data.json"
  // Leaving as empty will use SAMPLE data so the build always succeeds.
  "";

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

function normalizeItem(raw) {
  const date = parseDate(raw["Date of the Event"]);
  const title = safeStr(raw["Name of Event"]) || "Untitled Event";
  const vendor = safeStr(raw["Presenter / Vendor (Tag)"]);
  const vendorLogo = safeStr(raw["Vender Logo"]);
  const time1 = safeStr(raw["Time of the event"]);
  const link1 = safeStr(raw["Registration Link"]);
  const time2 = safeStr(raw["2nd time of the Event"]);
  const link2 = safeStr(raw["Second Registration Link"]);

  return {
    id: safeStr(raw.id) || `${title}-${raw["Date of the Event"] || ""}`,
    date,
    title,
    vendor,
    vendorLogo,
    sessions: [
      { label: time1, url: link1 },
      { label: time2, url: link2 },
    ].filter((s) => safeStr(s.label) || isValidUrl(s.url)),
    raw,
  };
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

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
          // No external fetch – use sample so build always succeeds.
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
    return rawItems.map(normalizeItem).filter((x) => x.title);
  }, [data]);

  const vendors = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      if (it.vendor) set.add(it.vendor);
    }
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const filtered = useMemo(() => {
    const q = safeStr(query).toLowerCase();
    const now = new Date();

    return items
      .filter((it) => {
        // past filter
        if (!showPast && it.date) {
          // consider "past" if the event date is earlier than today (local)
          const endOfDay = new Date(it.date);
          endOfDay.setHours(23, 59, 59, 999);
          if (endOfDay < now) return false;
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
        // upcoming first; items with no date go last
        const ad = a.date ? a.date.getTime() : Number.POSITIVE_INFINITY;
        const bd = b.date ? b.date.getTime() : Number.POSITIVE_INFINITY;
        return ad - bd;
      });
  }, [items, query, showPast, vendorFilter]);

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

          <div style={styles.controls}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, vendors, dates…"
              style={styles.search}
              aria-label="Search"
            />

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

            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={showPast}
                onChange={(e) => setShowPast(e.target.checked)}
              />
              <span>Show past</span>
            </label>
          </div>
        </div>
      </header>

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
              Tip: If you’re using a JSON URL, confirm it returns valid JSON with{" "}
              <code>items</code>.
            </div>
          </div>
        )}

        {!loading && !err && filtered.length === 0 && (
          <div style={styles.centerBox}>
            <div style={styles.muted}>No events match your filters.</div>
          </div>
        )}

        {!loading && !err && filtered.length > 0 && (
          <div style={styles.grid}>
            {filtered.map((it) => (
              <EventCard key={it.id} item={it} />
            ))}
          </div>
        )}
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <div style={styles.muted}>
            {data?.updated_at ? (
              <>
                Last updated:{" "}
                <strong>
                  {formatDateShort(new Date(data.updated_at))}{" "}
                  {new Date(data.updated_at).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </strong>
              </>
            ) : (
              <>Last updated: <strong>—</strong></>
            )}
          </div>
          <div style={styles.muted}>
            Showing <strong>{filtered.length}</strong> of{" "}
            <strong>{items.length}</strong>
          </div>
        </div>
      </footer>
    </div>
  );
}

function EventCard({ item }) {
  const primaryUrl =
    item.sessions.find((s) => isValidUrl(s.url))?.url ||
    (isValidUrl(item.raw?.["Registration Link"]) ? item.raw["Registration Link"] : "");

  return (
    <article style={styles.card}>
      <div style={styles.cardTop}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.badges}>
            {item.date && <span style={styles.badge}>{formatDateShort(item.date)}</span>}
            {item.vendor && <span style={styles.badgeAlt}>{item.vendor}</span>}
          </div>

          <h3 style={styles.title} title={item.title}>
            {item.title}
          </h3>
        </div>

        {isValidUrl(item.vendorLogo) ? (
          <img
            src={item.vendorLogo}
            alt={item.vendor ? `${item.vendor} logo` : "Vendor logo"}
            style={styles.vendorLogo}
            loading="lazy"
          />
        ) : null}
      </div>

      {item.date ? (
        <div style={styles.when}>
          <span style={styles.muted}>Date:</span> {formatDateLong(item.date)}
        </div>
      ) : null}

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

      {/* Big clickable footer (whole strip) */}
      {isValidUrl(primaryUrl) ? (
        <a href={primaryUrl} target="_blank" rel="noopener" style={styles.fullCta}>
          View & Register →
        </a>
      ) : (
        <div style={styles.fullCtaDisabled}>Registration link not available</div>
      )}
    </article>
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
    maxWidth: 1200,
    margin: "0 auto",
    padding: "18px 16px",
    display: "flex",
    gap: 16,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  h1: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  sub: { margin: "4px 0 0", color: "#475569", fontSize: 14 },
  controls: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  search: {
    width: 280,
    maxWidth: "70vw",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    outline: "none",
    background: "#fff",
  },
  select: {
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
  main: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "22px 16px 28px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
    gap: 14,
  },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    boxShadow: "0 10px 30px rgba(2,6,23,.06)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  cardTop: {
    padding: "16px 16px 10px",
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  badges: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  badge: {
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #dbeafe",
  },
  badgeAlt: {
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #ffedd5",
  },
  vendorLogo: {
    width: 86,
    height: 34,
    objectFit: "contain",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#fff",
    padding: 6,
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    lineHeight: 1.25,
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  },
  when: {
    padding: "0 16px 10px",
    fontSize: 13,
    color: "#0f172a",
  },
  sessions: {
    padding: "8px 16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  sessionRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "10px 10px",
    background: "#ffffff",
  },
  sessionLabel: {
    fontSize: 13,
    color: "#334155",
    fontWeight: 600,
    lineHeight: 1.3,
    minWidth: 0,
  },
  sessionBtn: {
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #dbeafe",
    background: "#eff6ff",
    color: "#1d4ed8",
    whiteSpace: "nowrap",
  },
  sessionBtnDisabled: {
    fontWeight: 700,
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#94a3b8",
    whiteSpace: "nowrap",
  },
  fullCta: {
    marginTop: "auto",
    display: "block",
    padding: "12px 16px",
    textDecoration: "none",
    fontWeight: 900,
    color: "#ffffff",
    background: "#2563eb",
    textAlign: "center",
  },
  fullCtaDisabled: {
    marginTop: "auto",
    padding: "12px 16px",
    fontWeight: 900,
    color: "#94a3b8",
    background: "#f1f5f9",
    textAlign: "center",
    borderTop: "1px solid #e2e8f0",
  },
  footer: {
    padding: "18px 16px 24px",
    borderTop: "1px solid #e2e8f0",
    background: "#ffffff",
  },
  footerInner: {
    maxWidth: 1200,
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
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
};

// Basic responsive grid without external CSS
// (Vite will keep this; no syntax risk)
if (typeof document !== "undefined") {
  const styleId = "mb2-inline-responsive-grid";
  if (!document.getElementById(styleId)) {
    const tag = document.createElement("style");
    tag.id = styleId;
    tag.innerHTML = `
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (min-width: 720px) {
        .mb2-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (min-width: 1020px) {
        .mb2-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
    `;
    document.head.appendChild(tag);
  }
}
