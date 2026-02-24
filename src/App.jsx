import { useEffect, useMemo, useState } from "react";

/**
 * Webinar Catalog — App.jsx (prod)
 * Latest updates added:
 * ✅ Differentiate In-Person vs Web events via Sheet column "Format"
 * ✅ Add "Format" filter in left sidebar
 * ✅ Show Format badge on each card (alongside Date + CE)
 *
 * NOTE: This does NOT change anything else.
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

    /* ✅ NEW: format to differentiate In-Person vs Web */
    format: get("Format", "format", "Event Format", "Type"),

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

  /* ✅ NEW: Format filter state */
  const [formatSelected, setFormatSelected] = useState(new Set());

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

  /* ✅ NEW: formats list */
  const formats = useMemo(
    () => uniq(rows.map((r) => r.format)).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

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
    setFormatSelected(new Set()); // ✅ NEW
  };

  const filtered = useMemo(() => {
    const now = new Date();
    const q = safe(query).toLowerCase();

    const catOn = catSelected.size > 0;
    const vendorOn = vendorSelected.size > 0;
    const ceOn = ceSelected.size > 0;
    const formatOn = formatSelected.size > 0; // ✅ NEW

    return rows
      // auto-hide past events
      .filter((r) => (r.date ? endOfDay(r.date) >= now : true))
      // filters
      .filter((r) => (catOn ? catSelected.has(r.category) : true))
      .filter((r) => (vendorOn ? vendorSelected.has(r.vendor) : true))
      .filter((r) => (ceOn ? typeof r.ce === "number" && ceSelected.has(r.ce) : true))
      .filter((r) => (formatOn ? formatSelected.has(r.format) : true)) // ✅ NEW
      // search
      .filter((r) => {
        if (!q) return true;
        const hay = `${r.title} ${r.vendor} ${r.category} ${r.format ?? ""} ${r.ce ?? ""} ${
          r.description ?? ""
        } ${r.date ? formatDate(r.date) : ""}`.toLowerCase();
        return hay.includes(q);
      })
      // sort by soonest date
      .sort((a, b) => {
        const ad = a.date ? a.date.getTime() : Number.POSITIVE_INFINITY;
        const bd = b.date ? b.date.getTime() : Number.POSITIVE_INFINITY;
        return ad - bd;
      });
  }, [rows, query, catSelected, vendorSelected, ceSelected, formatSelected]);

  return (
    <div className="page">
      <header className="header">
        <div className="headerLeft">
          <div className="titleRow">
            <h1>Webinar Catalog</h1>
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

          {/* ✅ NEW: Format filter */}
          <div className="group">
            <div className="groupTitle">Format</div>
            <div className="list">
              {formats.map((f) => (
                <label className="pillCheck" key={f}>
                  <input
                    type="checkbox"
                    checked={formatSelected.has(f)}
                    onChange={() => toggle(setFormatSelected, f)}
                  />
                  <span>{f}</span>
                </label>
              ))}
            </div>
          </div>

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
      </div>

      <div className="body">
        <div className="topRow">
          <div className="metaRow">
            {item.date ? <span className="dateBadge">{formatDate(item.date)}</span> : null}
            {typeof item.ce === "number" ? <span className="ceBadge">{item.ce} CE</span> : null}

            {/* ✅ NEW: Format badge */}
            {safe(item.format) ? <span className="formatBadge">{item.format}</span> : null}
          </div>

          {logoOk ? <img className="vendorLogo" src={item.vendorLogo} alt="Vendor logo" loading="lazy" /> : null}
        </div>

        <h3 className="title" title={item.title}>
          {item.title}
        </h3>

        {safe(item.description) ? (
          <p className="descFull" title={item.description}>
            {item.description}
          </p>
        ) : null}

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
