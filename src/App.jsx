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

  t = t.replace(/\b(CENTRAL TIME|CST|CDT)\b/gi, "");
  t = t.replace(/\s*-\s*/g, " - ");
  t = t.replace(/(\d)(AM|PM)\b/gi, "$1 $2");
  t = t.replace(/\bAM\b/g, "am").replace(/\bPM\b/g, "pm");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/\s(am|pm)\b/g, "$1");

  return t;
}

function formatDateLine(dateStr, timeStr) {
  const d = formatShortDate(dateStr);
  const t = normalizeTime(timeStr);
  if (d && t) return `${d}   ${t}`;
  return d || t || "";
}

/* Parse event start to hide past events */
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
    minutes
  );
}

function toggleSetValue(set, value, setter) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setter(next);
}

/* SMALL INLINE ICON (CANNOT SCALE WRONG) */
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
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(DATA_URL, { cache: "no-store" });
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

        setItems(parsed);
      } catch (e) {
        setErr(e?.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const upcomingItems = useMemo(
    () => items.filter((i) => !i.startAt || i.startAt >= new Date()),
    [items]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return upcomingItems
      .filter((i) => !q || i.title.toLowerCase().includes(q))
      .sort((a, b) => (a.startAt?.getTime() || 0) - (b.startAt?.getTime() || 0));
  }, [upcomingItems, query]);

  return (
    <div className="page">
      <header className="topbar">
        <h1>MB2 Webinar Catalog</h1>
        <input
          className="search"
          placeholder="Search webinars"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      <div className="layout">
        <main className="grid">
          {filtered.map((w) => (
            <a className="eventCard" key={w.id} href={w.link} target="_blank" rel="noreferrer">
              <div className="eventThumbWrap">
                <img src={w.thumb} className="eventThumb" alt={w.title} />
              </div>

              <div className="eventBody">
                <div className="eventDate">{formatDateLine(w.date, w.time)}</div>
                <div className="eventTagRow">
                  <span className="eventTag">LIVE WEBINAR</span>
                </div>
                <h2 className="eventTitle">{w.title}</h2>
                <div className="eventMeta">
                  <span>{w.ce} CE Credit</span>
                  <span className="dot">•</span>
                  <span>{w.cost?.toUpperCase() || "FREE"}</span>
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
