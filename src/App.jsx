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
  t = t.replace(/\b(CENTRAL TIME|MOUNTAIN TIME|PACIFIC TIME|EASTERN TIME)\b/gi, "");
  t = t.replace(/\b(CST|CDT|MST|MDT|PST|PDT|EST|EDT)\b/gi, "");
  t = t.replace(/\s*-\s*/g, " - ");
  t = t.replace(/(\d)(AM|PM)\b/gi, "$1 $2");
  t = t.replace(/\bAM\b/g, "am").replace(/\bPM\b/g, "pm");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/\s(am|pm)\b/g, "$1");
  return t;
}

function parseEventStart(dateStr, timeStr) {
  const rawDate = safeStr(dateStr);
  const base = new Date(rawDate);
  if (isNaN(base.getTime())) return null;

  let hours = 12;
  let minutes = 0;

  const t = normalizeTime(timeStr);
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

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: 14, height: 14, flex: "0 0 14px" }}
    >
      <path
        fill="currentColor"
        d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1.5A2.5 2.5 0 0 1 22 6.5v13A2.5 2.5 0 0 1 19.5 22h-15A2.5 2.5 0 0 1 2 19.5v-13A2.5 2.5 0 0 1 4.5 4H6V3a1 1 0 0 1 1-1Zm12.5 6H4.5a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h15a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5Z"
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
  const [expandedIds, setExpandedIds] = useState(() => new Set());

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
          const time1 = row["Time of the event"];
          const time2 = row["2nd time of the Event"];
          const link1 = row["Registration Link"];
          const link2 = row["Second Registration Link"];
          const vendorLogo = row["Vender Logo"];

          return {
            id: safeStr(row.id) || String(idx + 1),
            title: safeStr(row["Name of Event"]),
            presenter: safeStr(row["Presenter / Vendor (Tag)"]),
            presenterLogo: safeStr(vendorLogo),
            description: safeStr(row["Description"]),
            ce: safeStr(row["Hours (Tag)"]),
            cost: safeStr(row["Cost"]),
            link1: safeStr(link1),
            link2: safeStr(link2),
            time1: safeStr(time1),
            time2: safeStr(time2),
            thumb: safeStr(row["Thumbnail Link"]),
            date: safeStr(date),
            categories: normalizeListField(row["Category Tags"]),
            startAt: parseEventStart(date, time1 || time2),
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

  const upcomingItems = useMemo(() => {
    const now = new Date();
    return items.filter((i) => !i.startAt || i.startAt >= now);
  }, [items]);

  const ceOptions = useMemo(() => {
    const set = new Set(upcomingItems.map((i) => i.ce).filter(Boolean));
    return Array.from(set).sort();
  }, [upcomingItems]);

  const presenterOptions = useMemo(() => {
    const set = new Set(upcomingItems.map((i) => i.presenter).filter(Boolean));
    return Array.from(set).sort();
  }, [upcomingItems]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    upcomingItems.forEach((i) => i.categories.forEach((c) => set.add(c)));
    return Array.from(set).sort();
  }, [upcomingItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return upcomingItems
      .filter((i) => {
        const matchesQuery =
          !q ||
          i.title.toLowerCase().includes(q) ||
          i.presenter.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q);

        const matchesCE =
          selectedCE.size === 0 || selectedCE.has(i.ce);

        const matchesPresenter =
          selectedPresenters.size === 0 || selectedPresenters.has(i.presenter);

        const matchesCategory =
          selectedCategories.size === 0 ||
          i.categories.some((c) => selectedCategories.has(c));

        return matchesQuery && matchesCE && matchesPresenter && matchesCategory;
      })
      .sort((a, b) => {
        const at = a.startAt ? a.startAt.getTime() : Infinity;
        const bt = b.startAt ? b.startAt.getTime() : Infinity;
        return at - bt;
      });
  }, [upcomingItems, query, selectedCE, selectedPresenters, selectedCategories]);

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const timeBox = (time, link) => {
    const t = normalizeTime(time);
    if (!t || !link) return null;

    return (
      <div className="regBox">
        <div>
          <div className="regBoxLabel">Time</div>
          <div className="regBoxTime">{t}</div>
        </div>
        <a className="regBoxBtn" href={link} target="_blank" rel="noreferrer">
          <CalendarIcon />
          Register
        </a>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="layout">
        <aside className="filters">
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
        </aside>

        <main className="grid">
          {filtered.map((w) => {
            const expanded = expandedIds.has(w.id);

            return (
              <div className="eventCard" key={w.id}>
                {w.thumb && (
                  <img src={w.thumb} className="eventThumb" alt={w.title} />
                )}

                <div className="eventBody">
                  <div className="eventDate">{formatShortDate(w.date)}</div>

                  <h2 className="eventTitle">{w.title}</h2>

                  <div className="presenterRow">
                    {w.presenterLogo && (
                      <img
                        className="presenterLogo"
                        src={w.presenterLogo}
                        alt={w.presenter}
                      />
                    )}
                    <div className="presenterText">
                      {w.presenter}
                    </div>
                  </div>

                  <div className="eventMeta">
                    {w.ce} • {w.cost}
                  </div>

                  <p className={`eventDesc ${expanded ? "expanded" : ""}`}>
                    {w.description}
                  </p>

                  <button
                    className="readMoreBtn"
                    onClick={() => toggleExpanded(w.id)}
                  >
                    {expanded ? "Read less" : "Read more"}
                  </button>

                  <div className="regWrap">
                    {timeBox(w.time1, w.link1)}
                    {timeBox(w.time2, w.link2)}
                  </div>
                </div>
              </div>
            );
          })}
        </main>
      </div>
    </div>
  );
}


    </div>
  );
}
