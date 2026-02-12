import { useEffect, useMemo, useState } from "react";

const DATA_URL = import.meta.env?.VITE_DATA_URL || "";

/* ---------------- Utilities ---------------- */

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
  d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

/* ---------------- JSONP Loader ---------------- */

function loadJsonp(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const cbName = `__jsonp_cb_${Math.random().toString(36).slice(2)}`;
    const sep = url.includes("?") ? "&" : "?";
    const src = `${url}${sep}callback=${cbName}`;

    let script = document.createElement("script");

    const cleanup = () => {
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP load failed"));
    };

    script.src = src;
    document.body.appendChild(script);

    setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);
  });
}

/* ---------------- Normalize Sheet Row ---------------- */

function normalize(row, i) {
  const get = (...keys) => {
    for (const k of keys) {
      const v = row?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "")
        return String(v).trim();
    }
    return "";
  };

  const ceRaw = get("CE Hours");
  const ce = Number(String(ceRaw).replace(/[^\d.]/g, ""));

  return {
    id: `row-${i}`,
    title: get("Name of Event"),
    description: get("Description"),
    date: parseDate(get("Date of the Event")),
    category: get("category"),
    ce: Number.isFinite(ce) ? ce : null,
    vendor: get("Presenter / Vendor (Tag)"),
    vendorLogo: get("Vendor Logo"),
    thumb: get("Course Thumb"),
    sessions: [
      {
        label: get("Time of the event"),
        url: get("Registration Link"),
      },
      {
        label: get("2nd time of the Event"),
        url: get("Second Registration Link"),
      },
    ].filter((s) => safe(s.label) || safe(s.url)),
  };
}

/* ================= APP ================= */

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [catSelected, setCatSelected] = useState(new Set());
  const [vendorSelected, setVendorSelected] = useState(new Set());
  const [ceSelected, setCeSelected] = useState(new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const json = await loadJsonp(DATA_URL);
        const items = json.items.map(normalize);
        setRows(items);
      } catch (e) {
        setLoadError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const categories = useMemo(
    () => uniq(rows.map((r) => r.category)).sort(),
    [rows]
  );

  const vendors = useMemo(
    () => uniq(rows.map((r) => r.vendor)).sort(),
    [rows]
  );

  const ceHours = useMemo(
    () =>
      [...new Set(rows.map((r) => r.ce).filter((n) => typeof n === "number"))].sort(
        (a, b) => a - b
      ),
    [rows]
  );

  const toggle = (setFn, value) =>
    setFn((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });

  const filtered = useMemo(() => {
    const now = new Date();
    const q = safe(query).toLowerCase();

    return rows
      .filter((r) => (r.date ? endOfDay(r.date) >= now : true))
      .filter((r) =>
        catSelected.size ? catSelected.has(r.category) : true
      )
      .filter((r) =>
        vendorSelected.size ? vendorSelected.has(r.vendor) : true
      )
      .filter((r) =>
        ceSelected.size ? ceSelected.has(r.ce) : true
      )
      .filter((r) => {
        if (!q) return true;
        return (
          r.title?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ad = a.date ? a.date.getTime() : Infinity;
        const bd = b.date ? b.date.getTime() : Infinity;
        return ad - bd;
      });
  }, [rows, catSelected, vendorSelected, ceSelected, query]);

  return (
    <div className="page">
      <header className="header">
        <div className="headerLeft">
          <div className="titleRow">
            <h1>Webinar Catalog</h1>
            <span className="ver">v8</span>
          </div>
          <p>Browse upcoming webinars and register instantly.</p>
        </div>
        <input
          className="search"
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sideTitle">Filters</div>

          <div className="group">
            <div className="groupTitle">Category</div>
            <div className="list">
              {categories.map((c) => (
                <label className="pillCheck" key={c}>
                  <input
                    type="checkbox"
                    checked={catSelected.has(c)}
                    onChange={() => toggle(setCatSelected, c)}
                  />
                  {c}
                </label>
              ))}
            </div>
          </div>

          <div className="group">
            <div className="groupTitle">Vendor</div>
            <div className="list">
              {vendors.map((v) => (
                <label className="pillCheck" key={v}>
                  <input
                    type="checkbox"
                    checked={vendorSelected.has(v)}
                    onChange={() => toggle(setVendorSelected, v)}
                  />
                  {v}
                </label>
              ))}
            </div>
          </div>

          <div className="group">
            <div className="groupTitle">CE Hours</div>
            <div className="list">
              {ceHours.map((h) => (
                <label className="pillCheck" key={h}>
                  <input
                    type="checkbox"
                    checked={ceSelected.has(h)}
                    onChange={() => toggle(setCeSelected, h)}
                  />
                  {h} CE
                </label>
              ))}
            </div>
          </div>
        </aside>

        <main className="main">
          {loading && <div className="center">Loading...</div>}
          {loadError && <div className="center">{loadError}</div>}

          <div className="grid">
            {filtered.map((item) => (
              <Card key={item.id} item={item} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ================= CARD ================= */

function Card({ item }) {
  return (
    <article className="card">
      <div className="thumb">
        {isUrl(item.thumb) && (
          <img src={item.thumb} alt={item.title} />
        )}

        {isUrl(item.vendorLogo) && (
          <img
            className="vendorLogo"
            src={item.vendorLogo}
            alt="Vendor logo"
          />
        )}
      </div>

      <div className="body">
        <div className="topRow">
          <div className="metaRow">
            {item.date && (
              <span className="dateBadge">
                {formatDate(item.date)}
              </span>
            )}
          </div>

          {item.ce && (
            <span className="ceBadge">{item.ce} CE</span>
          )}
        </div>

        <h3 className="title">{item.title}</h3>

        {item.description && (
          <p className="descFull">{item.description}</p>
        )}

        <div className="sessions">
          {item.sessions.map((s, i) => (
            <div className="session" key={i}>
              <span className="sessionLabel">{s.label}</span>
              {isUrl(s.url) && (
                <a
                  className="sessionBtn"
                  href={s.url}
                  target="_blank"
                  rel="noopener"
                >
                  Register →
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
