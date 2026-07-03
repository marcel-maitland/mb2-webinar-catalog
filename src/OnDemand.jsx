import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import "./catalog-extras.css";
import "./on-demand.css";

const safe = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const isUrl = (u) => safe(u).startsWith("http");

export default function OnDemand() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const { data, error } = await supabase
          .from("on_demand_courses")
          .select("*")
          .eq("is_published", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (!cancelled) setRows(data || []);
      } catch (e) {
        console.error("On-demand load error:", e);
        if (!cancelled) {
          setRows([]);
          setLoadError(e?.message || "Failed to load courses.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = safe(query).toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${safe(r.title)} ${safe(r.description)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  return (
    <div className="page">
      <header className="header">
        <div className="headerLeft">
          <div className="titleRow">
            <h1>On Demand Courses</h1>
          </div>
          <p>
            Access our library of on-demand continuing education courses.
            Learn on your schedule, at your pace.
          </p>
        </div>

        <input
          className="search"
          placeholder="Search on-demand courses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      <div className="odResults">
        <div className="odResultsInner">
          <span className="odResultsCount">
            <strong>{filtered.length}</strong> {filtered.length === 1 ? "course" : "courses"}
          </span>
        </div>
      </div>

      <div className="layoutTop">
        <main className="mainFull">
          {loading && <div className="center">Loading…</div>}

          {!loading && loadError && (
            <div className="errorBox">
              <div className="errorTitle">Data not loading</div>
              <div className="errorLine">
                <strong>Error:</strong> {loadError}
              </div>
            </div>
          )}

          {!loading && !loadError && filtered.length === 0 && (
            <div className="center">
              {query ? "No courses match your search." : "No on-demand courses available yet."}
            </div>
          )}

          {!loading && !loadError && filtered.length > 0 && (
            <div className="odGrid">
              {filtered.map((c) => (
                <OnDemandCard key={c.id} course={c} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function OnDemandCard({ course }) {
  const thumbOk = isUrl(course.thumbnail_url);
  const canRegister = isUrl(course.course_url);

  return (
    <article className="card cardElevated odCard">
      <div className={`thumb ${thumbOk ? "" : "thumbNoImg"}`}>
        {thumbOk ? (
          <img
            src={course.thumbnail_url}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.parentElement.classList.add("thumbNoImg");
            }}
          />
        ) : null}
        <span className="thumbGradient" aria-hidden="true" />

        {/* "ON DEMAND" pill in top-left corner — replaces the EXCLUSIVE badge */}
        <span className="odCardBadge">
          {course.type === "Learning Path" ? "Learning Path" : "On Demand"}
        </span>

        {/* Play icon in bottom-left — signals video/course content */}
        <span className="odPlayBadge" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.95)"/>
            <path d="M10 8l6 4-6 4V8z" fill="#0F172A"/>
          </svg>
        </span>
      </div>

      <div className="body">
        <h3 className="title" title={course.title}>{course.title}</h3>

        {safe(course.description) ? (
          <p className="descFull" title={course.description}>
            {course.description}
          </p>
        ) : null}

        <div className="sessions">
          <div className="sessionGroup">
            <div className="session">
              <span className="sessionLabel">Available anytime</span>
              {canRegister ? (
                <a
                  className="sessionBtn"
                  href={course.course_url}
                  target="_blank"
                  rel="noopener"
                >
                  Take Course →
                </a>
              ) : (
                <span className="muted" style={{ fontSize: 13 }}>
                  Course link not set
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
