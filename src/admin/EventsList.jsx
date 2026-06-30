import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useClient } from "./AdminApp.jsx";

const TIME_FILTERS = [
  { id: "all",      label: "All time" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past",     label: "Past" },
];
const STATUS_FILTERS = [
  { id: "all",       label: "All" },
  { id: "published", label: "Published" },
  { id: "drafts",    label: "Drafts" },
];

const isInPerson = (f) => {
  const s = (f || "").toLowerCase();
  return s === "in-person" || s === "in person" || s === "inperson";
};

const dateStatus = (iso) => {
  if (!iso) return { kind: "unscheduled", label: "Unscheduled" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { kind: "unscheduled", label: "Unscheduled" };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dDay.getTime() === today.getTime()) return { kind: "today", label: "Today" };
  if (dDay < today) return { kind: "past", label: "Past" };
  // Within 7 days
  const diffDays = Math.round((dDay - today) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return { kind: "soon", label: `In ${diffDays} day${diffDays === 1 ? "" : "s"}` };
  return { kind: "upcoming", label: "Upcoming" };
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const formatPillClass = (format) => {
  const s = (format || "").toLowerCase();
  if (s.includes("webinar") || s === "online") return "elFmtWebinar";
  if (s.includes("in-person") || s.includes("in person")) return "elFmtInPerson";
  if (s.includes("hybrid")) return "elFmtHybrid";
  return "elFmtDefault";
};

export default function EventsList() {
  const { currentClientId, currentClient } = useClient();
  const navigate = useNavigate();
  const exclusiveLabel = currentClient?.name
    ? `${currentClient.name} Exclusive`
    : "Exclusive";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  // Three independent filter dimensions. Defaults: Upcoming + All status + Exclusive OFF.
  const [timeFilter, setTimeFilter] = useState(
    () => localStorage.getItem("eventsTimeFilter") || "upcoming"
  );
  const [statusFilter, setStatusFilter] = useState(
    () => localStorage.getItem("eventsStatusFilter") || "all"
  );
  const [exclusiveOnly, setExclusiveOnly] = useState(
    () => localStorage.getItem("eventsExclusiveOnly") === "1"
  );

  useEffect(() => { localStorage.setItem("eventsTimeFilter", timeFilter); }, [timeFilter]);
  useEffect(() => { localStorage.setItem("eventsStatusFilter", statusFilter); }, [statusFilter]);
  useEffect(() => { localStorage.setItem("eventsExclusiveOnly", exclusiveOnly ? "1" : "0"); }, [exclusiveOnly]);

  const load = async () => {
    if (!currentClientId) return;
    setLoading(true);
    setError("");
    const [evRes, vendorRes] = await Promise.all([
      supabase
        .from("events")
        .select("*")
        .eq("client_id", currentClientId)
        .order("event_date", { ascending: true }),
      supabase
        .from("vendors")
        .select("name, logo_url, default_thumb_url")
        .eq("client_id", currentClientId),
    ]);
    if (evRes.error) { setError(evRes.error.message); setLoading(false); return; }

    // Build a vendor name → vendor row map for fallback display.
    const vendorByName = {};
    for (const v of vendorRes.data || []) {
      if (v.name) vendorByName[v.name.toLowerCase()] = v;
    }

    // Enrich each event with `_effective_thumb_url` + `_effective_logo_url`
    // that fall back to the vendor's current logo / default thumbnail when
    // the event row is missing them.
    const enriched = (evRes.data || []).map((r) => {
      const vinfo = vendorByName[(r.vendor || "").toLowerCase()];
      return {
        ...r,
        _effective_thumb_url:
          (r.thumb_url && r.thumb_url.trim()) ||
          vinfo?.default_thumb_url ||
          "",
        _effective_logo_url:
          (r.vendor_logo_url && r.vendor_logo_url.trim()) ||
          vinfo?.logo_url ||
          "",
      };
    });

    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentClientId]);

  const togglePublish = async (row) => {
    const next = !row.is_published;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_published: next } : r)));
    const { error } = await supabase
      .from("events")
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
      .from("events")
      .update({ mb2_exclusive: next })
      .eq("id", row.id);
    if (error) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, mb2_exclusive: !next } : r)));
      alert("Failed: " + error.message);
    }
  };

  const remove = async (row) => {
    if (!confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("events").delete().eq("id", row.id);
    if (error) return alert("Failed: " + error.message);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const duplicate = async (row) => {
    // Strip server-managed fields so we can re-insert a clean copy
    const { id, created_at, updated_at, created_by, ...rest } = row;
    const copy = {
      ...rest,
      title: `${row.title} (copy)`,
      is_published: false,  // safer default — the duplicate is a draft until you publish
    };
    const { data, error } = await supabase
      .from("events")
      .insert(copy)
      .select()
      .single();
    if (error) return alert("Duplicate failed: " + error.message);
    // Drop straight into the edit form so the user can tweak the date
    navigate(`/admin/events/${data.id}`);
  };

  // Counts that drive both the stats hero and the filter pill badges
  const counts = useMemo(() => {
    const c = { all: rows.length, upcoming: 0, past: 0, published: 0, drafts: 0, mb2: 0, thisWeek: 0 };
    for (const r of rows) {
      const s = dateStatus(r.event_date);
      if (s.kind === "upcoming" || s.kind === "today" || s.kind === "soon") c.upcoming++;
      if (s.kind === "soon" || s.kind === "today") c.thisWeek++;
      if (s.kind === "past") c.past++;
      if (r.is_published) c.published++;
      else c.drafts++;
      if (r.mb2_exclusive) c.mb2++;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      // Time
      .filter((r) => {
        const k = dateStatus(r.event_date).kind;
        if (timeFilter === "upcoming") return k === "upcoming" || k === "today" || k === "soon" || k === "unscheduled";
        if (timeFilter === "past")     return k === "past";
        return true;
      })
      // Status
      .filter((r) => {
        if (statusFilter === "published") return r.is_published;
        if (statusFilter === "drafts")    return !r.is_published;
        return true;
      })
      // Exclusive toggle
      .filter((r) => !exclusiveOnly || r.mb2_exclusive)
      // Search
      .filter((r) => {
        if (!q) return true;
        return `${r.title} ${r.vendor ?? ""} ${r.category ?? ""}`.toLowerCase().includes(q);
      });
  }, [rows, query, timeFilter, statusFilter, exclusiveOnly]);

  return (
    <section className="elPage">
      {/* ============================== HERO ============================== */}
      <header className="elHero">
        <div className="elHeroTop">
          <div>
            <p className="elKicker">Catalog</p>
            <h1 className="elH1">Events</h1>
            <p className="elHeroLead">
              Manage every webinar, hands-on, and exclusive that visitors see across the public catalog.
            </p>
          </div>
          <Link to="/admin/events/new" className="elPrimaryBtn">
            <span className="elPlus">+</span> New event
          </Link>
        </div>

        <div className="elStats">
          <Stat label="Total"          value={counts.all}        tone="neutral" />
          <Stat label="Published"      value={counts.published}  tone="accent" />
          <Stat label="Drafts"         value={counts.drafts}     tone="muted" />
          <Stat label="MB2 Exclusive"  value={counts.mb2}        tone="gold" />
          <Stat label="Upcoming"       value={counts.upcoming}   tone="green" />
          <Stat label="This week"      value={counts.thisWeek}   tone="blue" />
        </div>
      </header>

      {/* ============================== TOOLBAR ============================== */}
      <div className="elToolbar elToolbarStacked">
        {/* Row 1 — Exclusive toggle on top */}
        <div className="elToolbarRowExclusive">
          <button
            type="button"
            className={`elExclusiveToggle ${exclusiveOnly ? "active" : ""}`}
            aria-pressed={exclusiveOnly}
            onClick={() => setExclusiveOnly((v) => !v)}
            title="Show only events flagged as exclusive"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M12 2l2.9 6 6.6.6-5 4.5 1.5 6.4L12 16.8 5.9 19.5 7.5 13.1 2.5 8.6l6.6-.6L12 2z" fill="currentColor"/>
            </svg>
            Only {exclusiveLabel}
            <span className="elFilterCount">{counts.mb2}</span>
          </button>
        </div>

        {/* Row 2 — Time | Status with a divider in the middle */}
        <div className="elToolbarRowFilters">
          <div className="elFilterGroup" role="group" aria-label="Time">
            <span className="elFilterGroupLabel">Time</span>
            <div className="elFilterPills" role="tablist">
              {TIME_FILTERS.map((f) => {
                const n = f.id === "all" ? counts.all
                        : f.id === "upcoming" ? counts.upcoming
                        : counts.past;
                return (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={timeFilter === f.id}
                    className={`elFilterPill ${timeFilter === f.id ? "active" : ""}`}
                    onClick={() => setTimeFilter(f.id)}
                  >
                    {f.label}
                    <span className="elFilterCount">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <span className="elFilterDivider" aria-hidden="true" />

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
        </div>

        {/* Row 3 — Search bar at the bottom */}
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
        <div className="formLoading"><div className="spinner" /> Loading events…</div>
      ) : visible.length === 0 ? (
        <EmptyState
          query={query}
          filtered={timeFilter !== "all" || statusFilter !== "all" || exclusiveOnly}
          onClear={() => {
            setQuery("");
            setTimeFilter("all");
            setStatusFilter("all");
            setExclusiveOnly(false);
          }}
        />
      ) : (
        <div className="elTableWrap">
          <div className="elTableHead">
            <div className="elColTitle">Event</div>
            <div className="elColDate">Date</div>
            <div className="elColVendor">Vendor</div>
            <div className="elColFormat">Format</div>
            <div className="elColStar" title={exclusiveLabel}>Exclusive</div>
            <div className="elColPublish">Publish</div>
            <div className="elColActions" />
          </div>

          {visible.map((r) => {
            const status = dateStatus(r.event_date);
            return (
              <article key={r.id} className="elRow">
                <div className="elColTitle">
                  <Link to={`/admin/events/${r.id}`} className="elThumb">
                    {r._effective_thumb_url
                      ? <img src={r._effective_thumb_url} alt="" loading="lazy" />
                      : <span className="elThumbPh" />}
                  </Link>
                  <div className="elTitleWrap">
                    <Link to={`/admin/events/${r.id}`} className="elTitleLink">{r.title}</Link>
                    <div className="elTitleMeta">
                      <span className={`elStatusBadge elStatus-${status.kind}`}>{status.label}</span>
                      {r.category && <span className="elCategory">{r.category}</span>}
                      {r.ce_hours != null && r.ce_hours !== "" && (
                        <span className="elCeChip">{r.ce_hours} CE</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="elColDate">
                  <span className="elDate">{fmtDate(r.event_date)}</span>
                </div>

                <div className="elColVendor">
                  {r._effective_logo_url
                    ? <img className="elVendorLogo" src={r._effective_logo_url} alt="" />
                    : <span className="elVendorLogo elVendorLogoEmpty" />}
                  <span className="elVendorName">{r.vendor || "—"}</span>
                </div>

                <div className="elColFormat">
                  {r.format
                    ? <span className={`elFmtPill ${formatPillClass(r.format)}`}>{r.format}</span>
                    : <span className="muted">—</span>}
                </div>

                <div className="elColStar">
                  <button
                    type="button"
                    className={`mb2Star ${r.mb2_exclusive ? "mb2StarOn" : ""}`}
                    onClick={() => toggleMb2(r)}
                    title={r.mb2_exclusive ? `Remove ${exclusiveLabel} flag` : `Mark as ${exclusiveLabel}`}
                    aria-label={`Toggle ${exclusiveLabel}`}
                  >★</button>
                </div>

                <div className="elColPublish">
                  <label className="switch" title={r.is_published ? "Click to unpublish" : "Click to publish"}>
                    <input type="checkbox" checked={!!r.is_published} onChange={() => togglePublish(r)} />
                    <span className="switchSlider" />
                  </label>
                </div>

                <div className="elColActions">
                  <Link
                    to={`/admin/events/${r.id}`}
                    className="elIconBtn"
                    title="Edit"
                    aria-label="Edit event"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Link>
                  <button
                    type="button"
                    className="elIconBtn"
                    onClick={() => duplicate(r)}
                    title="Duplicate (creates a draft copy you can edit)"
                    aria-label="Duplicate event"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                      <path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="elIconBtn elIconBtnDanger"
                    onClick={() => remove(r)}
                    title="Delete"
                    aria-label="Delete event"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path d="M6 7h12M9 7V4h6v3m-7 0v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
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
      <div className="elEmptyArt">📅</div>
      <h3>{hasFilters ? "Nothing matches" : "No events yet"}</h3>
      <p>
        {hasFilters
          ? "Try clearing the search or loosening a filter."
          : "Create your first event or import a CSV / Excel file to get started."}
      </p>
      <div className="elEmptyActions">
        {hasFilters
          ? <button className="primaryBtn" onClick={onClear}>Clear all filters</button>
          : (<>
              <Link to="/admin/events/new" className="primaryBtn">+ New event</Link>
              <Link to="/admin/import" className="ghostBtn">Import CSV / Excel</Link>
            </>)}
      </div>
    </div>
  );
}
