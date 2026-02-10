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

  // remove timezone words you don't want to display
  t = t.replace(/\b(CENTRAL TIME|MOUNTAIN TIME|PACIFIC TIME|EASTERN TIME)\b/gi, "");
  t = t.replace(/\b(CST|CDT|MST|MDT|PST|PDT|EST|EDT)\b/gi, "");

  // normalize spacing around dashes
  t = t.replace(/\s*-\s*/g, " - ");

  // ensure a space before AM/PM if missing
  t = t.replace(/(\d)(AM|PM)\b/gi, "$1 $2");

  // lowercase am/pm
  t = t.replace(/\bAM\b/g, "am").replace(/\bPM\b/g, "pm");

  // collapse spaces
  t = t.replace(/\s+/g, " ").trim();

  // your preference: "8:00 pm" -> "8:00pm"
  t = t.replace(/\s(am|pm)\b/g, "$1");

  return t;
}

/* final display: 1/14/26   7:00 - 8:00pm */
function formatDateLine(dateStr, timeStr) {
  const d = formatShortDate(dateStr);
  const t = normalizeTime(timeStr);
  if (d && t) return `${d}   ${t}`;
  return d || t || "";
}

/**
 * Parse event start datetime so we can hide past events.
 * If time can't be parsed, we default to noon local time
 * so we don't accidentally hide a same-day event too early.
 */
function parseEventStart(dateStr, timeStr) {
  const rawDate = safeStr(dateStr);
  const base = new Date(rawDate);
  if (isNaN(base.getTime())) return null;

  let hours = 12;
  let minutes = 0;

  const t = normalizeTime(timeStr); // "7:00 - 8:00pm"
  if (t) {
    const startMatch = t.match(/^(\d{1,2})(?::(\d{2}))?/);
    const ampmMatch = t.match(/\b(am|pm)\b/i);

    if (startMatch) {
      hours = parseInt(startMatch[1], 10);
      minutes = startMatch[2] ? parseInt(startMatch[2], 10) : 0;

      const ampm = ampmMatch ? ampmMatch[1].toLowerCase() : null;
      if (ampm) {
        if (hours === 12) hours = ampm === "am" ? 0 : 12;
        else if (ampm === "pm") hours += 12;
      }
    }
  }

  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    hours,
    minutes,
    0,
    0
  );
}

function toggleSetValue(set, value, setter) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setter(next);
}

/* Small calendar icon that cannot scale wrong */
function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ width: 14, height: 14, flex: "0 0 14px" }}
    >
      <path
        fill="currentColor"
        d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1.5A2.5 2.5 0 0 1 22 6.5v13A2.5 2.5 0 0 1 19.5 22h-15A2.5 2.5 0 0 1 2 19.5v-13A2.5 2.5 0 0 1 4.5 4H6V3a1 1 0 0 1 1-1Zm12.5 6H4.5a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h15a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5ZM6 10h3v3H6v-3Zm0 5h3v3H6v-3Zm5-5h3v3h-3v-3Zm0 5h3v3h-3v-3Zm5-5h3v3h-3v-3Z"
      />
    </svg>
  );
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

        const parsed = (data.items || []).map((row, idx) => {
          const date = row["Date of the Event"];
          const time = row["Time of the event"];

          return {
            id: safeStr(row.id) || String(idx + 1),
            title: safeStr(row["Name of Event"]),
            presenter: safeStr(row["Presenter / Vendor (Tag)"]),
            description: safeStr(row["Description"]),
            ce: safeStr(row["Hours (Tag)"]),
            cost: safeStr(row["Cost"]),
            link: safeStr(row["Registration Link"]),
            thumb: safeStr(row["Thumbnail Link"]),
            date,
            time,
            categories: normalizeListField(row["Category Tags"]),
            startAt: parseEventStart(date, time),
          };
        });

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

  // Hide past events
  const upcomingItems = useMemo(() => {
    const now = new Date();
    return items.filter((i) => !i.startAt || i.startAt >= now);
  }, [items]);

  // Filter options based on visible (upcoming) items
  const ceOptions = useMemo(() => {
    const set = new Set(upcomingItems.map((i) => i.ce).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [upcomingItems]);

  const presenterOptions = useMemo(() => {
    const set = new Set(upcomingItems.map((i) => i.presenter).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [upcomingItems]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    upcomingItems.forEach((i) => i.categories.forEach((c) => set.add(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [upcomingItems]);

  // Apply filters + search + sort by soonest
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

    return upcomingItems
      .filter((i) => matchesQuery(i) && matchesCE(i) && matchesPresenter(i) && matchesCategory(i))
      .sort((a, b) => {
        const at = a.startAt ? a.startAt.getTime() : Number.POSITIVE_INFINITY;
        const bt = b.startAt ? b.startAt.getTime() : Number.POSITIVE_INFINITY;
        return at - bt;
      });
  }, [upcomingItems, query, selectedCE, selectedPresenters, selectedCategories]);

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
                    <span className="eventBtn">
                      <CalendarIcon />
                      Register Now
                    </span>
                  </div>
                </div>
              </a>
            ))}
        </main>
      </div>
    </div>
  );
}
