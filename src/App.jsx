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

function formatShortDate(dateStr) {
  const raw = safeStr(dateStr);

  // Handles ISO strings like 2026-01-14T06:00:00.000Z and also normal date strings
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;

  const m = d.getMonth() + 1;
  const day = d.getDate();
  const yy = String(d.getFullYear()).slice(-2);

  return `${m}/${day}/${yy}`;
}

function normalizeTime(timeStr) {
  let t = safeStr(timeStr);
  if (!t) return "";

  // Remove timezone words you don't want displayed
  t = t.replace(/\b(CENTRAL TIME|MOUNTAIN TIME|PACIFIC TIME|EASTERN TIME)\b/gi, "");
  t = t.replace(/\b(CST|CDT|MST|MDT|PST|PDT|EST|EDT)\b/gi, "");

  // Normalize spacing around hyphens
  t = t.replace(/\s*-\s*/g, " - ");

  // Ensure a space before AM/PM if missing (8:00PM -> 8:00 PM)
  t = t.replace(/(\d)(AM|PM)\b/gi, "$1 $2");

  // Lowercase am/pm
  t = t.replace(/\bAM\b/g, "am").replace(/\bPM\b/g, "pm");

  // Collapse extra spaces
  t = t.replace(/\s+/g, " ").trim();

  // Optional: remove space before am/pm for your exact preference (8:00 pm -> 8:00pm)
  t = t.replace(/\s(am|pm)\b/g, "$1");

  return t;
}

/* FINAL DISPLAY: 1/14/26   7:00 - 8:00pm */
function formatDateLine(dateStr, timeStr) {
  const d = formatShortDate(dateStr);
  const t = normalizeTime(timeStr);
  if (d && t) return `${d}   ${t}`;
  return d || t || "";
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
          date: row["Date of the Event"], // keep raw; formatter handles ISO
          time: row["Time of the event"],
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
                  <div className="eventDate">{formatDateLine(w.date, w.time)}</div>

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
                    <span>{w.cost ? safeStr(w.cost).toUpperCase() : "FREE"}</span>
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

