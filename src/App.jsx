// src/App.jsx
import { useEffect, useMemo, useState } from "react";

/**
 * Webinar Catalog (Vite + React) — Updated to match your sheet needs
 *
 * ✅ LEFT filters now pull from spreadsheet column: "category"
 * ✅ Added filters: Vendor + CE Hours
 * ✅ Shows 3 cards across on desktop
 * ✅ Shows course thumbnail (pulled from sheet)
 * ✅ Shows vendor logo (pulled from sheet)
 * ✅ Date shown only once (badge)
 * ✅ Supports 2 registrations (no big bottom CTA)
 *
 * DATA FEED
 * - Set a Netlify env var: VITE_DATA_URL to your JSON endpoint
 *   OR set DATA_URL below.
 * - If neither is set, it will try to fetch "/data.json" (same site).
 */

const DATA_URL = ""; // optional hardcode. Otherwise use VITE_DATA_URL or /data.json fallback.

const FALLBACK_PATHS = ["/data.json", "/catalog.json", "/webinars.json"]; // tries in order

// SAMPLE only used if nothing can be fetched (keeps builds stable)
const SAMPLE = {
  updated_at: "2026-02-12T20:52:02.602Z",
  count: 3,
  items: [
    {
      id: "1",
      category: "Clinical",
      "CE Hours": "1",
      "Date of the Event": "2026-04-08T05:00:00.000Z",
      "Name of Event": "ASSESSING DENTAL IMPLANT HEALTH: The Foundation of Successful Maintenance",
      "Time of the event": "7:00 - 8:00pm Central Time",
      "Registration Link": "https://younginnovations.zoom.us/webinar/register/WN_3FPNZbeCS4aBUJGmSMixag#/registration",
      "2nd time of the Event": "8:00pm - 9:00pm Central Time",
      "Second Registration Link": "https://younginnovations.zoom.us/webinar/register/WN__oGdsXX2TUKZ59zpSTo-7g#/registration",
      "Presenter / Vendor (Tag)": "Young Innovations",
      "Vender Logo": "https://img.rdhmag.com/files/base/ebm/rdhmag/image/2021/08/young_innovations_logo.png",
      "Course Thumb":
        "https://d36ai2hkxl16us.cloudfront.net/thoughtindustries/image/upload/a_exif,c_fill,w_750,h_361/v1/course-uploads/666c8120-b013-4890-9961-904225467817/nqep5yramth3-CommonAutoimmuneConditions.png",
    },
    {
      id: "2",
      category: "Front Office",
      "CE Hours": "0.5",
      "Date of the Event": "2026-04-10T05:00:00.000Z",
      "Name of Event": "7 Strategies for Telephone Success (Live Q&A)",
      "Time of the event": "12:00 - 12:30pm Central Time",
      "Registration Link": "https://example.com/register-1",
      "Presenter / Vendor (Tag)": "Dentlogics",
      "Vendor Logo": "https://learn.dentlogics.com/favicon.ico",
      "Course Thumb":
        "https://d36ai2hkxl16us.cloudfront.net/thoughtindustries/image/upload/a_exif,c_fill,w_750,h_361/v1/course-uploads/666c8120-b013-4890-9961-904225467817/fgvay127hcql-7StrategiesforPhoneSuccess.png",
    },
    {
      id: "3",
      category: "Compliance",
      "CE Hours": "1",
      "Date of the Event": "2026-04-15T05:00:00.000Z",
      "Name of Event": "Dental Unit Waterline Safety — Best Practices",
      "Time of the event": "1:00 - 2:00pm Central Time",
      "Registration Link": "https://example.com/register-2",
      "Presenter / Vendor (Tag)": "Dentlogics",
      "Vendor Logo": "https://learn.dentlogics.com/favicon.ico",
      "Course Thumb":
        "https://d36ai2hkxl16us.cloudfront.net/thoughtindustries/image/upload/a_exif,c_fill,w_750,h_361/v1/course-uploads/666c8120-b013-4890-9961-904225467817/r4zsr62k6yot-DentalUnitWaterlineSafetythumb.png",
    },
  ],
};

function safeStr(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function isLikelyUrl(u) {
  const s = safeStr(u);
  return s.startsWith("http://") || s.startsWith("https://");
}

function parseDate(value) {
  const s = safeStr(value);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateShort(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function endOfLocalDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseCeHours(raw) {
  const candidates = [
    raw["CE Hours"],
    raw["CE hours"],
    raw["CE"],
    raw["Hours"],
    raw["ce_hours"],
    raw["ce hours"],
  ];
  for (const c of candidates) {
    const n = Number(String(c).replace(/[^\d.]/g, ""));
    if (!Number.isNaN(n) && Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function getCategory(raw) {
  return (
    safeStr(raw["category"]) ||
    safeStr(raw["Category"]) ||
    safeStr(raw["COURSE CATEGORY"]) ||
    safeStr(raw["Course Category"])
  );
}

function getVendor(raw) {
  return (
    safeStr(raw["Presenter / Vendor (Tag)"]) ||
    safeStr(raw["Vendor"]) ||
    safeStr(raw["vendor"]) ||
    safeStr(raw["Presenter"]) ||
    safeStr(raw["Presenter/Vendor"])
  );
}

function getVendorLogo(raw) {
  return (
    safeStr(raw["Vendor Logo"]) ||
    safeStr(raw["Vender Logo"]) || // common misspelling you showed earlier
    safeStr(raw["vendor_logo"]) ||
    safeStr(raw["Logo"]) ||
    safeStr(raw["logo"])
  );
}

function getThumb(raw) {
  return (
    safeStr(raw["Course Thumb"]) ||
    safeStr(raw["Course Thumbnail"]) ||
    safeStr(raw["Thumbnail"]) ||
    safeStr(raw["thumb"]) ||
    safeStr(raw["thumbnail"])
  );
}

function getTitle(raw) {
  return safeStr(raw["Name of Event"]) || safeStr(raw["Event Name"]) || safeStr(raw["Title"]) || "Untitled Event";
}

function getSessions(raw) {
  const time1 = safeStr(raw["Time of the event"]);
  const link1 = safeStr(raw["Registration Link"]);
  const time2 = safeStr(raw["2nd time of the Event"]);
  const link2 = safeStr(raw["Second Registration Link"]);

  const sessions = [
    { label: time1, url: link1 },
    { label: time2, url: link2 },
  ].filter((s) => safeStr(s.label) || isLikelyUrl(s.url));

  // If your sheet ever adds more, you can extend here.
  return sessions;
}

function normalizeItem(raw, idx) {
  const date = parseDate(raw["Date of the Event"]);
  const title = getTitle(raw);
  const vendor = getVendor(raw);
  const vendorLogo = getVendorLogo(raw);
  const thumb = getThumb(raw);
  const category = getCategory(raw);
  const ceHours = parseCeHours(raw);
  const sessions = getSessions(raw);

  return {
    id: safeStr(raw.id) || safeStr(raw.ID) || safeStr(raw.Id) || `row-${idx}`,
    date,
    title,
    vendor,
    vendorLogo,
    thumb,
    category,
    ceHours,
    sessions,
    raw,
  };
}

async function fetchJsonFirstAvailable(urls) {
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && Array.isArray(json.items)) return json;
    } catch {
      // keep trying
    }
  }
  throw new Error("No valid JSON feed found. Set VITE_DATA_URL or provide /data.json.");
}

function uniqSorted(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // LEFT filters
  const [query, setQuery] = useState("");
  const [showPast, setShowPast] = useState(true); // ✅ default TRUE so you always see all 3
  const [vendorSelected, setVendorSelected] = useState(new Set()); // multi-select
  const [categorySelected, setCategorySelected] = useState(new Set()); // multi-select
  const [ceSelected, setCeSelected] = useState(new Set()); // multi-select (numbers)

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr("");

      try {
        const envUrl = typeof import.meta !== "undefined" ? import.meta.env?.VITE_DATA_URL : "";
        const baseUrl = safeStr(DATA_URL) || safeStr(envUrl);

        let json = null;

        if (baseUrl) {
          const res = await fetch(baseUrl, { cache: "no-store" });
          if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
          json = await res.json();
        } else {
          json = await fetchJsonFirstAvailable(FALLBACK_PATHS);
        }

        if (!json || !Array.isArray(json.items)) throw new Error("JSON feed must include an 'items' array.");
        if (!cancelled) setData(json);
      } catch (e) {
        // fallback to SAMPLE so you still see something
        if (!cancelled) {
          setErr(e?.message || "Failed to load data.");
          setData(SAMPLE);
        }
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
    return rawItems.map((r, i) => normalizeItem(r, i));
  }, [data]);

  // Options for filters from the sheet
  const categories = useMemo(() => uniqSorted(items.map((i) => i.category)), [items]);
  const vendors = useMemo(() => uniqSorted(items.map((i) => i.vendor)), [items]);
  const ceHoursOptions = useMemo(() => {
    const vals = items.map((i) => i.ceHours).filter((n) => typeof n === "number");
    const uniq = Array.from(new Set(vals)).sort((a, b) => a - b);
    return uniq;
  }, [items]);

  const filtered = useMemo(() => {
    const now = new Date();
    const q = safeStr(query).toLowerCase();

    const vendorOn = vendorSelected.size > 0;
    const catOn = categorySelected.size > 0;
    const ceOn = ceSelected.size > 0;

    return items
      .filter((it) => {
        if (!showPast && it.date) {
          if (endOfLocalDay(it.date) < now) return false;
        }
        return true;
      })
      .filter((it) => {
        if (!vendorOn) return true;
        return vendorSelected.has(it.vendor);
      })
      .filter((it) => {
        if (!catOn) return true;
        return categorySelected.has(it.category);
      })
      .filter((it) => {
        if (!ceOn) return true;
        // if ceHours missing, treat as not matching
        if (typeof it.ceHours !== "number") return false;
        return ceSelected.has(it.ceHours);
      })
      .filter((it) => {
        if (!q) return true;
        const hay = [
          it.title,
          it.vendor,
          it.category,
          it.date ? formatDateShort(it.date) : "",
          it.sessions.map((s) => s.label).join(" "),
          typeof it.ceHours === "number" ? `${it.ceHours} CE` : "",
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
  }, [items, query, showPast, vendorSelected, categorySelected, ceSelected]);

  function toggleSet(setter, value) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  const clearFilters = () => {
    setQuery("");
    setVendorSelected(new Set());
    setCategorySelected(new Set());
    setCeSelected(new Set());
    setShowPast(true);
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <h1 style={styles.h1}>Webinar Catalog</h1>
            <p style={styles.sub}>Browse upcoming webinars, register instantly, and filter by category, vendor, or CE hours.</p>
          </div>

          <div style={styles.headerSearchWrap}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, vendors, categories…"
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
              <label style={styles.checkboxRow}>
                <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
                <span>Show past events</span>
              </label>
            </div>

            <div style={styles.sideDivider} />

            <div style={styles.sideGroup}>
              <div style={styles.sideLabel}>Category</div>
              {categories.length === 0 ? (
                <div style={styles.mutedSm}>No category values found.</div>
              ) : (
                <div style={styles.checkList}>
                  {categories.map((c) => (
                    <label key={c} style={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={categorySelected.has(c)}
                        onChange={() => toggleSet(setCategorySelected, c)}
                      />
                      <span>{c}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.sideGroup}>
              <div style={styles.sideLabel}>Vendors</div>
              {vendors.length === 0 ? (
                <div style={styles.mutedSm}>No vendor values found.</div>
              ) : (
                <div style={styles.checkList}>
                  {vendors.map((v) => (
                    <label key={v} style={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={vendorSelected.has(v)}
                        onChange={() => toggleSet(setVendorSelected, v)}
                      />
                      <span>{v}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.sideGroup}>
              <div style={styles.sideLabel}>CE Hours</div>
              {ceHoursOptions.length === 0 ? (
                <div style={styles.mutedSm}>No CE hours values found.</div>
              ) : (
                <div style={styles.checkList}>
                  {ceHoursOptions.map((h) => (
                    <label key={h} style={styles.checkRow}>
                      <input type="checkbox" checked={ceSelected.has(h)} onChange={() => toggleSet(setCeSelected, h)} />
                      <span>{h} CE</span>
                    </label>
                  ))}
                </div>
              )}
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
                      {new Date(data.updated_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>

            {err ? (
              <div style={styles.warnBox}>
                <strong style={{ display: "block", marginBottom: 6 }}>Feed warning</strong>
                <div style={styles.mutedSm}>{err}</div>
              </div>
            ) : null}
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

          {!loading && filtered.length === 0 && (
            <div style={styles.centerBox}>
              <div style={styles.muted}>No events match your filters.</div>
            </div>
          )}

          {!loading && filtered.length > 0 && (
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
  const thumbOk = isLikelyUrl(item.thumb);
  const logoOk = isLikelyUrl(item.vendorLogo);

  return (
    <article style={styles.card}>
      {/* Thumbnail (always reserves space; falls back if missing) */}
      <div style={styles.thumbWrap}>
        {thumbOk ? (
          <img
            src={item.thumb}
            alt={`${item.title} thumbnail`}
            style={styles.thumbImg}
            onError={(e) => {
              // fallback if the URL is bad
              e.currentTarget.style.display = "none";
              e.currentTarget.parentElement.setAttribute("data-thumb-fallback", "1");
            }}
          />
        ) : null}

        {/* fallback layer */}
        <div style={styles.thumbFallback} aria-hidden="true">
          <div style={styles.thumbFallbackInner}>
            <div style={styles.thumbFallbackTitle}>{item.category || "Webinar"}</div>
            <div style={styles.thumbFallbackSub}>{item.vendor || "Dentlogics"}</div>
          </div>
        </div>
      </div>

      <div style={styles.cardBody}>
        <div style={styles.cardTopRow}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.badges}>
              {/* Date shown ONCE (badge) */}
              {item.date ? <span style={styles.badge}>{formatDateShort(item.date)}</span> : null}
              {item.category ? <span style={styles.badgeSoft}>{item.category}</span> : null}
              {typeof item.ceHours === "number" ? <span style={styles.badgeSoft}>{item.ceHours} CE</span> : null}
              {item.vendor ? <span style={styles.badgeAlt}>{item.vendor}</span> : null}
            </div>

            <h3 style={styles.title} title={item.title}>
              {item.title}
            </h3>
          </div>

          {/* Vendor logo */}
          {logoOk ? (
            <img
              src={item.vendorLogo}
              alt={item.vendor ? `${item.vendor} logo` : "Vendor logo"}
              style={styles.vendorLogo}
              loading="lazy"
            />
          ) : null}
        </div>

        {/* Session buttons */}
        <div style={styles.sessions}>
          {item.sessions.length === 0 ? (
            <div style={styles.mutedSm}>No registration links found for this event.</div>
          ) : (
            item.sessions.map((s, idx) => {
              const label = safeStr(s.label) || `Session ${idx + 1}`;
              const urlOk = isLikelyUrl(s.url);

              return (
                <div key={`${item.id}-s-${idx}`} style={styles.sessionRow}>
                  <div style={styles.sessionLabel}>{label}</div>
                  {urlOk ? (
                    <a href={s.url} target="_blank" rel="noopener" style={styles.sessionBtn}>
                      Register →
                    </a>
                  ) : (
                    <span style={styles.sessionBtnDisabled}>No link</span>
                  )}
                </div>
              );
            })
          )}
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
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial',
  },

  header: {
    background: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  headerInner: {
    maxWidth: 1320,
    margin: "0 auto",
    padding: "18px 16px",
    display: "flex",
    gap: 16,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  h1: { margin: 0, fontSize: 28, fontWeight: 950, letterSpacing: 0.2 },
  sub: { margin: "4px 0 0", color: "#475569", fontSize: 14 },

  headerSearchWrap: { flex: "1 1 460px", display: "flex", justifyContent: "flex-end" },
  search: {
    width: "min(560px, 100%)",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    outline: "none",
    background: "#fff",
  },

  shell: {
    maxWidth: 1320,
    margin: "0 auto",
    padding: "18px 16px 28px",
    display: "grid",
    gridTemplateColumns: "300px 1fr",
    gap: 16,
    alignItems: "start",
  },

  sidebar: { position: "sticky", top: 92, alignSelf: "start" },
  sideCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 10px 30px rgba(2,6,23,.06)",
  },
  sideTitle: { fontWeight: 950, fontSize: 16, marginBottom: 10 },
  sideGroup: { marginBottom: 14 },
  sideLabel: { fontSize: 12, fontWeight: 900, color: "#475569", marginBottom: 8 },
  checkboxRow: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: "#334155" },
  checkList: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflow: "auto", paddingRight: 4 },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    color: "#0f172a",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "10px 10px",
  },
  clearBtn: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    fontWeight: 950,
    cursor: "pointer",
  },
  sideDivider: { height: 1, background: "#e2e8f0", margin: "14px 0" },
  sideStat: { display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  sideStatNum: { fontWeight: 950, color: "#0f172a" },

  warnBox: {
    marginTop: 12,
    borderRadius: 14,
    border: "1px solid #fde68a",
    background: "#fffbeb",
    padding: 10,
  },

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

  thumbWrap: {
    width: "100%",
    aspectRatio: "21 / 9",
    background: "#0b1220",
    position: "relative",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },

  thumbFallback: {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(135deg, #e2e8f0, #f8fafc)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    pointerEvents: "none",
  },
  thumbFallbackInner: {},
  thumbFallbackTitle: { fontWeight: 1000, fontSize: 18, color: "#0f172a" },
  thumbFallbackSub: { fontWeight: 900, fontSize: 12, color: "#475569", marginTop: 4 },

  cardBody: { padding: 14 },

  cardTopRow: { display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 },

  badges: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  badge: {
    fontSize: 12,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #dbeafe",
  },
  badgeSoft: {
    fontSize: 12,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#f1f5f9",
    color: "#0f172a",
    border: "1px solid #e2e8f0",
  },
  badgeAlt: {
    fontSize: 12,
    fontWeight: 950,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #ffedd5",
  },

  vendorLogo: {
    width: 100,
    height: 42,
    objectFit: "contain",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#fff",
    padding: 6,
    flexShrink: 0,
  },

  title: { margin: 0, fontSize: 18, fontWeight: 1000, lineHeight: 1.25 },

  sessions: { marginTop: 10, display: "flex", flexDirection: "column", gap: 10 },
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
  sessionLabel: { fontSize: 14, color: "#334155", fontWeight: 900, lineHeight: 1.3 },

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
    fontWeight: 950,
    fontSize: 14,
    padding: "9px 12px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#94a3b8",
    whiteSpace: "nowrap",
  },

  muted: { color: "#64748b" },
  mutedSm: { color: "#64748b", fontSize: 12 },

  centerBox: {
    padding: 26,
    borderRadius: 16,
    border: "1px dashed #cbd5e1",
    background: "#ffffff",
    textAlign: "center",
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
  footerInner: { maxWidth: 1320, margin: "0 auto" },
};

// Responsive rules (3 across on desktop + sidebar collapse)
if (typeof document !== "undefined") {
  const styleId = "mb2-responsive-css";
  if (!document.getElementById(styleId)) {
    const tag = document.createElement("style");
    tag.id = styleId;
    tag.innerHTML = `
      @keyframes spin { to { transform: rotate(360deg); } }

      /* 2 across */
      @media (min-width: 860px) {
        .mb2-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      /* ✅ 3 across */
      @media (min-width: 1200px) {
        .mb2-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }

      /* Sidebar collapses to top on smaller screens */
      @media (max-width: 980px) {
        body { }
      }
    `;
    document.head.appendChild(tag);
  }
}
