import { useEffect, useMemo, useState } from "react";
import "./App.css";

const DATA_URL =
  "https://script.google.com/macros/s/AKfycbznqVccaxs37Z3GZmDbmY4HG0CBDMzOmhT7ZhA9aXWnV3dMqHVPchRHDxFKuEb8w0w/exec";

function normalizeListField(v) {
  if (v == null) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeStr(v) {
  if (v == null) return "";
  return String(v).trim();
}

/* CLEAN DATE + TIME FORMATTER */
function formatDateLine(dateStr, timeStr) {
  const dRaw = safeStr(dateStr);
  const tRaw = safeStr(timeStr);

  const d = new Date(dRaw);

  const dateNice = !isNaN(d.getTime())
    ? d
        .toLocaleDateString(undefined, {
          month: "short",
          day: "2-digit",
          year: "numeric",
        })
        .toUpperCase()
    : dRaw.toUpperCase();

  const timeNice = tRaw;

  if (dateNice && timeNice) return `${dateNice} • ${timeNice}`;
  return dateNice || timeNice || "";
}

function toggleSetValue(set, value, setter) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setter(next);
}

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [query, setQuery] = useState("");
  const [selectedCE, setSelectedCE] = useState(new Set());
  const [selectedPresenters, setSelectedPresenters] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        const res = await fetch(DATA_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const data = await res.json();

        const parsed = (data.items || []).map((row, idx) => ({
          id: safeStr(row.id) || String(idx + 1),
          title: safeStr(row["Name of Event"]),
          presenter: safeStr(row["Presenter / Vendor (Tag)"]),
          description: safeStr(row["Description"]),
          ce: safeStr(row["Hours (Tag)"]),
          cost: safeStr(row["Cost"]),
          link: safeStr(row["Registration Link"]),
          thumb: safeStr(row["Thumbnail Link"]),
          date: safeStr(row["Date of the Event"]),
          time: safeStr(row["Time of the event"]),
          categories: normalizeListField(row["Category Tags"]),
        }));

        if (!cancelled) setItems(parsed);
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const ceOptions = useMemo(() => {
    const set = new Set(items.map((i) => i.ce).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const presenterOptions = useMemo(() => {
    const set = new Set(items.map((i) => i.presenter).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    items.forEach((i) => i.categories.forEach((c) => set.add(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matchesQuery = (i) =>
      !q ||
      i.title.toLowerCase().includes(q) ||
      i.presenter.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.categories.join(", ").toLowerCase().includes(q);

    const matchesCE = (i) => selectedCE.size === 0 || selectedCE.has(i.ce);
    const matchesPresenter =
      (i) => selectedPresenters.size === 0 || selectedPresenters.has(i.presenter);
    const matchesCategory =
      (i) =>
        selectedCategories.size === 0 ||
        i.categories.some((c) => selectedCategories.has(c));

    return items.filter(
      (i) =>
        matchesQuery(i) && matchesCE(i) && matchesPresenter(i) && matchesCategory(i)
    );
  }, [items, query, selectedCE, selectedPresenters, selectedCategories]);

  const clearAll = () => {
    setQuery("");
    setSelectedCE(new Set());
    setSelectedPresenters(new Set());
    setSelectedCategories(new Set());
  };

  return (
    <div className="page">
      <header className="topbar">
        <h1>MB2 Webinar Catalog</h1>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            className="search"
            placeholder="Search webinars"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            onClick={clearAll}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Clear
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="filters">
          <div className="filterSection">
            <h3>CE Hours</h3>
            {ceOptions.map((opt) => (
              <label key={opt}>
                <input
                  type="checkbox"
                  checked={selectedCE.has(opt)}
                  onChange={() => toggleSetValue(selectedCE, opt, setSelectedCE)}
                />{" "}
                {opt}
              </label>
            ))}
          </div>

          <div className="filterSection">
            <h3>Presenter</h3>
            {presenterOptions.map((opt) => (
              <label key={opt}>
                <input
                  type="checkbox"
                  checked={selectedPresenters.has(opt)}
                  onChange={() =>
                    toggleSetValue(selectedPresenters, opt, setSelectedPresenters)
                  }
                />{" "}
                {opt}
              </label>
            ))}
          </div>

          <div className="filterSection">
            <h3>Category</h3>
            {categoryOptions.map((opt) => (
              <label key={opt}>
                <input
                  type="checkbox"
                  checked={selectedCategories.has(opt)}
                  onChange={() =>
                    toggleSetValue(selectedCategories, opt, setSelectedCategories)
                  }
                />{" "}
                {opt}
              </label>
            ))}
          </div>
        </aside>

        <main className="grid">
          {loading && <div className="status">Loading webinars…</div>}
          {err && <div className="status error">Error: {err}</div>}

          {!loading &&
            !err &&
            filtered.map((w) => (
              <a
                className="eventCard"
                key={w.id}
                href={w.link || "#"}
                target="_blank"
                rel="noreferrer"
              >
                <div className="eventThumbWrap">
                  {w.thumb ? (
                    <img
                      src={w.thumb}
                      className="eventThumb"
                      alt={w.title}
                      loading="lazy"
                    />
                  ) : (
                    <div className="eventThumb placeholder" />
                  )}
                </div>

                <div className="eventBody">
                  <div className="eventDate">
                    {formatDateLine(w.date, w.time)}
                  </div>

                  <div className="eventTagRow">
                    <span className="eventTag">LIVE WEBINAR</span>
                  </div>

                  <h2 className="eventTitle">{w.title}</h2>

                  {w.presenter && (
                    <div className="eventSubtitle">{w.presenter}</div>
                  )}

                  <div className="eventMeta">
                    <span>{w.ce ? `${w.ce} CE Credit` : "CE TBD"}</span>
                    <span className="dot">•</span>
                    <span>{w.cost ? w.cost.toUpperCase() : "FREE"}</span>
                  </div>

                  <p className="eventDesc">{w.description}</p>

                  <div className="eventCtaRow">
                    <span className="eventBtn">Register Now</span>
                  </div>
                </div>
              </a>
            ))}
        </main>
      </div>
    </div>
  );
}

  );
}

