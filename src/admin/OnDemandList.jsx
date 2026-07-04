import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import "./admin.css";
import "./on-demand-admin.css";

/* Admin page for managing on-demand courses.
   Super admin only — checked at the AdminApp level. */
export default function OnDemandList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // 'all' | 'published' | 'draft' | 'course' | 'path'

  const load = async () => {
    setLoading(true);
    setError("");
    const { data, error } = await supabase
      .from("on_demand_courses")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const togglePublish = async (row) => {
    const next = !row.is_published;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_published: next } : r)));
    const { error } = await supabase
      .from("on_demand_courses")
      .update({ is_published: next })
      .eq("id", row.id);
    if (error) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_published: !next } : r)));
      alert("Failed: " + error.message);
    }
  };

  const remove = async (row, e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("on_demand_courses").delete().eq("id", row.id);
    if (error) return alert("Delete failed: " + error.message);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const duplicate = async (row, e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const { data, error } = await supabase
      .from("on_demand_courses")
      .insert({
        title: `${row.title} (copy)`,
        type: row.type || "Course",
        description: row.description,
        thumbnail_url: row.thumbnail_url,
        course_url: row.course_url,
        is_published: false,
      })
      .select()
      .single();
    if (error) return alert("Duplicate failed: " + error.message);
    navigate(`/admin/on-demand/${data.id}`);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      // Filter tab
      if (filter === "published" && !r.is_published) return false;
      if (filter === "draft" && r.is_published) return false;
      if (filter === "course" && r.type !== "Course") return false;
      if (filter === "path" && r.type !== "Learning Path") return false;
      // Search
      if (q) {
        const hay = `${r.title || ""} ${r.description || ""} ${r.type || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, filter]);

  const published = rows.filter((r) => r.is_published).length;
  const drafts = rows.length - published;
  const learningPaths = rows.filter((r) => r.type === "Learning Path").length;
  const singleCourses = rows.length - learningPaths;

  return (
    <div className="adminMain odAdmin">
      {/* ─── HEADER: compact, action-rich, gradient accent ─── */}
      <div className="odAdminHeader">
        <div className="odAdminHeaderLeft">
          <div className="odAdminBadge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M10 8l6 4-6 4V8z" fill="currentColor"/>
            </svg>
            <span>ON-DEMAND CATALOG</span>
          </div>
          <h1 className="odAdminTitle">Courses & Learning Paths</h1>
          <p className="odAdminSubtitle">
            Manage your on-demand continuing education library. Published items appear at{" "}
            <a href="/on-demand" target="_blank" rel="noopener" className="odAdminLink">
              events.dentlogics.com/on-demand
            </a>.
          </p>
        </div>
        <div className="odAdminHeaderActions">
          <Link to="/admin/on-demand/import" className="odAdminSecondaryBtn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 3v12m0-12l-4 4m4-4l4 4M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Bulk import
          </Link>
          <Link to="/admin/on-demand/new" className="odAdminPrimaryBtn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            New course
          </Link>
        </div>
      </div>

      {/* ─── STATS: compact card row ─── */}
      <div className="odStats">
        <StatChip
          label="Total"
          value={rows.length}
          tone="neutral"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M4 10h16M10 4v16" stroke="currentColor" strokeWidth="2"/>
            </svg>
          }
        />
        <StatChip
          label="Published"
          value={published}
          tone="success"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
        <StatChip
          label="Drafts"
          value={drafts}
          tone="warning"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M4 20l4-1 10-10-3-3L5 16l-1 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
            </svg>
          }
        />
        <StatChip
          label="Learning paths"
          value={learningPaths}
          tone="info"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          }
        />
      </div>

      {error && <div className="errorBox">{error}</div>}

      {/* ─── TOOLBAR: filters + search ─── */}
      <div className="odToolbar">
        <div className="odFilterTabs" role="tablist">
          <FilterTab active={filter === "all"} onClick={() => setFilter("all")} count={rows.length}>All</FilterTab>
          <FilterTab active={filter === "published"} onClick={() => setFilter("published")} count={published}>Published</FilterTab>
          <FilterTab active={filter === "draft"} onClick={() => setFilter("draft")} count={drafts}>Drafts</FilterTab>
          <span className="odFilterDivider" />
          <FilterTab active={filter === "course"} onClick={() => setFilter("course")} count={singleCourses}>Courses</FilterTab>
          <FilterTab active={filter === "path"} onClick={() => setFilter("path")} count={learningPaths}>Learning paths</FilterTab>
        </div>

        <div className="odSearchWrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="odSearchIcon">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            className="odSearchInput"
            placeholder="Search courses…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="odSearchClear" onClick={() => setQuery("")} aria-label="Clear search">
              ×
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="odLoading"><div className="spinner" /> Loading courses…</div>
      ) : filtered.length === 0 && rows.length === 0 ? (
        // First-run empty state
        <EmptyFirstRun />
      ) : filtered.length === 0 ? (
        // Empty due to filter
        <div className="odEmpty">
          <h3>No courses match your filter</h3>
          <p className="muted">Try clearing the search or a different tab.</p>
          <button
            type="button"
            className="ghostBtn"
            onClick={() => { setQuery(""); setFilter("all"); }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        // ─── CARD GRID ───
        <div className="odCardGrid">
          {filtered.map((r) => (
            <CourseAdminCard
              key={r.id}
              course={r}
              onTogglePublish={() => togglePublish(r)}
              onDuplicate={(e) => duplicate(r, e)}
              onDelete={(e) => remove(r, e)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function StatChip({ label, value, tone = "neutral", icon }) {
  return (
    <div className={`odStat odStat-${tone}`}>
      <div className="odStatIcon">{icon}</div>
      <div className="odStatBody">
        <div className="odStatValue">{value}</div>
        <div className="odStatLabel">{label}</div>
      </div>
    </div>
  );
}

function FilterTab({ active, onClick, count, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`odFilterTab ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {children}
      <span className="odFilterTabCount">{count}</span>
    </button>
  );
}

function CourseAdminCard({ course, onTogglePublish, onDuplicate, onDelete }) {
  const hasThumb = !!(course.thumbnail_url && course.thumbnail_url.trim());
  const isPath = course.type === "Learning Path";

  return (
    <Link to={`/admin/on-demand/${course.id}`} className="odGridCard">
      <div className="odGridCardThumb">
        {hasThumb ? (
          <img src={course.thumbnail_url} alt="" loading="lazy" />
        ) : (
          <div className="odGridCardThumbPh">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
              <circle cx="9" cy="11" r="1.5" fill="currentColor"/>
              <path d="M21 17l-5-5-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
        {/* Type badge */}
        <span className={`odGridCardType ${isPath ? "isPath" : ""}`}>
          {isPath ? "Learning Path" : "On Demand"}
        </span>
        {/* Publish status badge */}
        <span className={`odGridCardStatus ${course.is_published ? "" : "isDraft"}`}>
          {course.is_published ? "Published" : "Draft"}
        </span>
      </div>

      <div className="odGridCardBody">
        <h3 className="odGridCardTitle">{course.title || "(untitled)"}</h3>
        {course.description ? (
          <p className="odGridCardDesc">{course.description}</p>
        ) : (
          <p className="odGridCardDesc muted"><em>No description</em></p>
        )}
        {course.course_url && (
          <div className="odGridCardUrl">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 10-5.66-5.66l-1.5 1.5M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 105.66 5.66l1.5-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{course.course_url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}{course.course_url.length > 47 ? "…" : ""}</span>
          </div>
        )}
      </div>

      <div className="odGridCardFoot" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        <button
          type="button"
          className={`odPublishToggle ${course.is_published ? "on" : "off"}`}
          onClick={onTogglePublish}
          title={course.is_published ? "Unpublish" : "Publish"}
          aria-label={course.is_published ? "Unpublish" : "Publish"}
        >
          <span className="odPublishToggleSlider" />
        </button>
        <div className="odGridCardActions">
          <button
            type="button"
            className="odGridCardIconBtn"
            onClick={onDuplicate}
            title="Duplicate"
            aria-label="Duplicate"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M4 16V6a2 2 0 012-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            type="button"
            className="odGridCardIconBtn danger"
            onClick={onDelete}
            title="Delete"
            aria-label="Delete"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 7h12M9 7V4h6v3m-7 0v13a1 1 0 001 1h6a1 1 0 001-1V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </Link>
  );
}

function EmptyFirstRun() {
  return (
    <div className="odEmptyFirst">
      <div className="odEmptyIcon">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#93c5fd" strokeWidth="1.5"/>
          <path d="M10 8l6 4-6 4V8z" fill="#3b82f6"/>
        </svg>
      </div>
      <h3>Build your on-demand library</h3>
      <p className="muted">
        Add courses one at a time or import a whole catalog from a spreadsheet.
        Published courses appear immediately on your public on-demand catalog.
      </p>
      <div className="odEmptyActions">
        <Link to="/admin/on-demand/new" className="primaryBtn">
          + Add your first course
        </Link>
        <Link to="/admin/on-demand/import" className="ghostBtn">
          Import from spreadsheet
        </Link>
      </div>
      <div className="odEmptyExamples">
        <div className="odEmptyExamplesLabel">EXAMPLES</div>
        <div className="odEmptyExampleGrid">
          <div className="odEmptyExample">Live implant surgery videos</div>
          <div className="odEmptyExample">CE-certified webinar recordings</div>
          <div className="odEmptyExample">Full learning paths</div>
        </div>
      </div>
    </div>
  );
}
