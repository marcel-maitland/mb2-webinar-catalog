import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useClient } from "./AdminApp.jsx";
import CategoryManagerModal from "./CategoryManager.jsx";
import "./admin.css";
import "./on-demand-admin.css";

/* Admin page for managing on-demand courses.
   Super admin only — checked at the AdminApp level.
   Uses the SAME list/table format as the live events admin page. */

const STATUS_FILTERS = [
  { id: "all",       label: "All" },
  { id: "published", label: "Published" },
  { id: "drafts",    label: "Drafts" },
];
const TYPE_FILTERS = [
  { id: "all",    label: "All types" },
  { id: "course", label: "Courses" },
  { id: "path",   label: "Learning paths" },
];

const fmtDate = (iso) => {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const typePillClass = (type) =>
  type === "Learning Path" ? "elFmtHybrid" : "elFmtWebinar";

export default function OnDemandList() {
  const { currentClientId, isSuperAdmin } = useClient();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    () => localStorage.getItem("odStatusFilter") || "all"
  );
  const [typeFilter, setTypeFilter] = useState(
    () => localStorage.getItem("odTypeFilter") || "all"
  );
  const [exclusiveOnly, setExclusiveOnly] = useState(
    () => localStorage.getItem("odExclusiveOnly") === "1"
  );
  const [showCatMgr, setShowCatMgr] = useState(false);

  useEffect(() => { localStorage.setItem("odStatusFilter", statusFilter); }, [statusFilter]);
  useEffect(() => { localStorage.setItem("odTypeFilter", typeFilter); }, [typeFilter]);
  useEffect(() => { localStorage.setItem("odExclusiveOnly", exclusiveOnly ? "1" : "0"); }, [exclusiveOnly]);

  const load = async () => {
    setLoading(true);
    setError("");
    const [courseRes, vendorRes] = await Promise.all([
      supabase
        .from("on_demand_courses")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      currentClientId
        ? supabase
            .from("vendors")
            .select("name, logo_url, default_thumb_url")
            .eq("client_id", currentClientId)
        : Promise.resolve({ data: [] }),
    ]);
    if (courseRes.error) { setError(courseRes.error.message); setLoading(false); return; }

    // Vendor name → logo fallback, same as the events list.
    const vendorByName = {};
    for (const v of vendorRes.data || []) {
      if (v.name) vendorByName[v.name.toLowerCase()] = v;
    }
    const enriched = (courseRes.data || []).map((r) => ({
      ...r,
      _effective_logo_url:
        (r.vendor_logo_url && r.vendor_logo_url.trim()) ||
        vendorByName[(r.vendor || "").toLowerCase()]?.logo_url ||
        "",
      _effective_thumb_url:
        (r.thumbnail_url && r.thumbnail_url.trim()) ||
        vendorByName[(r.vendor || "").toLowerCase()]?.default_thumb_url ||
        "",
    }));

    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentClientId]);

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

  const toggleMb2 = async (row) => {
    const next = !row.mb2_exclusive;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, mb2_exclusive: next } : r)));
    const { error } = await supabase
      .from("on_demand_courses")
      .update({ mb2_exclusive: next })
      .eq("id", row.id);
    if (error) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, mb2_exclusive: !next } : r)));
      alert("Failed: " + error.message);
    }
  };

  const toggleLock = async (row) => {
    const next = !row.is_locked;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_locked: next } : r)));
    const { error } = await supabase
      .from("on_demand_courses")
      .update({ is_locked: next })
      .eq("id", row.id);
    if (error) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_locked: !next } : r)));
      alert("Failed: " + error.message);
    }
  };

  const remove = async (row) => {
    if (!confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("on_demand_courses").delete().eq("id", row.id);
    if (error) return alert("Failed: " + error.message);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const duplicate = async (row) => {
    // Strip server-managed + display-only fields so we can re-insert a clean copy
    const { id, created_at, updated_at, _effective_logo_url, _effective_thumb_url, ...rest } = row;
    const copy = {
      ...rest,
      title: `${row.title} (copy)`,
      is_published: false, // safer default — the duplicate is a draft until you publish
    };
    const { data, error } = await supabase
      .from("on_demand_courses")
      .insert(copy)
      .select()
      .single();
    if (error) return alert("Duplicate failed: " + error.message);
    navigate(`/admin/on-demand/${data.id}`);
  };

  const counts = useMemo(() => {
    const c = { all: rows.length, published: 0, drafts: 0, courses: 0, paths: 0, mb2: 0 };
    for (const r of rows) {
      if (r.is_published) c.published++;
      else c.drafts++;
      if (r.type === "Learning Path") c.paths++;
      else c.courses++;
      if (r.mb2_exclusive) c.mb2++;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      // Status
      .filter((r) => {
        if (statusFilter === "published") return r.is_published;
        if (statusFilter === "drafts")    return !r.is_published;
        return true;
      })
      // Type
      .filter((r) => {
        if (typeFilter === "course") return r.type !== "Learning Path";
        if (typeFilter === "path")   return r.type === "Learning Path";
        return true;
      })
      // Exclusive toggle
      .filter((r) => !exclusiveOnly || r.mb2_exclusive)
      // Search
      .filter((r) => {
        if (!q) return true;
        const cats = Array.isArray(r.categories) ? r.categories.join(" ") : "";
        return `${r.title} ${r.vendor ?? ""} ${cats} ${r.description ?? ""}`
          .toLowerCase()
          .includes(q);
      });
  }, [rows, query, statusFilter, typeFilter, exclusiveOnly]);

  return (
    <section className="elPage">
      {/* ============================== HERO ============================== */}
      <header className="elHero">
        <div className="elHeroTop">
          <div>
            <p className="elKicker">Catalog</p>
            <h1 className="elH1">On-Demand Courses</h1>
            <p className="elHeroLead">
              Manage your on-demand continuing education library. Published items appear on the public on-demand catalog.
            </p>
          </div>
          {isSuperAdmin && (
            <div className="odHeroActions">
              <button
                type="button"
                className="ghostBtn"
                onClick={() => setShowCatMgr(true)}
              >
                Manage categories
              </button>
              <Link to="/admin/on-demand/import" className="ghostBtn">
                Bulk import
              </Link>
              <Link to="/admin/on-demand/new" className="elPrimaryBtn">
                <span className="elPlus">+</span> New course
              </Link>
            </div>
          )}
        </div>

        <div className="elStats">
          <Stat label="Total"          value={counts.all}       tone="neutral" />
          <Stat label="Published"      value={counts.published} tone="accent" />
          <Stat label="Drafts"         value={counts.drafts}    tone="muted" />
          <Stat label="MB2 Exclusive"  value={counts.mb2}       tone="gold" />
          <Stat label="Courses"        value={counts.courses}   tone="green" />
          <Stat label="Learning paths" value={counts.paths}     tone="blue" />
        </div>
      </header>

      {/* ============================== TOOLBAR ============================== */}
      <div className="elToolbar elToolbarStacked">
        <div className="elToolbarRowExclusive">
          <button
            type="button"
            className={`elExclusiveToggle ${exclusiveOnly ? "active" : ""}`}
            aria-pressed={exclusiveOnly}
            onClick={() => setExclusiveOnly((v) => !v)}
            title="Show only courses flagged as MB2 Exclusive"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M12 2l2.9 6 6.6.6-5 4.5 1.5 6.4L12 16.8 5.9 19.5 7.5 13.1 2.5 8.6l6.6-.6L12 2z" fill="currentColor"/>
            </svg>
            Only MB2 Exclusive
            <span className="elFilterCount">{counts.mb2}</span>
          </button>
        </div>

        <div className="elToolbarRowFilters">
          <div className="elFilterGroup" role="group" aria-label="Status">
            <span className="elFilterGroupLabel">Status</span>
            <div className="elFilterPills" role="tablist">
              {STATUS_FILTERS.map((f) => {
                const n = f.id === "all" ? counts.all
                        : f.id === "published" ? counts.published
                        : counts.drafts;
                return (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={statusFilter === f.id}
                    className={`elFilterPill ${statusFilter === f.id ? "active" : ""}`}
                    onClick={() => setStatusFilter(f.id)}
                  >
                    {f.label}
                    <span className="elFilterCount">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <span className="elFilterDivider" aria-hidden="true" />

          <div className="elFilterGroup" role="group" aria-label="Type">
            <span className="elFilterGroupLabel">Type</span>
            <div className="elFilterPills" role="tablist">
              {TYPE_FILTERS.map((f) => {
                const n = f.id === "all" ? counts.all
                        : f.id === "course" ? counts.courses
                        : counts.paths;
                return (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={typeFilter === f.id}
                    className={`elFilterPill ${typeFilter === f.id ? "active" : ""}`}
                    onClick={() => setTypeFilter(f.id)}
                  >
                    {f.label}
                    <span className="elFilterCount">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="elSearch">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search by title, vendor, or category…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="elSearchClear" onClick={() => setQuery("")} aria-label="Clear search">×</button>
          )}
        </div>
      </div>

      {/* ============================== TABLE ============================== */}
      {error && <div className="evErrorBanner">{error}</div>}

      {loading ? (
        <div className="formLoading"><div className="spinner" /> Loading courses…</div>
      ) : visible.length === 0 ? (
        <EmptyState
          query={query}
          filtered={statusFilter !== "all" || typeFilter !== "all" || exclusiveOnly}
          onClear={() => {
            setQuery("");
            setStatusFilter("all");
            setTypeFilter("all");
            setExclusiveOnly(false);
          }}
        />
      ) : (
        <div className="elTableWrap">
          <div className="elTableHead odTableHead">
            <div className="elColTitle">Course</div>
            <div className="elColDate">Release date</div>
            <div className="elColVendor">Vendor</div>
            <div className="elColFormat">Type</div>
            <div className="elColStar" title="MB2 Exclusive">Exclusive</div>
            <div className="elColPublish">Publish</div>
            <div className="elColActions" />
          </div>

          {visible.map((r) => {
            const readOnly = !!r.is_locked && !isSuperAdmin;
            return (
              <article key={r.id} className={`elRow odTableRow ${readOnly ? "odRowLocked" : ""}`}>
                <div className="elColTitle">
                  <Link to={`/admin/on-demand/${r.id}`} className="elThumb">
                    {r._effective_thumb_url
                      ? <img src={r._effective_thumb_url} alt="" loading="lazy" />
                      : <span className="elThumbPh" />}
                  </Link>
                  <div className="elTitleWrap">
                    <Link to={`/admin/on-demand/${r.id}`} className="elTitleLink">{r.title || "(untitled)"}</Link>
                    <div className="elTitleMeta">
                      {r.is_featured && (
                        <span
                          className="odFeaturedChip"
                          title={
                            r.featured_until
                              ? `Featured through ${String(r.featured_until).slice(0, 10)} — then returns to normal ordering`
                              : "Featured — always at the top of the public catalog"
                          }
                        >
                          ★ Featured
                          {r.featured_until && (
                            <span style={{ fontWeight: 500, opacity: 0.85 }}>
                              {" "}· until {String(r.featured_until).slice(5, 7)}/{String(r.featured_until).slice(8, 10)}
                            </span>
                          )}
                        </span>
                      )}
                      {r.is_locked && (
                        <span className="odLockChip" title={isSuperAdmin ? "Locked — clients can view but not edit" : "Locked by MB2 — view only"}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2.4"/>
                            <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2.4"/>
                          </svg>
                          Locked
                        </span>
                      )}
                      {r.ce_hours != null && r.ce_hours !== "" && (
                        <span className="elCeChip">{r.ce_hours} CE</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="elColDate">
                  <span className="elDate">{fmtDate(r.release_date)}</span>
                </div>

                <div className="elColVendor">
                  {r._effective_logo_url
                    ? <img className="elVendorLogo" src={r._effective_logo_url} alt="" />
                    : <span className="elVendorLogo elVendorLogoEmpty" />}
                  <span className="elVendorName">{r.vendor || "—"}</span>
                </div>

                <div className="elColFormat">
                  <span className={`elFmtPill ${typePillClass(r.type)}`}>
                    {r.type === "Learning Path" ? "Learning Path" : "Course"}
                  </span>
                </div>

                <div className="elColStar">
                  <button
                    type="button"
                    className={`mb2Star ${r.mb2_exclusive ? "mb2StarOn" : ""}`}
                    onClick={() => !readOnly && toggleMb2(r)}
                    disabled={readOnly}
                    title={readOnly ? "Locked by MB2" : r.mb2_exclusive ? "Remove MB2 Exclusive flag" : "Mark as MB2 Exclusive"}
                    aria-label="Toggle MB2 Exclusive"
                  >★</button>
                </div>

                <div className="elColPublish">
                  <label
                    className={`switch ${readOnly ? "switchDisabled" : ""}`}
                    title={readOnly ? "Locked by MB2" : r.is_published ? "Click to unpublish" : "Click to publish"}
                  >
                    <input
                      type="checkbox"
                      checked={!!r.is_published}
                      disabled={readOnly}
                      onChange={() => !readOnly && togglePublish(r)}
                    />
                    <span className="switchSlider" />
                  </label>
                </div>

                <div className="elColActions">
                  {isSuperAdmin && (
                    <button
                      type="button"
                      className={`elIconBtn odLockBtn ${r.is_locked ? "isLocked" : ""}`}
                      onClick={() => toggleLock(r)}
                      title={r.is_locked ? "Unlock (lets clients edit this course)" : "Lock (clients can view but not edit)"}
                      aria-label="Toggle lock"
                    >
                      {r.is_locked ? (
                        <svg viewBox="0 0 24 24" width="16" height="16">
                          <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                          <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="16" height="16">
                          <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                          <path d="M8 10V7a4 4 0 0 1 7.5-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      )}
                    </button>
                  )}
                  {readOnly ? (
                    <Link
                      to={`/admin/on-demand/${r.id}`}
                      className="elIconBtn"
                      title="View (locked by MB2)"
                      aria-label="View course"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                    </Link>
                  ) : (
                    <Link
                      to={`/admin/on-demand/${r.id}`}
                      className="elIconBtn"
                      title="Edit"
                      aria-label="Edit course"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </Link>
                  )}
                  {isSuperAdmin && (
                    <button
                      type="button"
                      className="elIconBtn"
                      onClick={() => duplicate(r)}
                      title="Duplicate (creates a draft copy you can edit)"
                      aria-label="Duplicate course"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button
                      type="button"
                      className="elIconBtn elIconBtnDanger"
                      onClick={() => remove(r)}
                      title="Delete"
                      aria-label="Delete course"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M6 7h12M9 7V4h6v3m-7 0v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <CategoryManagerModal
        open={showCatMgr}
        onClose={() => setShowCatMgr(false)}
        onApplied={(event) => {
          // Renames/deletes touch course rows — refresh so rows stay accurate.
          if (event.type === "rename" || event.type === "delete") load();
        }}
      />
    </section>
  );
}

/* ---------- subcomponents ---------- */

function Stat({ label, value, tone }) {
  return (
    <div className={`elStat elStat-${tone}`}>
      <div className="elStatValue">{value}</div>
      <div className="elStatLabel">{label}</div>
    </div>
  );
}

function EmptyState({ query, filtered, onClear }) {
  const hasFilters = !!query || !!filtered;
  return (
    <div className="elEmpty">
      <div className="elEmptyArt">🎓</div>
      <h3>{hasFilters ? "Nothing matches" : "No courses yet"}</h3>
      <p>
        {hasFilters
          ? "Try clearing the search or loosening a filter."
          : "Add your first course or import a whole catalog from a spreadsheet."}
      </p>
      <div className="elEmptyActions">
        {hasFilters
          ? <button className="primaryBtn" onClick={onClear}>Clear all filters</button>
          : (<>
              <Link to="/admin/on-demand/new" className="primaryBtn">+ New course</Link>
              <Link to="/admin/on-demand/import" className="ghostBtn">Import from spreadsheet</Link>
            </>)}
      </div>
    </div>
  );
}
