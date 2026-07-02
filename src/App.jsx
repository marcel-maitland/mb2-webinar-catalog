import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "./lib/supabase.js";
import "./catalog-extras.css";

/**
 * Public catalog — multi-tenant.
 *   /                — default client (MB2). Keeps existing TI iframe embeds working.
 *   /?exclusive=1    — MB2 Exclusive page.
 *   /c/:slug         — any client's catalog.
 *   /c/:slug?exclusive=1 — that client's exclusive view.
 *
 * If no slug is in the URL, we fall back to slug "mb2" so the original embeds keep serving MB2.
 */
const DEFAULT_SLUG = "mb2";

const isExclusiveMode =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("exclusive") === "1";

/* ---------- helpers ---------- */
const safe = (v) =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

const isUrl = (u) => safe(u).startsWith("http");
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safe(e));

// Viewer's IANA timezone, detected once. Safe default to UTC if Intl is missing.
const VIEWER_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
})();

/* For ONLINE events, we show times in the viewer's local timezone (so a
   viewer in NYC sees "8 PM EDT" while a viewer in LA sees "5 PM PDT").
   For IN-PERSON events, we always show the EVENT's local timezone — if
   you're driving to a 9 AM event in Carrollton TX, you care about 9 AM
   Central, not whatever that is in your zone. */
const pickDisplayTz = (storedTz, isInPersonEvt) =>
  isInPersonEvt ? (storedTz || VIEWER_TZ) : VIEWER_TZ;

const formatDate = (d, tz) =>
  d.toLocaleDateString("en-US", {
    timeZone: tz || VIEWER_TZ,
    month: "short", day: "numeric", year: "numeric",
  });

const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

const isInPerson = (format) => {
  const f = safe(format).toLowerCase();
  return f === "in-person" || f === "in person" || f === "inperson";
};

/* ---------- shape Supabase row -> what the cards expect ---------- */
function fromDb(row) {
  const d = row.event_date ? new Date(row.event_date) : null;
  const dEnd = row.event_end_date ? new Date(row.event_end_date) : null;
  const storedTz = row.event_timezone || "America/Chicago";
  const inPersonEvt = isInPerson(row.format);
  const displayTz = pickDisplayTz(storedTz, inPersonEvt);

  // Helper: format a Date's HH:MM in a given TZ as a string like "7:00 PM EDT".
  // Returns "" if the time portion is exactly midnight in the stored TZ
  // (which we treat as "no time was set").
  const formatTime = (when) => {
    if (!when || isNaN(when.getTime())) return "";
    const storedParts = new Intl.DateTimeFormat("en-US", {
      timeZone: storedTz,
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(when);
    const sh = storedParts.find((p) => p.type === "hour")?.value;
    const sm = storedParts.find((p) => p.type === "minute")?.value;
    if (sh === "00" && sm === "00") return "";
    return when.toLocaleTimeString("en-US", {
      timeZone: displayTz,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  };

  // Plain-time formatter (without timezone suffix) for ranges,
  // so "8:00 AM – 5:00 PM CDT" reads naturally instead of repeating CDT.
  const formatTimeShort = (when) => {
    if (!when || isNaN(when.getTime())) return "";
    const storedParts = new Intl.DateTimeFormat("en-US", {
      timeZone: storedTz,
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(when);
    const sh = storedParts.find((p) => p.type === "hour")?.value;
    const sm = storedParts.find((p) => p.type === "minute")?.value;
    if (sh === "00" && sm === "00") return "";
    return when.toLocaleTimeString("en-US", {
      timeZone: displayTz,
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Build the time-range string for the card (Session 1 label fallback).
  // - Single time: "7:00 PM EDT"
  // - Time range:  "8:00 AM – 5:00 PM EDT"
  // - No time: ""
  const dateTimeString = (() => {
    const startFull = formatTime(d);
    if (!startFull) return "";
    const endShort = formatTimeShort(dEnd);
    if (endShort) {
      const startShort = formatTimeShort(d);
      // append the TZ suffix from startFull just once at the end
      const tzMatch = startFull.match(/\s([A-Z]{2,5}T?)$/);
      const tzSuffix = tzMatch ? ` ${tzMatch[1]}` : "";
      return `${startShort} – ${endShort}${tzSuffix}`;
    }
    return startFull;
  })();

  // Multi-day check: end date is on a different calendar day than start
  // (in the event's display TZ).
  const sameDay = (a, b) => {
    if (!a || !b) return true;
    const aStr = a.toLocaleDateString("en-US", { timeZone: displayTz, year: "numeric", month: "2-digit", day: "2-digit" });
    const bStr = b.toLocaleDateString("en-US", { timeZone: displayTz, year: "numeric", month: "2-digit", day: "2-digit" });
    return aStr === bStr;
  };
  const multiDay = !!(dEnd && d && !sameDay(d, dEnd));

  return {
    id: row.id,
    title: safe(row.title) || "Untitled Event",
    description: safe(row.description),
    date: d,
    endDate: dEnd,     // <-- nullable; when set, drives range displays
    multiDay,          // <-- true if end is on a different day than start
    displayTz,         // <-- which TZ the card should render in
    storedTz,          // <-- original event TZ
    inPersonEvt,
    category: safe(row.category),
    ce: typeof row.ce_hours === "number" ? row.ce_hours : null,
    cost: safe(row.cost),
    vendor: safe(row.vendor),
    vendorLogo: safe(row.vendor_logo_url),
    thumb: safe(row.thumb_url),
    format: safe(row.format),
    roles: Array.isArray(row.roles) ? row.roles : [],
    mb2Exclusive: !!row.mb2_exclusive,
    location: safe(row.location),
    inPersonRegistrationLink: safe(row.in_person_registration_url),
    inPersonRegistrationEmail: safe(row.in_person_registration_email),
    discountCode: safe(row.discount_code),
    discountDescription: safe(row.discount_description),
    sessions: [
      {
        label: safe(row.session1_label) || dateTimeString,
        url: safe(row.session1_url),
        email: safe(row.session1_email),
      },
      {
        label: safe(row.session2_label),
        url: safe(row.session2_url),
        email: safe(row.session2_email),
      },
    ].filter((s) => s.label || s.url || s.email),
  };
}

/* ===============================
   UI helpers
================================= */

function CollapsibleSection({ title, children, defaultOpen = false }) {
  return (
    <details className="filterDetails" open={defaultOpen}>
      <summary className="filterSummary">{title}</summary>
      <div className="filterBody">{children}</div>
    </details>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <path
        fill="currentColor"
        d="M12 2c-3.86 0-7 3.14-7 7c0 5.25 6.18 12.28 6.44 12.58c.3.34.82.34 1.12 0C12.82 21.28 19 14.25 19 9c0-3.86-3.14-7-7-7m0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5"
      />
    </svg>
  );
}

/* Calendar-tear-off date sticker for catalog cards. Uses the event's
   "display" timezone so the date shown matches the time displayed below. */
function CalendarBlock({ date, tz }) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const zone = tz || VIEWER_TZ;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric", month: "short", day: "numeric",
  }).formatToParts(date);
  const month = parts.find((p) => p.type === "month")?.value?.toUpperCase() || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  const year = parseInt(parts.find((p) => p.type === "year")?.value || "0", 10);
  const thisYear = new Date().getFullYear();
  return (
    <div className="calBlock" aria-label={date.toLocaleDateString("en-US", { timeZone: zone, dateStyle: "long" })}>
      <div className="calBlockMonth">{month}</div>
      <div className="calBlockDay">{day}</div>
      {year !== thisYear && <div className="calBlockYear">{year}</div>}
    </div>
  );
}

/* "Soon" chip for events within 7 days */
function daysUntil(d) {
  if (!(d instanceof Date)) return Infinity;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((dd - today) / (1000 * 60 * 60 * 24));
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <path
        fill="currentColor"
        d="M12 1.75A10.25 10.25 0 1 0 22.25 12A10.26 10.26 0 0 0 12 1.75m0 18.5A8.25 8.25 0 1 1 20.25 12A8.26 8.26 0 0 1 12 20.25M12.75 6a.75.75 0 0 0-1.5 0v6c0 .2.08.39.22.53l3.75 3.75a.75.75 0 1 0 1.06-1.06l-3.53-3.53z"
      />
    </svg>
  );
}

/* ===============================
   APP
================================= */

export default function App() {
  const { slug: routeSlug } = useParams();
  const effectiveSlug = (routeSlug || DEFAULT_SLUG).toLowerCase();

  const [client, setClient] = useState(null);     // { id, name, slug, logo_url } | null
  const [clientLoading, setClientLoading] = useState(true);
  const [clientError, setClientError] = useState("");

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [query, setQuery] = useState("");
  const [catSelected, setCatSelected] = useState(new Set());
  const [vendorSelected, setVendorSelected] = useState(new Set());
  const [ceSelected, setCeSelected] = useState(new Set());
  const [formatSelected, setFormatSelected] = useState(new Set());
  const [rolesSelected, setRolesSelected] = useState(new Set());
  const [mb2ExclusiveOnly, setMb2ExclusiveOnly] = useState(isExclusiveMode);

  // 1. Resolve the client by slug
  useEffect(() => {
    let cancelled = false;
    setClientLoading(true);
    setClientError("");
    (async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, slug, logo_url")
        .eq("slug", effectiveSlug)
        .maybeSingle();
      if (cancelled) return;
      if (error) { setClientError(error.message); setClient(null); }
      else setClient(data || null);
      setClientLoading(false);
    })();
    return () => { cancelled = true; };
  }, [effectiveSlug]);

  // 2. Load events for that client
  useEffect(() => {
    if (!client?.id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        // Fetch events + vendor info in parallel so we can fall back to
        // the vendor's current logo + default thumbnail when an event row
        // is missing them (because it predates the upload or the sync
        // trigger didn't fire).
        const [evRes, vendorRes] = await Promise.all([
          supabase
            .from("events")
            .select("*")
            .eq("is_published", true)
            .eq("client_id", client.id)
            .order("event_date", { ascending: true }),
          supabase
            .from("vendors")
            .select("name, logo_url, default_thumb_url")
            .eq("client_id", client.id),
        ]);
        if (evRes.error) throw evRes.error;

        // Vendor name → vendor row (lowercase key for case-insensitive match)
        const vendorByName = {};
        for (const v of vendorRes.data || []) {
          if (v.name) vendorByName[v.name.toLowerCase()] = v;
        }

        if (!cancelled) {
          const enriched = (evRes.data || []).map((r) => {
            const vinfo = vendorByName[(r.vendor || "").toLowerCase()];
            const ownThumb = (r.thumb_url || "").trim();
            const ownLogo  = (r.vendor_logo_url || "").trim();
            return {
              ...r,
              thumb_url:       ownThumb || vinfo?.default_thumb_url || "",
              vendor_logo_url: ownLogo  || vinfo?.logo_url           || "",
            };
          });
          setRows(enriched.map(fromDb));
        }
      } catch (e) {
        console.error("Data load error:", e);
        if (!cancelled) {
          setRows([]);
          setLoadError(e?.message || "Failed to load data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [client?.id]);

  const categories = useMemo(
    () => uniq(rows.map((r) => r.category)).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const vendors = useMemo(
    () => uniq(rows.map((r) => r.vendor)).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const ceHours = useMemo(() => {
    const vals = rows.map((r) => r.ce).filter((n) => typeof n === "number");
    return [...new Set(vals)].sort((a, b) => a - b);
  }, [rows]);
  const formats = useMemo(
    () => uniq(rows.map((r) => r.format)).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const roles = useMemo(() => {
    const all = rows.flatMap((r) => (Array.isArray(r.roles) ? r.roles : []));
    return uniq(all).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const toggle = (setFn, value) =>
    setFn((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });

  const clearFilters = () => {
    setQuery("");
    setCatSelected(new Set());
    setVendorSelected(new Set());
    setCeSelected(new Set());
    setFormatSelected(new Set());
    setRolesSelected(new Set());
    setMb2ExclusiveOnly(isExclusiveMode);
  };

  const filtered = useMemo(() => {
    const now = new Date();
    const q = safe(query).toLowerCase();

    const catOn = catSelected.size > 0;
    const vendorOn = vendorSelected.size > 0;
    const ceOn = ceSelected.size > 0;
    const formatOn = formatSelected.size > 0;
    const rolesOn = rolesSelected.size > 0;

    return rows
      .filter((r) => (r.date ? endOfDay(r.date) >= now : true))
      .filter((r) => (catOn ? catSelected.has(r.category) : true))
      .filter((r) => (vendorOn ? vendorSelected.has(r.vendor) : true))
      .filter((r) => (ceOn ? typeof r.ce === "number" && ceSelected.has(r.ce) : true))
      .filter((r) => (formatOn ? formatSelected.has(r.format) : true))
      .filter((r) => (mb2ExclusiveOnly ? r.mb2Exclusive === true : true))
      .filter((r) => {
        if (!rolesOn) return true;
        const rRoles = Array.isArray(r.roles) ? r.roles : [];
        return rRoles.some((rr) => rolesSelected.has(rr));
      })
      .filter((r) => {
        if (!q) return true;
        const hay = `${r.title} ${r.vendor} ${r.category} ${r.format ?? ""} ${r.ce ?? ""} ${
          r.description ?? ""
        } ${r.location ?? ""} ${(Array.isArray(r.roles) ? r.roles.join(" ") : "")} ${
          r.date ? formatDate(r.date) : ""
        }`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const ad = a.date ? a.date.getTime() : Number.POSITIVE_INFINITY;
        const bd = b.date ? b.date.getTime() : Number.POSITIVE_INFINITY;
        return ad - bd;
      });
  }, [rows, query, catSelected, vendorSelected, ceSelected, formatSelected, rolesSelected, mb2ExclusiveOnly]);

  // Hard 404 if the slug doesn't resolve
  if (!clientLoading && !client) {
    return (
      <div className="page">
        <header className="header">
          <div className="headerLeft">
            <h1>Catalog not found</h1>
            <p>{clientError || `No catalog exists at "${effectiveSlug}".`}</p>
          </div>
        </header>
      </div>
    );
  }

  const clientName = client?.name || "";
  const title = isExclusiveMode
    ? `Upcoming ${clientName} Exclusive Events`.trim()
    : "Upcoming Events";

  return (
    <div className="page">
      <CatalogElevatedStyles />
      <header className="header">
        <div className="headerLeft">
          <div className="titleRow">
            <h1>{title}</h1>
          </div>
          <p>
            {isExclusiveMode
              ? `Browse upcoming ${clientName} Exclusive events, register instantly, and filter by category, vendor, CE hours, format, or role.`
              : "Browse upcoming events, register instantly, and filter by category, vendor, CE hours, format, or role."}
          </p>
        </div>

        <input
          className="search"
          placeholder="Search events, vendors, categories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>

      {/* Horizontal filter bar — sticks below the header. Popover dropdowns
          keep their scrolling internal so the page never gets pushed. */}
      <FilterBar
        clientName={clientName}
        isExclusiveMode={isExclusiveMode}
        mb2ExclusiveOnly={mb2ExclusiveOnly}
        setMb2ExclusiveOnly={setMb2ExclusiveOnly}
        formats={formats} formatSelected={formatSelected} setFormatSelected={setFormatSelected}
        roles={roles} rolesSelected={rolesSelected} setRolesSelected={setRolesSelected}
        categories={categories} catSelected={catSelected} setCatSelected={setCatSelected}
        vendors={vendors} vendorSelected={vendorSelected} setVendorSelected={setVendorSelected}
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
              <div className="errorHint">
                Check that <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> are set in
                Netlify → Site settings → Environment variables, and that the events table has at least one
                row with <code>is_published = true</code>.
              </div>
            </div>
          )}

          {!loading && !loadError && filtered.length === 0 && (
            <div className="center">No upcoming events match your filters.</div>
          )}

          {!loading && !loadError && filtered.length > 0 && (
            <div className="grid">
              {filtered.map((item) => (
                <Card key={item.id} item={item} clientName={clientName} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* =====================================================================
   FILTER BAR + POPOVERS — horizontal sticky filters at the top of the
   catalog. Each filter is a compact chip button; clicking opens a
   floating popover whose internal scrolling never disturbs page scroll.
===================================================================== */
function FilterBar(props) {
  const {
    clientName, isExclusiveMode,
    mb2ExclusiveOnly, setMb2ExclusiveOnly,
    formats, formatSelected, setFormatSelected,
    roles, rolesSelected, setRolesSelected,
    categories, catSelected, setCatSelected,
    vendors, vendorSelected, setVendorSelected,
    ceHours, ceSelected, setCeSelected,
    toggle, clearFilters, filteredCount,
  } = props;

  const hasAnyFilter =
    (!isExclusiveMode && mb2ExclusiveOnly) ||
    formatSelected.size > 0 ||
    rolesSelected.size > 0 ||
    catSelected.size > 0 ||
    vendorSelected.size > 0 ||
    ceSelected.size > 0;

  const eventLabel = filteredCount === 1 ? "event" : "events";

  return (
    <div className="filterBar" role="toolbar" aria-label="Event filters">
      <div className="filterBarInner">
        {!isExclusiveMode && (
          <button
            type="button"
            className={`filterExclBtn ${mb2ExclusiveOnly ? "active" : ""}`}
            onClick={() => setMb2ExclusiveOnly(!mb2ExclusiveOnly)}
            aria-pressed={mb2ExclusiveOnly}
            title={`Only show ${clientName || "your organization"} Exclusive events`}
          >
            <span className="filterExclStar" aria-hidden="true">★</span>
            <span className="filterExclLabel">{clientName || "MB2"} Exclusive</span>
          </button>
        )}

        <FilterPopover
          label="Format"
          options={formats}
          selected={formatSelected}
          onToggle={(v) => toggle(setFormatSelected, v)}
          onClear={() => setFormatSelected(new Set())}
        />
        <FilterPopover
          label="Role"
          options={roles}
          selected={rolesSelected}
          onToggle={(v) => toggle(setRolesSelected, v)}
          onClear={() => setRolesSelected(new Set())}
          searchable={roles.length > 10}
        />
        <FilterPopover
          label="Category"
          options={categories}
          selected={catSelected}
          onToggle={(v) => toggle(setCatSelected, v)}
          onClear={() => setCatSelected(new Set())}
          searchable={categories.length > 10}
        />
        <FilterPopover
          label="Vendor"
          options={vendors}
          selected={vendorSelected}
          onToggle={(v) => toggle(setVendorSelected, v)}
          onClear={() => setVendorSelected(new Set())}
          searchable
        />
        <FilterPopover
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
          <strong>{filteredCount}</strong> {eventLabel}
        </div>
      </div>
    </div>
  );
}

function FilterPopover({
  label,
  options,
  selected,
  onToggle,
  onClear,
  searchable = false,
  formatOption,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  useEffect(() => { if (!open) setSearch(""); }, [open]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => String(o).toLowerCase().includes(q));
  }, [options, search]);

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
          {searchable && (
            <div className="filterPopSearchWrap">
              <input
                type="text"
                className="filterPopSearch"
                placeholder={`Search ${label.toLowerCase()}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="filterPopList">
            {filtered.length === 0 ? (
              <div className="filterPopEmpty">No matches</div>
            ) : (
              filtered.map((opt) => {
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
                onClick={() => { onClear(); }}
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

/* ===============================
   CARD
================================= */

/* ====================================================================
   Catalog elevation styles — injected as <style> so we don't touch App.css.
   Adds: calendar date tile, thumbnail gradient, hover lift, soon chip.
==================================================================== */
function CatalogElevatedStyles() {
  return (
    <style>{`
      /* Card hover lift */
      .cardElevated { transition: transform .15s ease, box-shadow .15s ease; }
      .cardElevated:hover { transform: translateY(-3px); box-shadow: 0 20px 40px rgba(17,24,39,.10); }

      /* Thumb stays a positioning context for the calendar tile.
         The gradient overlay was removed — the white tile has its own shadow
         and is readable on any image without a backdrop. */
      .thumb { position: relative; }
      .thumbGradient { display: none; }

      /* THE STAR: calendar tear-off date tile */
      .calBlock {
        position: absolute;
        left: 10px;
        bottom: 8px;
        z-index: 3;
        width: 46px;
        background: #fff;
        border-radius: 9px;
        box-shadow: 0 7px 16px rgba(17,24,39,.20), 0 0 0 1px rgba(17,24,39,.04);
        overflow: hidden;
        text-align: center;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial;
      }
      .calBlockMonth {
        background: #f97316;
        color: #fff;
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 0.12em;
        padding: 3px 0 2px;
        text-transform: uppercase;
      }
      .calBlockDay {
        font-size: 19px;
        font-weight: 800;
        color: #111827;
        line-height: 1.1;
        padding: 3px 0 2px;
        letter-spacing: -0.02em;
      }
      .calBlockYear {
        font-size: 8px;
        font-weight: 600;
        color: #6b7280;
        padding: 0 0 3px;
        letter-spacing: 0.04em;
      }

      /* "Today" / "In N days" urgency chip in the meta row */
      .soonChip {
        background: #fffbeb;
        color: #b45309;
        border: 1px solid #fde68a;
        font-size: 11px;
        font-weight: 800;
        padding: 4px 9px;
        border-radius: 999px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .soonChipToday {
        background: #f97316;
        color: #fff;
        border-color: #f97316;
        box-shadow: 0 4px 10px rgba(249,115,22,.4);
      }

      /* MB2 / client exclusive badge — bump elevation so it stands out beside the new tile */
      .mb2Badge {
        z-index: 3;
        box-shadow: 0 6px 14px rgba(249,115,22,.35);
      }

      /* Discount banner — small callout above the Register button */
      .discountBanner {
        display: flex;
        align-items: center;
        gap: 10px;
        background: linear-gradient(135deg, #ecfeff 0%, #cffafe 100%);
        border: 1px solid #67e8f9;
        border-left: 4px solid #1dbfc9;
        padding: 8px 12px;
        border-radius: 8px;
        margin-bottom: 10px;
      }
      .discountBannerCode {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .discountBannerCodeLabel {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #0e7490;
        opacity: 0.85;
      }
      .discountBannerCodeValue {
        font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: #0e7490;
        background: #fff;
        padding: 3px 8px;
        border-radius: 6px;
        border: 1px dashed #67e8f9;
        text-transform: uppercase;
      }
      .discountBannerDesc {
        font-size: 12.5px;
        color: #0e4f5a;
        line-height: 1.4;
        font-weight: 500;
        min-width: 0;
      }
      .sessionGroup { display: flex; flex-direction: column; gap: 0; }
      .sessionGroup + .sessionGroup { margin-top: 8px; }

      /* Email-based registration display (replaces the Register button when
         an event has no URL but does have a registration email) */
      .emailReg {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        padding: 8px 14px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        min-width: 0;
        max-width: 100%;
      }
      .emailRegLabel {
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        white-space: nowrap;
      }
      .emailRegAddr {
        font-size: 14px;
        font-weight: 700;
        color: #0F766E;
        text-decoration: none;
        word-break: break-all;
        line-height: 1.2;
      }
      .emailRegAddr:hover { text-decoration: underline; }

      @media (max-width: 700px) {
        .discountBanner { flex-direction: column; align-items: flex-start; gap: 4px; }
      }
    `}</style>
  );
}

/* Renders "For registration, email <addr>" in place of the Register button
   when an event has an email-based registration but no URL. The address
   is a clickable mailto: link. */
function EmailReg({ email }) {
  if (!isEmail(email)) return null;
  return (
    <div className="emailReg">
      <span className="emailRegLabel">For registration, email</span>
      <a className="emailRegAddr" href={`mailto:${email}`}>{email}</a>
    </div>
  );
}

/* Renders a small discount callout above the Register button.
   Returns null if neither code nor description is set. */
function DiscountBanner({ code, description }) {
  const hasCode = !!safe(code);
  const hasDesc = !!safe(description);
  if (!hasCode && !hasDesc) return null;
  return (
    <div className="discountBanner" role="note">
      {hasCode && (
        <div className="discountBannerCode">
          <span className="discountBannerCodeLabel">Promo</span>
          <span className="discountBannerCodeValue">{code}</span>
        </div>
      )}
      {hasDesc && (
        <div className="discountBannerDesc">{description}</div>
      )}
    </div>
  );
}

function Card({ item, clientName = "" }) {
  const thumbOk = isUrl(item.thumb);
  const logoOk = isUrl(item.vendorLogo);

  const inPerson = isInPerson(item.format);
  const inPersonRegOk = isUrl(item.inPersonRegistrationLink);
  const inPersonRegEmail = isEmail(item.inPersonRegistrationEmail);
  // Either method present means we should show registration UI
  const inPersonRegAvailable = inPersonRegOk || inPersonRegEmail;

  // Include sessions that have EITHER a URL or an email address (both are
  // valid registration paths). URL wins if both are set.
  const sessionsWithReg = (Array.isArray(item.sessions) ? item.sessions : [])
    .filter((s) => isUrl(s?.url) || isEmail(s?.email));
  const timeLabel = safe(item.sessions?.[0]?.label);

  const dInDays = item.date ? daysUntil(item.date) : Infinity;
  const isSoon = dInDays >= 0 && dInDays <= 7;
  const isToday = dInDays === 0;

  return (
    <article className="card cardElevated">
      <div className={`thumb ${thumbOk ? "" : "thumbNoImg"}`}>
        {thumbOk ? (
          <img
            src={item.thumb}
            alt={`${item.title} thumbnail`}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.parentElement.classList.add("thumbNoImg");
            }}
          />
        ) : null}
        {/* Gradient overlay so the calendar block reads on any image */}
        <span className="thumbGradient" aria-hidden="true" />
        {item.mb2Exclusive ? <span className="mb2Badge">Exclusive</span> : null}
        {/* Urgency: TODAY events get a banner that REPLACES the calendar tile
            (same bottom-left position, more attention-grabbing). Future-soon
            events keep their calendar tile and get a "Tomorrow" / "In N days"
            badge in the top-right. */}
        {isToday ? (
          <span className="todayBanner" aria-label="Happening today">
            <span className="todayBannerDot" aria-hidden="true" />
            <span className="todayBannerText">Today</span>
          </span>
        ) : (
          <>
            <CalendarBlock date={item.date} tz={item.displayTz} />
            {isSoon && (
              <span className="thumbUrgency">
                {dInDays === 1 ? "Tomorrow" : `In ${dInDays} days`}
              </span>
            )}
          </>
        )}
      </div>

      <div className="body">
        <div className="topRow">
          <div className="metaRow">
            {typeof item.ce === "number" ? <span className="ceBadge">{item.ce} CE</span> : null}
            {safe(item.format) ? <span className="formatBadge">{item.format}</span> : null}
          </div>

          {logoOk ? <img className="vendorLogo" src={item.vendorLogo} alt="Vendor logo" loading="lazy" /> : null}
        </div>

        <h3 className="title" title={item.title}>
          {item.title}
        </h3>

        {safe(item.description) ? (
          <p className="descFull" title={item.description}>
            {item.description}
          </p>
        ) : null}

        {Array.isArray(item.roles) && item.roles.length > 0 ? (
          <div className="rolesLine">
            <span className="rolesLabel">This event is ideal for</span>{" "}
            <span className="rolesValue">{item.roles.join(", ")}</span>
          </div>
        ) : null}

        {inPerson && (item.date || safe(item.location) || inPersonRegAvailable) ? (
          <div className="inPersonBox">
            <div className="inPersonBoxGrid">
              {item.date ? (
                <div className="inPersonRow">
                  <span className="inPersonKey">Date</span>
                  <span className="inPersonVal">
                    {item.multiDay && item.endDate
                      ? `${formatDate(item.date, item.displayTz)} – ${formatDate(item.endDate, item.displayTz)}`
                      : formatDate(item.date, item.displayTz)}
                  </span>
                </div>
              ) : null}

              {/* Time row removed — the bottom Register row already shows it. */}

              {safe(item.location) ? (
                <div className="inPersonRow">
                  <span className="inPersonKey">
                    <span className="inPersonIcon" aria-hidden="true">
                      <PinIcon />
                    </span>
                    Location
                  </span>
                  <span className="inPersonVal">{item.location}</span>
                </div>
              ) : null}
            </div>

            {inPersonRegAvailable ? (
              <>
                <DiscountBanner code={item.discountCode} description={item.discountDescription} />
                <div className="inPersonActions">
                  {inPersonRegOk ? (
                    <a className="sessionBtn" href={item.inPersonRegistrationLink} target="_blank" rel="noopener">
                      Register →
                    </a>
                  ) : (
                    <EmailReg email={item.inPersonRegistrationEmail} />
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="sessions">
          {sessionsWithReg.map((s, i) => (
            <div className="sessionGroup" key={i}>
              {i === 0 && (
                <DiscountBanner code={item.discountCode} description={item.discountDescription} />
              )}
              <div className="session">
                <span className="sessionLabel">{s.label}</span>
                {isUrl(s.url) ? (
                  <a className="sessionBtn" href={s.url} target="_blank" rel="noopener">
                    Register →
                  </a>
                ) : (
                  <EmailReg email={s.email} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
