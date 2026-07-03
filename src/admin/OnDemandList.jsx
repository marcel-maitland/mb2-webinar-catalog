import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import "./admin.css";

/* Admin page for managing on-demand courses.
   Super admin only — checked at the AdminApp level. */
export default function OnDemandList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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

  const remove = async (row) => {
    if (!confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("on_demand_courses").delete().eq("id", row.id);
    if (error) return alert("Delete failed: " + error.message);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const duplicate = async (row) => {
    const { data, error } = await supabase
      .from("on_demand_courses")
      .insert({
        title: `${row.title} (copy)`,
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
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.title || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const publishedCount = rows.filter((r) => r.is_published).length;

  return (
    <div className="adminMain evList">
      {/* Hero header */}
      <div className="elHero">
        <div className="elHeroLeft">
          <div className="elHeroLabel">CATALOG</div>
          <h1 className="elHeroTitle">On Demand Courses</h1>
          <p className="elHeroSubtitle">
            Manage your library of on-demand continuing education courses.
            Available to all visitors on the public catalog.
          </p>
        </div>
        <div className="elHeroActions">
          <Link to="/admin/on-demand/new" className="elPrimaryBtn">
            + New course
          </Link>
        </div>
      </div>

      {/* Stats strip */}
      <div className="elStats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <StatCard label="Total courses" value={rows.length} tone="neutral" />
        <StatCard label="Published" value={publishedCount} tone="success" />
        <StatCard label="Drafts" value={rows.length - publishedCount} tone="warning" />
      </div>

      {/* Search */}
      <div className="elToolbar">
        <div className="elToolbarSearch">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" stroke="#94a3b8" strokeWidth="2"/>
            <path d="M20 20l-3-3" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search courses by title or description…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="elClearSearch" onClick={() => setQuery("")}>×</button>
          )}
        </div>
      </div>

      {error && <div className="errorBox">{error}</div>}

      {loading ? (
        <div className="formLoading"><div className="spinner" /> Loading courses…</div>
      ) : filtered.length === 0 ? (
        <div className="elEmpty">
          <h3>{query ? "No courses match your search" : "No courses yet"}</h3>
          <p className="muted">
            {query
              ? "Try a different search term."
              : "Get started by adding your first on-demand course."}
          </p>
          {!query && (
            <Link to="/admin/on-demand/new" className="primaryBtn">
              + Add your first course
            </Link>
          )}
        </div>
      ) : (
        <div className="elRows">
          {/* Column headers */}
          <div className="elRow elRowHeader" style={{ gridTemplateColumns: "minmax(260px, 1.8fr) minmax(200px, 1fr) 90px 90px 116px" }}>
            <div className="elColTitle">Course</div>
            <div className="elColLoc">Course URL</div>
            <div className="elColStatus">Published</div>
            <div className="elColMB2" />
            <div className="elColActions" />
          </div>

          {filtered.map((r) => (
            <article
              key={r.id}
              className="elRow"
              style={{ gridTemplateColumns: "minmax(260px, 1.8fr) minmax(200px, 1fr) 90px 90px 116px" }}
            >
              <div className="elColTitle">
                <Link to={`/admin/on-demand/${r.id}`} className="elThumb">
                  {r.thumbnail_url
                    ? <img src={r.thumbnail_url} alt="" loading="lazy" />
                    : <span className="elThumbPh" />}
                </Link>
                <div className="elTitleWrap">
                  <Link to={`/admin/on-demand/${r.id}`} className="elTitleLink">
                    {r.title || "(untitled)"}
                  </Link>
                  {r.description && (
                    <span className="elTitleMeta">
                      {r.description.length > 100
                        ? r.description.slice(0, 100) + "…"
                        : r.description}
                    </span>
                  )}
                </div>
              </div>
              <div className="elColLoc" style={{ minWidth: 0 }}>
                {r.course_url ? (
                  <a
                    href={r.course_url}
                    target="_blank"
                    rel="noopener"
                    style={{
                      color: "var(--accent)",
                      textDecoration: "none",
                      fontSize: 13,
                      display: "inline-block",
                      maxWidth: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={r.course_url}
                  >
                    {r.course_url.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  <span className="muted" style={{ fontSize: 13 }}>Not set</span>
                )}
              </div>
              <div className="elColStatus">
                <button
                  type="button"
                  className={`evPublishToggle ${r.is_published ? "on" : "off"}`}
                  onClick={() => togglePublish(r)}
                  title={r.is_published ? "Unpublish" : "Publish"}
                >
                  <span className="evPublishSlider" />
                </button>
              </div>
              <div className="elColMB2" />
              <div className="elColActions">
                <Link
                  to={`/admin/on-demand/${r.id}`}
                  className="elActionBtn"
                  title="Edit"
                  aria-label="Edit"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Link>
                <button
                  type="button"
                  className="elActionBtn"
                  onClick={() => duplicate(r)}
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
                  className="elActionBtn"
                  onClick={() => remove(r)}
                  title="Delete"
                  aria-label="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M6 7h12M9 7V4h6v3m-7 0v13a1 1 0 001 1h6a1 1 0 001-1V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone = "neutral" }) {
  return (
    <div className={`elStatCard elStatCard-${tone}`}>
      <div className="elStatValue">{value}</div>
      <div className="elStatLabel">{label}</div>
    </div>
  );
}
