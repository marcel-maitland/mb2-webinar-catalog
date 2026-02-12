import { useEffect, useMemo, useState } from "react";

/* ===============================
   CONFIG
================================= */

const DATA_URL =
  import.meta.env?.VITE_DATA_URL || "/data.json";

/* ===============================
   HELPERS
================================= */

const safe = (v) =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

const isUrl = (u) => safe(u).startsWith("http");

const parseDate = (value) => {
  const d = new Date(value);
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

/* ===============================
   NORMALIZE SHEET ROW
================================= */

function normalize(row, i) {
  return {
    id: row.id || `row-${i}`,
    title: safe(row["Name of Event"]),
    date: parseDate(row["Date of the Event"]),
    category: safe(row["category"]),
    ce: Number(row["CE Hours"]) || null,
    vendor: safe(row["Presenter / Vendor (Tag)"]),
    vendorLogo: safe(row["Vendor Logo"]),
    thumb: safe(row["Course Thumb"]),
    sessions: [
      {
        label: safe(row["Time of the event"]),
        url: safe(row["Registration Link"]),
      },
      {
        label: safe(row["2nd time of the Event"]),
        url: safe(row["Second Registration Link"]),
      },
    ].filter((s) => s.label || s.url),
  };
}

/* ===============================
   APP
================================= */

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [showPast, setShowPast] = useState(true);

  const [catSelected, setCatSelected] = useState(new Set());
  const [vendorSelected, setVendorSelected] = useState(new Set());
  const [ceSelected, setCeSelected] = useState(new Set());

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(DATA_URL, { cache: "no-store" });
        const json = await res.json();
        const items = Array.isArray(json.items)
          ? json.items.map(normalize)
          : [];
        setData(items);
      } catch (e) {
        console.error("Data load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* ===============================
     FILTER OPTIONS
  ================================= */

  const categories = [...new Set(data.map((d) => d.category))].filter(Boolean);
  const vendors = [...new Set(data.map((d) => d.vendor))].filter(Boolean);
  const ceHours = [...new Set(data.map((d) => d.ce).filter(Boolean))].sort(
    (a, b) => a - b
  );

  /* ===============================
     FILTER LOGIC
  ================================= */

  const filtered = data
    .filter((item) => {
      if (!showPast && item.date) {
        return endOfDay(item.date) >= new Date();
      }
      return true;
    })
    .filter((item) =>
      catSelected.size ? catSelected.has(item.category) : true
    )
    .filter((item) =>
      vendorSelected.size ? vendorSelected.has(item.vendor) : true
    )
    .filter((item) =>
      ceSelected.size ? ceSelected.has(item.ce) : true
    )
    .filter((item) => {
      if (!query) return true;
      return (
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.vendor.toLowerCase().includes(query.toLowerCase()) ||
        item.category.toLowerCase().includes(query.toLowerCase())
      );
    })
    .sort((a, b) =>
      a.date && b.date ? a.date - b.date : 0
    );

  const toggle = (setFn, value) =>
    setFn((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });

  /* ===============================
     RENDER
  ================================= */

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Webinar Catalog</h1>
          <p>
            Browse upcoming webinars, register instantly, and filter by
            category, vendor, or CE hours.
          </p>
        </div>
        <input
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      <div className="layout">
        {/* LEFT FILTERS */}
        <aside className="sidebar">
          <div className="filterGroup">
            <label>
              <input
                type="checkbox"
                checked={showPast}
                onChange={(e) => setShowPast(e.target.checked)}
              />
              Show past events
            </label>
          </div>

          <div className="filterGroup">
            <h4>Category</h4>
            {categories.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={catSelected.has(c)}
                  onChange={() => toggle(setCatSelected, c)}
                />
                {c}
              </label>
            ))}
          </div>

          <div className="filterGroup">
            <h4>Vendor</h4>
            {vendors.map((v) => (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={vendorSelected.has(v)}
                  onChange={() => toggle(setVendorSelected, v)}
                />
                {v}
              </label>
            ))}
          </div>

          <div className="filterGroup">
            <h4>CE Hours</h4>
            {ceHours.map((h) => (
              <label key={h}>
                <input
                  type="checkbox"
                  checked={ceSelected.has(h)}
                  onChange={() => toggle(setCeSelected, h)}
                />
                {h} CE
              </label>
            ))}
          </div>
        </aside>

        {/* MAIN GRID */}
        <main className="grid">
          {loading && <p>Loading...</p>}
          {!loading &&
            filtered.map((item) => (
              <div className="card" key={item.id}>
                {/* Thumbnail */}
                <div className="thumb">
                  {isUrl(item.thumb) ? (
                    <img src={item.thumb} alt="" />
                  ) : (
                    <div className="thumbFallback">
                      {item.category}
                    </div>
                  )}
                </div>

                <div className="cardBody">
                  <div className="badges">
                    {item.date && (
                      <span className="badge">
                        {formatDate(item.date)}
                      </span>
                    )}
                    {item.category && (
                      <span className="badge soft">
                        {item.category}
                      </span>
                    )}
                    {item.ce && (
                      <span className="badge soft">
                        {item.ce} CE
                      </span>
                    )}
                    {item.vendor && (
                      <span className="badge vendor">
                        {item.vendor}
                      </span>
                    )}
                  </div>

                  <h3>{item.title}</h3>

                  {/* Vendor Logo */}
                  {isUrl(item.vendorLogo) && (
                    <img
                      src={item.vendorLogo}
                      alt=""
                      className="vendorLogo"
                    />
                  )}

                  {/* Sessions */}
                  {item.sessions.map((s, i) => (
                    <div className="session" key={i}>
                      <span>{s.label}</span>
                      {isUrl(s.url) && (
                        <a
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
            ))}
        </main>
      </div>

      <style>{`
        body { margin:0; font-family:system-ui; background:#f7f8fb; }
        .header {
          display:flex; justify-content:space-between; align-items:center;
          padding:20px; background:#fff; border-bottom:1px solid #e2e8f0;
        }
        .header input {
          padding:10px 14px; border-radius:12px; border:1px solid #e2e8f0;
        }
        .layout {
          display:grid; grid-template-columns:280px 1fr; gap:20px;
          padding:20px; max-width:1400px; margin:auto;
        }
        .sidebar { background:#fff; padding:16px; border-radius:16px; }
        .filterGroup { margin-bottom:20px; }
        .grid {
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(320px,1fr));
          gap:20px;
        }
        @media(min-width:1200px){
          .grid { grid-template-columns:repeat(3,1fr); }
        }
        .card {
          background:#fff; border-radius:18px; overflow:hidden;
          box-shadow:0 10px 30px rgba(0,0,0,.05);
          display:flex; flex-direction:column;
        }
        .thumb { aspect-ratio:21/9; background:#111; }
        .thumb img { width:100%; height:100%; object-fit:cover; }
        .thumbFallback {
          display:flex; align-items:center; justify-content:center;
          height:100%; background:linear-gradient(#e2e8f0,#f8fafc);
        }
        .cardBody { padding:16px; }
        .badges { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
        .badge {
          font-size:12px; font-weight:700; padding:6px 10px;
          border-radius:999px; background:#eff6ff; color:#1d4ed8;
        }
        .badge.soft { background:#f1f5f9; color:#0f172a; }
        .badge.vendor { background:#fff7ed; color:#9a3412; }
        .vendorLogo {
          max-height:40px; margin:10px 0;
        }
        .session {
          display:flex; justify-content:space-between;
          padding:10px; border:1px solid #e2e8f0;
          border-radius:12px; margin-top:10px;
        }
        .session a {
          font-weight:700; color:#1d4ed8; text-decoration:none;
        }
      `}</style>
    </div>
  );
}
