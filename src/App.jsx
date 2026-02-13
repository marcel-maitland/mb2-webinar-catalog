import { useEffect, useMemo, useState } from "react";

/**
 * Webinar Catalog — App.jsx (v6)
 * ✅ (1) Sort by upcoming date (soonest first)
 * ✅ (2) Auto-hide past events (no toggle)
 * ✅ (6) Polished hover animation / micro-interactions
 * ✅ Remove tags/badges from panels (keep DATE only)
 * ✅ Show Description (2–3 line clamp) from column "Description"
 * ✅ Loads Google Apps Script via JSONP (CORS-safe)
 * ✅ 3 across on desktop, thumbnail + vendor logo
 */

const DATA_URL = import.meta.env?.VITE_DATA_URL || "/data.json";

/* ---------- helpers ---------- */
const safe = (v) =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

const isUrl = (u) => safe(u).startsWith("http");

const parseDate = (value) => {
  const s = safe(value);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const formatDate = (d) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

/* ---------- JSONP loader (CORS-safe) ---------- */
function loadJsonp(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const cbName = `__jsonp_cb_${Math.random().toString(36).slice(2)}`;
    const sep = url.includes("?") ? "&" : "?";
    const src = `${url}${sep}callback=${cbName}`;

    let script = null;
    let timer = null;

    const cleanup = () => {
      try {
        delete window[cbName];
      } catch {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
      if (timer) clearTimeout(timer);
    };

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    script = document.createElement("script");
    script.src = src;
    script.async = true;

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP load failed (script error)"));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timed out"));
    }, timeoutMs);

    document.body.appendChild(script);
  });
}

/* ---------- row normalize ---------- */
function normalize(row, i) {
  const get = (...keys) => {
    for (const k of keys) {
      const v = row?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };

  const ceRaw = get("CE Hours", "CE", "CE Hour", "CE hours");
  const ce = Number(String(ceRaw).replace(/[^\d.]/g, ""));

  return {
    id: get("id", "ID") || `row-${i}`,
    title: get("Name of Event", "Event Name", "Title") || "Untitled Event",
    description: get("Description", "description", "DESC", "Course Description"),
    date: parseDate(get("Date of the Event", "Event Date", "Date")),
    category: get("category", "Category", "CATEGORY"),
    ce: Number.isFinite(ce) && ce > 0 ? ce : null,
    vendor: get("Presenter / Vendor (Tag)", "Vendor", "Presenter", "Presenter/Vendor"),
    vendorLogo: get("Vendor Logo", "Vender Logo", "Vendor logo", "Logo"),
    thumb: get("Course Thumb", "Course Thumbnail", "Thumbnail", "Thumb", "Image"),
    sessions: [
      {
        label: get("Time of the event", "Time of Event", "Time 1"),
        url: get("Registration Link", "Reg Link", "Registration"),
      },
      {
        label: get("2nd time of the Event", "Second Time", "Time 2"),
        url: get("Second Registration Link", "Second Reg Link", "Registration 2"),
      },
    ].filter((s) => safe(s.label) || safe(s.url)),
  };
}

/* ===============================
   APP
================================= */

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // UI state
  const [query, setQuery] = useState("");
  const [catSelected, setCatSelected] = useState(new Set());
  const [vendorSelected, setVendorSelected] = useState(new Set());
  const [ceSelected, setCeSelected] = useState(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError("");

      try {
        const json = await loadJsonp(DATA_URL);

        if (!json || !Array.isArray(json.items)) {
          throw new Error(
            `Bad JSON: expected {"items":[...]} but got: ${Object.keys(json || {}).join(", ") || "empty"}`
          );
        }

        const items = json.items.map(normalize);
        if (!cancelled) setRows(items);
      } catch (e) {
        console.error("Data load error:", e);
        if (!cancelled) {
          setRows([]);
          setLoadError(e?.message || "Failed to load data.");
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

  const categories = useMemo(
    () => uniq(rows.map((r) => r.category)).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const vendors = useMemo(
    () => uniq(rows.map((r) => r.vendor)).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const ceHours = useMemo(() => {
    const vals = rows.map((r) => r.ce).filter((n) => typeof n === "number");
    return [...new Set(vals)].sort((a, b) => a - b);
  }, [rows]);

  const toggle = (setFn, value) =>
    setFn((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });

  const clearFilters = () => {
    setQuery("");
    setCatSelected(new Set());
    setVendorSelected(new Set());
    setCeSelected(new Set());
  };

  const filtered = useMemo(() => {
    const now = new Date();
    const q = safe(query).toLowerCase();

    const catOn = catSelected.size > 0;
    const vendorOn = vendorSelected.size > 0;
    const ceOn = ceSelected.size > 0;

    return rows
      // ✅ (2) auto-hide past events
      .filter((r) => (r.date ? endOfDay(r.date) >= now : true))
      .filter((r) => (catOn ? catSelected.has(r.category) : true))
      .filter((r) => (vendorOn ? vendorSelected.has(r.vendor) : true))
      .filter((r) => (ceOn ? typeof r.ce === "number" && ceSelected.has(r.ce) : true))
      .filter((r) => {
        if (!q) return true;
        const hay = `${r.title} ${r.vendor} ${r.category} ${r.ce ?? ""} ${r.description ?? ""} ${
          r.date ? formatDate(r.date) : ""
        }`.toLowerCase();
        return hay.includes(q);
      })
      // ✅ (1) sort by upcoming date (soonest first)
      .sort((a, b) => {
        const ad = a.date ? a.date.getTime() : Number.POSITIVE_INFINITY;
        const bd = b.date ? b.date.getTime() : Number.POSITIVE_INFINITY;
        return ad - bd;
      });
  }, [rows, query, catSelected, vendorSelected, ceSelected]);

  return (
    <div className="page">
      <header className="header">
        <div className="headerLeft">
          <div className="titleRow">
            <h1>Webinar Catalog</h1>
            <span className="ver">v6</span>
          </div>
          <p>Browse upcoming webinars, register instantly, and filter by category, vendor, or CE hours.</p>
        </div>

        <input
          className="search"
          placeholder="Search events, vendors, categories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      <div className="layout">
        {/* LEFT FILTERS */}
        <aside className="sidebar">
          <div className="sideTitle">Filters</div>

          <div className="group">
            <div className="groupTitle">Category</div>
            <div className="list">
              {categories.map((c) => (
                <label className="pillCheck" key={c}>
                  <input type="checkbox" checked={catSelected.has(c)} onChange={() => toggle(setCatSelected, c)} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="group">
            <div className="groupTitle">Vendors</div>
            <div className="list">
              {vendors.map((v) => (
                <label className="pillCheck" key={v}>
                  <input
                    type="checkbox"
                    checked={vendorSelected.has(v)}
                    onChange={() => toggle(setVendorSelected, v)}
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="group">
            <div className="groupTitle">CE Hours</div>
            <div className="list">
              {ceHours.map((h) => (
                <label className="pillCheck" key={h}>
                  <input type="checkbox" checked={ceSelected.has(h)} onChange={() => toggle(setCeSelected, h)} />
                  <span>{h} CE</span>
                </label>
              ))}
            </div>
          </div>

          <button className="clearBtn" type="button" onClick={clearFilters}>
            Clear filters
          </button>

          <div className="sideDivider" />

          <div className="sideStat">
            <span>Results</span>
            <strong>
              {filtered.length} <span className="muted">/ {rows.length}</span>
            </strong>
          </div>
        </aside>

        {/* MAIN GRID */}
        <main className="main">
          {loading && <div className="center">Loading…</div>}

          {!loading && loadError && (
            <div className="errorBox">
              <div className="errorTitle">Data not loading</div>
              <div className="errorLine">
                <strong>URL tried:</strong> <code>{DATA_URL}</code>
              </div>
              <div className="errorLine">
                <strong>Error:</strong> {loadError}
              </div>
              <div className="errorHint">
                Make sure <code>VITE_DATA_URL</code> points to your Google Apps Script <code>/exec</code> URL and that it
                supports JSONP (<code>?callback=</code>).
              </div>
            </div>
          )}

          {!loading && !loadError && filtered.length === 0 && (
            <div className="center">No upcoming events match your filters.</div>
          )}

          {!loading && !loadError && filtered.length > 0 && (
            <div className="grid">
              {filtered.map((item) => (
                <Card key={item.id} item={item} />
              ))}
            </div>
          )}
        </main>
      </div>

      <style>{css}</style>
    </div>
  );
}

function Card({ item }) {
  const thumbOk = isUrl(item.thumb);
  const logoOk = isUrl(item.vendorLogo);

  return (
    <article className="card">
      <div className={`thumb ${thumbOk ? "" : "thumbNoImg"}`}>
        {thumbOk ? (
          <img
            src={item.thumb}
            alt={`${item.title} thumbnail`}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.parentElement.classList.add("thumbNoImg");
            }}
          />
        ) : null}

        <div className="thumbFallback" aria-hidden="true">
          <div className="thumbFallbackInner">
            <div className="thumbTitle">{item.category || "Webinar"}</div>
            <div className="thumbSub">{item.vendor || "Dentlogics"}</div>
          </div>
        </div>
      </div>

      <div className="body">
        <div className="topRow">
          <div className="left">
            {/* ✅ Tags removed. Keep ONLY the date. */}
            <div className="dateRow">
              {item.date ? <span className="dateBadge">{formatDate(item.date)}</span> : null}
              {item.vendor ? <span className="vendorText">{item.vendor}</span> : null}
            </div>

            <h3 className="title" title={item.title}>
              {item.title}
            </h3>

            {safe(item.description) ? (
              <p className="desc" title={item.description}>
                {item.description}
              </p>
            ) : null}
          </div>

          {logoOk ? (
            <img className="vendorLogo" src={item.vendorLogo} alt={item.vendor ? `${item.vendor} logo` : "Vendor logo"} />
          ) : null}
        </div>

        <div className="sessions">
          {item.sessions.map((s, i) => (
            <div className="session" key={i}>
              <span className="sessionLabel">{s.label}</span>
              {isUrl(s.url) ? (
                <a className="sessionBtn" href={s.url} target="_blank" rel="noopener">
                  Register →
                </a>
              ) : (
                <span className="sessionBtnDisabled">No link</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

const css = `
  :root{
    --bg:#f7f8fb;
    --card:#ffffff;
    --line:#e2e8f0;
    --ink:#0f172a;
    --muted:#64748b;
    --shadow: 0 10px 26px rgba(2,6,23,.06);
  }
  body{ margin:0; background:var(--bg); color:var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial;
  }
  .page{ min-height:100vh; }

  .header{
    position:sticky; top:0; z-index:10;
    background:var(--card);
    border-bottom:1px solid var(--line);
    display:flex; gap:16px; align-items:center; justify-content:space-between;
    padding:16px 18px;
  }
  .titleRow{ display:flex; align-items:center; gap:10px; }
  .ver{
    font-size:12px; font-weight:900;
    padding:4px 8px; border-radius:999px;
    border:1px solid var(--line); background:#f8fafc; color:#334155;
  }
  .headerLeft h1{ margin:0; font-size:26px; font-weight:900; }
  .headerLeft p{ margin:4px 0 0; color:#475569; font-size:14px; }
  .search{
    width:min(560px, 100%);
    padding:11px 14px;
    border-radius:14px;
    border:1px solid var(--line);
    outline:none;
    background:#fff;
    transition: box-shadow .2s ease, border-color .2s ease;
  }
  .search:focus{
    border-color:#bfdbfe;
    box-shadow: 0 0 0 4px rgba(59,130,246,.12);
  }

  .layout{
    max-width: 1320px;
    margin:0 auto;
    padding:16px 18px 28px;
    display:grid;
    grid-template-columns: 280px 1fr;
    gap:14px;
    align-items:start;
  }

  .sidebar{
    position:sticky; top:88px;
    background:var(--card);
    border:1px solid var(--line);
    border-radius:16px;
    padding:12px;
    box-shadow:var(--shadow);
  }
  .sideTitle{ font-weight:900; font-size:15px; margin-bottom:10px; }
  .sideDivider{ height:1px; background:var(--line); margin:12px 0; }
  .group{ margin-bottom:12px; }
  .groupTitle{ font-size:12px; font-weight:900; color:#475569; margin-bottom:8px; }
  .list{ display:flex; flex-direction:column; gap:8px; max-height:180px; overflow:auto; padding-right:4px; }

  .pillCheck{
    display:flex; align-items:center; gap:10px;
    background:#f8fafc;
    border:1px solid var(--line);
    border-radius:12px;
    padding:9px 10px;
    font-size:14px;
    transition: transform .18s ease, background .18s ease;
  }
  .pillCheck:hover{ background:#f1f5f9; transform: translateY(-1px); }

  .clearBtn{
    width:100%;
    padding:10px 12px;
    border-radius:12px;
    border:1px solid var(--line);
    background:#f8fafc;
    font-weight:900;
    cursor:pointer;
    transition: transform .18s ease, background .18s ease;
  }
  .clearBtn:hover{ background:#f1f5f9; transform: translateY(-1px); }

  .sideStat{
    display:flex; justify-content:space-between; align-items:center;
    font-size:14px; color:#334155;
  }
  .muted{ color:var(--muted); font-weight:700; }

  .main{ min-width:0; }

  .grid{
    display:grid;
    grid-template-columns: 1fr;
    gap:14px;
  }
  @media (min-width: 860px){
    .grid{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (min-width: 1100px){
    .grid{ grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  .center{
    padding:26px;
    background:var(--card);
    border:1px dashed #cbd5e1;
    border-radius:16px;
    text-align:center;
    color:var(--muted);
  }

  .errorBox{
    background:#fff;
    border:1px solid #fde68a;
    border-radius:16px;
    padding:14px;
  }
  .errorTitle{ font-weight:900; margin-bottom:8px; }
  .errorLine{ color:#334155; margin-bottom:6px; }
  .errorHint{ color:#64748b; font-size:13px; margin-top:10px; }
  code{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

  /* ✅ (6) Upgraded hover / micro-interactions */
  .card{
    background:var(--card);
    border:1px solid var(--line);
    border-radius:16px;
    overflow:hidden;
    box-shadow:var(--shadow);
    display:flex;
    flex-direction:column;
    transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
    will-change: transform;
  }
  .card:hover{
    transform: translateY(-4px);
    border-color:#cbd5e1;
    box-shadow: 0 18px 48px rgba(2,6,23,.10);
  }

  .thumb{
    aspect-ratio: 16 / 7;
    position:relative;
    overflow:hidden;
    background:#0b1220;
  }
  .thumb img{
    width:100%;
    height:100%;
    object-fit:cover;
    display:block;
    transform: scale(1);
    transition: transform .35s ease;
  }
  .card:hover .thumb img{ transform: scale(1.03); }

  .thumbFallback{
    position:absolute; inset:0;
    background: linear-gradient(135deg, #e2e8f0, #f8fafc);
    display:flex; align-items:center; justify-content:center;
    text-align:center;
    pointer-events:none;
    opacity:0;
  }
  .thumbNoImg .thumbFallback{ opacity:1; }
  .thumbFallbackInner{ padding:10px; }
  .thumbTitle{ font-weight:1000; font-size:16px; }
  .thumbSub{ margin-top:4px; font-weight:900; font-size:12px; color:#475569; }

  .body{ padding:12px; }
  .topRow{ display:flex; gap:10px; align-items:flex-start; justify-content:space-between; }
  .dateRow{ display:flex; gap:10px; align-items:center; margin-bottom:8px; }

  .dateBadge{
    font-size:11px;
    font-weight:950;
    padding:6px 10px;
    border-radius:999px;
    border:1px solid #dbeafe;
    background:#eff6ff;
    color:#1d4ed8;
    white-space:nowrap;
  }
  .vendorText{
    font-size:12px;
    font-weight:900;
    color:#475569;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    max-width: 180px;
  }

  .title{
    margin:0;
    font-size:16px;
    font-weight:1000;
    line-height:1.25;
    display:-webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow:hidden;
  }

  /* ✅ Description clamp (2–3 lines) */
  .desc{
    margin:8px 0 0;
    color:#475569;
    font-size:13px;
    line-height:1.45;
    display:-webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow:hidden;
  }

  .vendorLogo{
    width:86px;
    height:36px;
    object-fit:contain;
    border:1px solid var(--line);
    border-radius:12px;
    background:#fff;
    padding:6px;
    flex-shrink:0;
    transition: transform .22s ease;
  }
  .card:hover .vendorLogo{ transform: translateY(-1px); }

  .sessions{ margin-top:12px; display:flex; flex-direction:column; gap:8px; }
  .session{
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    border:1px solid var(--line);
    border-radius:12px;
    padding:10px 10px;
    background:#fff;
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  }
  .session:hover{
    transform: translateY(-1px);
    border-color:#cbd5e1;
    box-shadow: 0 10px 22px rgba(2,6,23,.06);
  }

  .sessionLabel{
    font-size:13px;
    font-weight:900;
    color:#334155;
    line-height:1.25;
    min-width:0;
  }

  .sessionBtn{
    text-decoration:none;
    font-weight:1000;
    font-size:13px;
    padding:8px 10px;
    border-radius:12px;
    border:1px solid #dbeafe;
    background:#eff6ff;
    color:#1d4ed8;
    white-space:nowrap;
    transition: transform .18s ease, background .18s ease;
  }
  .sessionBtn:hover{
    background:#dbeafe;
    transform: translateY(-1px);
  }

  .sessionBtnDisabled{
    font-weight:950;
    font-size:13px;
    padding:8px 10px;
    border-radius:12px;
    border:1px solid var(--line);
    background:#f8fafc;
    color:#94a3b8;
    white-space:nowrap;
  }

  @media (max-width: 980px){
    .layout{ grid-template-columns: 1fr; }
    .sidebar{ position:relative; top:auto; }
    .vendorText{ max-width: 100%; }
  }
`;
