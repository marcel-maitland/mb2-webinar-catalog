import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import "./catalog-extras.css";
import "./on-demand.css";

const safe = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const isUrl = (u) => safe(u).startsWith("http");
const uniq = (arr) => [...new Set(arr.filter((v) => v !== null && v !== undefined && v !== ""))];

export default function OnDemand() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [typeSelected, setTypeSelected] = useState(new Set());
  const [ceSelected, setCeSelected] = useState(new Set());

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

  const types = useMemo(
    () => uniq(rows.map((r) => r.type)).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const ceHours = useMemo(() => {
    const vals = rows.map((r) => r.ce_hours).filter((n) => typeof n === "number");
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
    setTypeSelected(new Set());
    setCeSelected(new Set());
  };

  const filtered = useMemo(() => {
    const q = safe(query).toLowerCase();
    const typeOn = typeSelected.size > 0;
    const ceOn = ceSelected.size > 0;
    return rows.filter((r) => {
      if (typeOn && !typeSelected.has(r.type)) return false;
      if (ceOn && !(typeof r.ce_hours === "number" && ceSelected.has(r.ce_hours))) return false;
      if (q) {
        const hay = `${safe(r.title)} ${safe(r.description)} ${safe(r.type)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, typeSelected, ceSelected]);

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

      {/* Horizontal filter bar — same pattern as the events catalog */}
      <OdFilterBar
        types={types} typeSelected={typeSelected} setTypeSelected={setTypeSelected}
        ceHours={ceHours} ceSelected={ceSelected} setCeSelected={setCeSelected}
        toggle={toggle}
        clearFilters={clearFilters}
        filteredCount={filtered.length}
      />

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
              {query || typeSelected.size > 0 || ceSelected.size > 0
                ? "No courses match your filters."
                : "No on-demand courses available yet."}
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
  const ce = typeof course.ce_hours === "number" ? course.ce_hours : null;
  const ceLabel = ce != null
    ? `${ce} CE${ce === 1 ? "" : ""} ${ce === 1 ? "credit" : "credits"}`
    : "Available anytime";

  const cardInner = (
    <>
      <div className={`thumb odThumb ${thumbOk ? "" : "thumbNoImg"}`}>
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
              <span className="sessionLabel odCeLabel">{ceLabel}</span>
              {canRegister ? (
                <span className="sessionBtn odCardCta" aria-hidden="true">
                  Go To Course →
                </span>
              ) : (
                <span className="muted" style={{ fontSize: 13 }}>
                  Course link not set
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return canRegister ? (
    <a
      className="card cardElevated odCard odCardClickable"
      href={course.course_url}
      target="_blank"
      rel="noopener"
      aria-label={`Open course: ${course.title}`}
    >
      {cardInner}
    </a>
  ) : (
    <article className="card cardElevated odCard">
      {cardInner}
    </article>
  );
}

/* =====================================================================
   FILTER BAR + POPOVER — mirrors the events catalog filter bar so
   both catalogs feel consistent. Filters by Type and CE Hours.
===================================================================== */
function OdFilterBar(props) {
  const {
    types, typeSelected, setTypeSelected,
    ceHours, ceSelected, setCeSelected,
    toggle, clearFilters, filteredCount,
  } = props;

  const hasAnyFilter = typeSelected.size > 0 || ceSelected.size > 0;
  const courseLabel = filteredCount === 1 ? "course" : "courses";

  return (
    <div className="filterBar" role="toolbar" aria-label="Course filters">
      <div className="filterBarInner">
        <OdFilterPopover
          label="Type"
          options={types}
          selected={typeSelected}
          onToggle={(v) => toggle(setTypeSelected, v)}
          onClear={() => setTypeSelected(new Set())}
        />
        <OdFilterPopover
          label="CE Hours"
          options={ceHours}
          selected={ceSelected}
          onToggle={(v) => toggle(setCeSelected, v)}
          onClear={() => setCeSelected(new Set())}
          formatOption={(o) => `${o} CE`}
        />

        <div className="filterBarSpacer" />

        {hasAnyFilter && (
          <button
            type="button"
            className="filterBarClear"
            onClick={clearFilters}
            title="Reset all filters"
          >
            Clear all
          </button>
        )}
        <div className="filterBarCount" aria-live="polite">
          <strong>{filteredCount}</strong> {courseLabel}
        </div>
      </div>
    </div>
  );
}

function OdFilterPopover({ label, options, selected, onToggle, onClear, formatOption }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const count = selected.size;
  const disabled = options.length === 0;

  return (
    <div className="filterPop" ref={ref}>
      <button
        type="button"
        className={`filterPopBtn ${count > 0 ? "active" : ""} ${open ? "open" : ""}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="filterPopLabel">{label}</span>
        {count > 0 && <span className="filterPopCount">{count}</span>}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="filterPopChev">
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="filterPopMenu" role="listbox" aria-label={label}>
          <div className="filterPopList">
            {options.length === 0 ? (
              <div className="filterPopEmpty">No options</div>
            ) : (
              options.map((opt) => {
                const key = String(opt);
                const displayLabel = formatOption ? formatOption(opt) : String(opt);
                const isSel = selected.has(opt);
                return (
                  <label key={key} className={`filterPopItem ${isSel ? "selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => onToggle(opt)}
                    />
                    <span className="filterPopItemLabel">{displayLabel}</span>
                    {isSel && <span className="filterPopItemCheck" aria-hidden="true">✓</span>}
                  </label>
                );
              })
            )}
          </div>
          {count > 0 && (
            <div className="filterPopFooter">
              <button
                type="button"
                className="filterPopClearBtn"
                onClick={() => onClear()}
              >
                Clear {label.toLowerCase()}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
