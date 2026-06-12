import { useEffect, useMemo, useState } from "react";
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

const formatDate = (d) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

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
  return {
    id: row.id,
    title: safe(row.title) || "Untitled Event",
    description: safe(row.description),
    date: row.event_date ? new Date(row.event_date) : null,
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
    sessions: [
      { label: safe(row.session1_label), url: safe(row.session1_url) },
      { label: safe(row.session2_label), url: safe(row.session2_url) },
    ].filter((s) => s.label || s.url),
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

/* Calendar-tear-off date sticker for catalog cards */
function CalendarBlock({ date }) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const month = date.toLocaleString(undefined, { month: "short" }).toUpperCase();
  const day = date.getDate();
  const year = date.getFullYear();
  const thisYear = new Date().getFullYear();
  return (
    <div className="calBlock" aria-label={date.toLocaleDateString(undefined, { dateStyle: "long" })}>
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
        const { data, error } = await supabase
          .from("events")
          .select("*")
          .eq("is_published", true)
          .eq("client_id", client.id)
          .order("event_date", { ascending: true });
        if (error) throw error;
        if (!cancelled) setRows((data || []).map(fromDb));
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
            {client?.logo_url && (
              <img
                className="clientHeaderLogo"
                src={client.logo_url}
                alt={`${clientName} logo`}
                style={{
                  height: 44,
                  width: "auto",
                  maxWidth: 140,
                  objectFit: "contain",
                  marginRight: 14,
                  verticalAlign: "middle"
                }}
              />
            )}
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

      <div className="layout">
        <aside className="sidebar">
          <div className="sideTitle">Filters</div>

          {/* The exclusive toggle is HIDDEN in exclusive mode so visitors of
              the {Client} Exclusive page can't uncheck it. */}
          {!isExclusiveMode && (
            <label className="pillCheck exclusiveToggle">
              <input
                type="checkbox"
                checked={mb2ExclusiveOnly}
                onChange={(e) => setMb2ExclusiveOnly(e.target.checked)}
              />
              <span>Show only {clientName} Exclusive</span>
            </label>
          )}

          <CollapsibleSection title="Format">
            <div className="list">
              {formats.map((f) => (
                <label className="pillCheck" key={f}>
                  <input
                    type="checkbox"
                    checked={formatSelected.has(f)}
                    onChange={() => toggle(setFormatSelected, f)}
                  />
                  <span>{f}</span>
                </label>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Role / Position">
            <div className="list">
              {roles.map((r) => (
                <label className="pillCheck" key={r}>
                  <input
                    type="checkbox"
                    checked={rolesSelected.has(r)}
                    onChange={() => toggle(setRolesSelected, r)}
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Category">
            <div className="list">
              {categories.map((c) => (
                <label className="pillCheck" key={c}>
                  <input type="checkbox" checked={catSelected.has(c)} onChange={() => toggle(setCatSelected, c)} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Vendors">
            <div className="list">
              {vendors.map((v) => (
                <label className="pillCheck" key={v}>
                  <input
                    type="checkbox"
                    checked={vendorSelected.has(v)}
                    onChange={() => toggle(setVendorSelected, v)}
                  />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="CE Hours">
            <div className="list">
              {ceHours.map((h) => (
                <label className="pillCheck" key={h}>
                  <input type="checkbox" checked={ceSelected.has(h)} onChange={() => toggle(setCeSelected, h)} />
                  <span>{h} CE</span>
                </label>
              ))}
            </div>
          </CollapsibleSection>

          <button className="clearBtn" type="button" onClick={clearFilters}>
            Clear filters
          </button>

          <div className="sideDivider" />

          <div className="sideStat">
            <span>Results</span>
            <strong>
              {filtered.length} <span className="muted">/ {rows.length}</span>
            </strong>
          </div>
        </aside>

        <main className="main">
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

      /* Subtle gradient so the date tile is always legible on the thumbnail */
      .thumb { position: relative; }
      .thumbGradient {
        position: absolute; inset: 0;
        background: linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.45) 100%);
        pointer-events: none;
        border-radius: inherit;
      }

      /* THE STAR: calendar tear-off date tile */
      .calBlock {
        position: absolute;
        left: 14px;
        bottom: 14px;
        z-index: 3;
        width: 64px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 10px 24px rgba(17,24,39,.20), 0 0 0 1px rgba(17,24,39,.04);
        overflow: hidden;
        text-align: center;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial;
      }
      .calBlockMonth {
        background: #f97316;
        color: #fff;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.12em;
        padding: 5px 0 4px;
        text-transform: uppercase;
      }
      .calBlockDay {
        font-size: 28px;
        font-weight: 800;
        color: #111827;
        line-height: 1.1;
        padding: 6px 0 4px;
        letter-spacing: -0.02em;
      }
      .calBlockYear {
        font-size: 11px;
        font-weight: 600;
        color: #6b7280;
        padding: 0 0 6px;
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
    `}</style>
  );
}

function Card({ item, clientName = "" }) {
  const thumbOk = isUrl(item.thumb);
  const logoOk = isUrl(item.vendorLogo);

  const inPerson = isInPerson(item.format);
  const inPersonRegOk = isUrl(item.inPersonRegistrationLink);

  const sessionsWithLinks = (Array.isArray(item.sessions) ? item.sessions : []).filter((s) => isUrl(s?.url));
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
        {item.mb2Exclusive ? <span className="mb2Badge">{clientName ? `${clientName} Exclusive` : "Exclusive"}</span> : null}
        {/* Date sticker — the headline visual change */}
        <CalendarBlock date={item.date} />
      </div>

      <div className="body">
        <div className="topRow">
          <div className="metaRow">
            {isToday
              ? <span className="soonChip soonChipToday">Today</span>
              : isSoon && <span className="soonChip">{dInDays === 1 ? "Tomorrow" : `In ${dInDays} days`}</span>}
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

        {inPerson && (item.date || timeLabel || safe(item.location) || inPersonRegOk) ? (
          <div className="inPersonBox">
            <div className="inPersonBoxGrid">
              {item.date ? (
                <div className="inPersonRow">
                  <span className="inPersonKey">Date</span>
                  <span className="inPersonVal">{formatDate(item.date)}</span>
                </div>
              ) : null}

              {timeLabel ? (
                <div className="inPersonRow">
                  <span className="inPersonKey">
                    <span className="inPersonIcon" aria-hidden="true">
                      <ClockIcon />
                    </span>
                    Time
                  </span>
                  <span className="inPersonVal">{timeLabel}</span>
                </div>
              ) : null}

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

            {inPersonRegOk ? (
              <div className="inPersonActions">
                <a className="sessionBtn" href={item.inPersonRegistrationLink} target="_blank" rel="noopener">
                  Register →
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="sessions">
          {sessionsWithLinks.map((s, i) => (
            <div className="session" key={i}>
              <span className="sessionLabel">{s.label}</span>
              <a className="sessionBtn" href={s.url} target="_blank" rel="noopener">
                Register →
              </a>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
