import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./lib/supabase.js";
import "./catalog-extras.css";
import "./on-demand.css";

const safe = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

// ?exclusive=1 locks the catalog to MB2 Exclusive courses (same behavior
// as the live events catalog's exclusive mode).
const isExclusiveMode =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("exclusive") === "1";
const isUrl = (u) => safe(u).startsWith("http");
const uniq = (arr) => [...new Set(arr.filter((v) => v !== null && v !== undefined && v !== ""))];

export default function OnDemand({ embedded = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [typeSelected, setTypeSelected] = useState(new Set());
  const [ceSelected, setCeSelected] = useState(new Set());
  const [rolesSelected, setRolesSelected] = useState(new Set());
  const [catSelected, setCatSelected] = useState(new Set());
  const [vendorSelected, setVendorSelected] = useState(new Set());
  const [mb2ExclusiveOnly, setMb2ExclusiveOnly] = useState(isExclusiveMode);
  const [sortBy, setSortBy] = useState("newest"); // newest | oldest | name | ce_desc | ce_asc
  const [externalCourse, setExternalCourse] = useState(null); // course pending external-link confirmation

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

        // Live vendor lookup — courses fall back to the vendor's CURRENT
        // logo and default thumbnail, so vendor edits show up immediately
        // (same behavior as the events catalog).
        let vendorByName = {};
        try {
          const { data: client } = await supabase
            .from("clients").select("id").eq("slug", "mb2").maybeSingle();
          if (client?.id) {
            const { data: vs } = await supabase
              .from("vendors")
              .select("name, logo_url, default_thumb_url")
              .eq("client_id", client.id);
            for (const v of vs || []) {
              if (v.name) vendorByName[v.name.toLowerCase()] = v;
            }
          }
        } catch { /* vendor fallback is best-effort */ }

        const enriched = (data || []).map((r) => {
          const vinfo = vendorByName[(r.vendor || "").toLowerCase()];
          return {
            ...r,
            vendor_logo_url:
              (r.vendor_logo_url && r.vendor_logo_url.trim()) || vinfo?.logo_url || "",
            thumbnail_url:
              (r.thumbnail_url && r.thumbnail_url.trim()) || vinfo?.default_thumb_url || "",
          };
        });
        if (!cancelled) setRows(enriched);
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
  // CE Hours filter — caps at "10+". Any course with ce_hours > 10 rolls
  // up into a single "10+" bucket instead of listing every distinct value.
  const CE_OVER = "10+";
  const ceHours = useMemo(() => {
    const vals = rows.map((r) => r.ce_hours).filter((n) => typeof n === "number");
    const lowSet = new Set();
    let hasOver = false;
    for (const v of vals) {
      if (v > 10) hasOver = true;
      else lowSet.add(v);
    }
    const sorted = [...lowSet].sort((a, b) => a - b);
    if (hasOver) sorted.push(CE_OVER);
    return sorted;
  }, [rows]);
  const roles = useMemo(() => {
    const all = rows.flatMap((r) => (Array.isArray(r.roles) ? r.roles : []));
    return uniq(all).sort((a, b) => a.localeCompare(b));
  }, [rows]);
  const categories = useMemo(() => {
    const all = rows.flatMap((r) => (Array.isArray(r.categories) ? r.categories : []));
    return uniq(all).sort((a, b) => a.localeCompare(b));
  }, [rows]);
  const vendorOptions = useMemo(
    () => uniq(rows.map((r) => safe(r.vendor))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

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
    setRolesSelected(new Set());
    setCatSelected(new Set());
    setVendorSelected(new Set());
    setMb2ExclusiveOnly(isExclusiveMode);
  };

  const filtered = useMemo(() => {
    const q = safe(query).toLowerCase();
    const typeOn = typeSelected.size > 0;
    const ceOn = ceSelected.size > 0;
    const rolesOn = rolesSelected.size > 0;
    const catOn = catSelected.size > 0;
    const vendorOn = vendorSelected.size > 0;
    const matched = rows.filter((r) => {
      if (mb2ExclusiveOnly && !r.mb2_exclusive) return false;
      if (typeOn && !typeSelected.has(r.type)) return false;
      if (vendorOn && !vendorSelected.has(safe(r.vendor))) return false;
      if (ceOn) {
        if (typeof r.ce_hours !== "number") return false;
        const exact = ceSelected.has(r.ce_hours);
        const overTen = r.ce_hours > 10 && ceSelected.has(CE_OVER);
        if (!exact && !overTen) return false;
      }
      if (rolesOn) {
        const rRoles = Array.isArray(r.roles) ? r.roles : [];
        if (!rRoles.some((rr) => rolesSelected.has(rr))) return false;
      }
      if (catOn) {
        const rCats = Array.isArray(r.categories) ? r.categories : [];
        if (!rCats.some((c) => catSelected.has(c))) return false;
      }
      if (q) {
        const rolesHay = Array.isArray(r.roles) ? r.roles.join(" ") : "";
        const catsHay = Array.isArray(r.categories) ? r.categories.join(" ") : "";
        const hay = `${safe(r.title)} ${safe(r.description)} ${safe(r.type)} ${safe(r.vendor)} ${rolesHay} ${catsHay}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Apply the current sort. Clone so we don't mutate the filter result.
    const sorted = [...matched];
    const dateVal = (r) => {
      if (!r.release_date) return -Infinity;
      const t = new Date(r.release_date).getTime();
      return Number.isNaN(t) ? -Infinity : t;
    };
    switch (sortBy) {
      case "newest":
        sorted.sort((a, b) => dateVal(b) - dateVal(a));
        break;
      case "oldest":
        sorted.sort((a, b) => dateVal(a) - dateVal(b));
        break;
      case "name":
        sorted.sort((a, b) => safe(a.title).localeCompare(safe(b.title)));
        break;
      case "ce_desc":
        sorted.sort((a, b) => (b.ce_hours ?? -1) - (a.ce_hours ?? -1));
        break;
      case "ce_asc":
        sorted.sort((a, b) => (a.ce_hours ?? Infinity) - (b.ce_hours ?? Infinity));
        break;
      default:
        break;
    }
    // Featured courses always float to the top, keeping the chosen
    // sort order within the featured and non-featured groups.
    sorted.sort((a, b) => (b.is_featured === true ? 1 : 0) - (a.is_featured === true ? 1 : 0));
    return sorted;
  }, [rows, query, typeSelected, ceSelected, rolesSelected, catSelected, vendorSelected, mb2ExclusiveOnly, sortBy]);

  return (
    <div className={`page ${embedded ? "pageEmbedded" : ""}`}>
      {!embedded && (
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
      )}

      {/* Horizontal filter bar — same pattern as the events catalog.
          In embedded mode the search input lives INSIDE the filter bar,
          on the same row as the filter chips, so we don't need a
          separate row above. */}
      <OdFilterBar
        types={types} typeSelected={typeSelected} setTypeSelected={setTypeSelected}
        ceHours={ceHours} ceSelected={ceSelected} setCeSelected={setCeSelected}
        roles={roles} rolesSelected={rolesSelected} setRolesSelected={setRolesSelected}
        categories={categories} catSelected={catSelected} setCatSelected={setCatSelected}
        vendorOptions={vendorOptions} vendorSelected={vendorSelected} setVendorSelected={setVendorSelected}
        mb2ExclusiveOnly={mb2ExclusiveOnly} setMb2ExclusiveOnly={setMb2ExclusiveOnly}
        toggle={toggle}
        clearFilters={clearFilters}
        filteredCount={filtered.length}
        showSearch={embedded}
        query={query}
        setQuery={setQuery}
        searchPlaceholder="Search on-demand courses…"
        sortBy={sortBy}
        setSortBy={setSortBy}
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
                <OnDemandCard key={c.id} course={c} onExternalClick={setExternalCourse} />
              ))}
            </div>
          )}
        </main>
      </div>

      <ExternalCourseModal
        course={externalCourse?.course || null}
        anchorY={externalCourse?.anchorY}
        cardTop={externalCourse?.cardTop}
        cardCenterX={externalCourse?.cardCenterX}
        onClose={() => setExternalCourse(null)}
      />
    </div>
  );
}

/* Confirmation popup shown before leaving for an external course.
   Hovers right above the clicked card (not viewport-centered) so it's
   always in view — including inside the TI iframe embed, where the
   iframe spans the whole catalog height and "fixed" positioning can
   push it off-screen. */
function ExternalCourseModal({ course, anchorY, cardTop, cardCenterX, onClose }) {
  const boxRef = useRef(null);
  const [placed, setPlaced] = useState(null);

  useEffect(() => {
    if (!course) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [course, onClose]);

  // Position after first paint, once the popup's real height is known:
  // hover above the clicked card when there's visible room, otherwise
  // clamp into the part of the page the visitor can actually see
  // (which, inside the TI embed, we learn from the scroll stream).
  useEffect(() => {
    if (!course) { setPlaced(null); return; }
    const el = boxRef.current;
    if (!el) return;
    const h = el.offsetHeight || 280;
    const pageW = document.documentElement.clientWidth || 1200;
    const half = Math.min(440, pageW - 40) / 2;
    const cx = typeof cardCenterX === "number" ? cardCenterX : pageW / 2;
    const x = Math.min(Math.max(cx, half + 20), pageW - half - 20);
    const y = typeof cardTop === "number" ? cardTop : (typeof anchorY === "number" ? anchorY : 300);

    const embedded = window.parent !== window;
    const visTop = embedded
      ? (window.__mb2EmbedScrollOff || 0)
      : (window.scrollY || 0);
    // Space taken by the pinned menu (header + filter bar) in the embed.
    let menuH = 0;
    if (embedded) {
      const hd = document.querySelector(".unifiedStickyHeader");
      const fb = document.querySelector(".unifiedBody .filterBar");
      if (hd && hd.style.transform) menuH += hd.offsetHeight;
      if (fb && fb.style.transform) menuH += fb.offsetHeight;
    }
    const minTop = visTop + menuH + 12;

    let top = y - 14 - h; // preferred: bottom edge just above the card
    if (top < minTop) top = minTop; // clamp into view (over the card)
    setPlaced({ top, left: x });
  }, [course, anchorY, cardTop, cardCenterX]);

  if (!course) return null;

  const proceed = () => {
    window.open(course.course_url, "_blank", "noopener");
    onClose();
  };

  const modalStyle = placed
    ? { position: "absolute", top: placed.top, left: placed.left, transform: "translateX(-50%)" }
    : {
        position: "absolute",
        top: typeof cardTop === "number" ? cardTop : 300,
        left: "50%",
        transform: "translateX(-50%)",
        visibility: "hidden", // measured on first paint, then placed
      };

  return createPortal(
    <div className="odExtBackdrop" onClick={onClose} role="presentation">
      <div
        ref={boxRef}
        className="odExtModal"
        style={modalStyle}
        role="alertdialog"
        aria-modal="true"
        aria-label="Leaving MB2 Shield"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="odExtIcon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M14 4h6v6M20 4l-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M19 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h3 className="odExtTitle">You're leaving MB2 Shield</h3>
        <p className="odExtText">
          You are about to leave the MB2 Shield platform to go to a course on an
          external platform. Course completion and certificates will not be
          recorded within MB2 Shield.
        </p>
        <div className="odExtActions">
          <button type="button" className="odExtCancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="odExtConfirm" onClick={proceed}>
            I understand — Go to course
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* CreditBadge — clean, professional CE credit label. Small check-in-circle
   icon + bold number + "CE Credit(s)" text. Emerald tone for accreditation
   feel without visual noise. */
function CreditBadge({ ce, hidden = false }) {
  if (hidden) return <span aria-hidden="true" />;
  if (ce == null || Number.isNaN(ce)) {
    return (
      <span className="odCreditFallback" aria-label="Available anytime">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>Available anytime</span>
      </span>
    );
  }
  return (
    <span
      className="odCredit"
      aria-label={`${ce} CE ${ce === 1 ? "credit" : "credits"}`}
    >
      <svg
        className="odCreditIcon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.12"/>
        <path
          d="M8 12l3 3 5-6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="odCreditText">
        <strong>{ce}</strong> CE Credit{ce === 1 ? "" : "s"}
      </span>
    </span>
  );
}

function OnDemandCard({ course, onExternalClick }) {
  const thumbOk = isUrl(course.thumbnail_url);
  const canRegister = isUrl(course.course_url);
  const ce = typeof course.ce_hours === "number" ? course.ce_hours : null;

  const cardInner = (
    <>
      <div className={`thumb odThumb ${thumbOk ? "" : "thumbNoImg"}`}>
        {course.mb2_exclusive ? <span className="mb2Badge">Exclusive</span> : null}
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
        {ce != null || isUrl(course.vendor_logo_url) ? (
          <div className="topRow odVendorRow">
            <div className="metaRow">
              {ce != null ? <span className="ceBadge">{ce} CE</span> : null}
            </div>
            {isUrl(course.vendor_logo_url) ? (
              <img
                className="vendorLogo"
                src={course.vendor_logo_url}
                alt="Vendor logo"
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            ) : null}
          </div>
        ) : null}
        <h3 className="title" title={course.title}>{course.title}</h3>

        {safe(course.description) ? (
          <p className="descFull" title={course.description}>
            {course.description}
          </p>
        ) : null}

        {safe(course.cost) ? (
          <div className="odCostBanner">{course.cost}</div>
        ) : null}

        <div className="sessions">
          <div className="sessionGroup">
            <div className="session odSessionRow">
              <CreditBadge ce={null} hidden={ce != null} />
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

  if (canRegister && course.is_external) {
    // External course: intercept the click with a confirmation popup.
    return (
      <a
        className="card cardElevated odCard odCardClickable"
        href={course.course_url}
        target="_blank"
        rel="noopener"
        aria-label={`Open course: ${course.title}`}
        onClick={(e) => {
          e.preventDefault();
          // Pass the clicked card's position so the popup can hover right
          // above it. (Viewport-centered "fixed" positioning breaks inside
          // the TI iframe embed, where the iframe spans the whole catalog.)
          if (typeof onExternalClick === "function") {
            const r = e.currentTarget.getBoundingClientRect();
            onExternalClick({
              course,
              anchorY: e.pageY,
              cardTop: r.top + window.scrollY,
              cardCenterX: r.left + r.width / 2 + window.scrollX,
            });
          }
        }}
      >
        {cardInner}
      </a>
    );
  }

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
    roles, rolesSelected, setRolesSelected,
    categories, catSelected, setCatSelected,
    vendorOptions, vendorSelected, setVendorSelected,
    mb2ExclusiveOnly, setMb2ExclusiveOnly,
    toggle, clearFilters, filteredCount,
    showSearch, query, setQuery, searchPlaceholder,
    sortBy, setSortBy,
  } = props;

  const hasAnyFilter =
    (!isExclusiveMode && mb2ExclusiveOnly) ||
    typeSelected.size > 0 ||
    ceSelected.size > 0 ||
    rolesSelected.size > 0 ||
    (catSelected && catSelected.size > 0) ||
    (vendorSelected && vendorSelected.size > 0);
  const courseLabel = filteredCount === 1 ? "course" : "courses";

  return (
    <div className="filterBar" role="toolbar" aria-label="Course filters">
      <div className="filterBarInner">
        {showSearch && (
          <input
            className="filterBarSearch"
            type="search"
            placeholder={searchPlaceholder || "Search…"}
            value={query || ""}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {!isExclusiveMode && (
          <button
            type="button"
            className={`filterExclBtn ${mb2ExclusiveOnly ? "active" : ""}`}
            onClick={() => setMb2ExclusiveOnly(!mb2ExclusiveOnly)}
            aria-pressed={mb2ExclusiveOnly}
            title="Only show MB2 Exclusive courses"
          >
            <span className="filterExclStar" aria-hidden="true">★</span>
            <span className="filterExclLabel">MB2 Exclusive</span>
          </button>
        )}

        <OdFilterPopover
          label="Format"
          options={types}
          selected={typeSelected}
          onToggle={(v) => toggle(setTypeSelected, v)}
          onClear={() => setTypeSelected(new Set())}
        />
        <OdFilterPopover
          label="Role"
          options={roles}
          selected={rolesSelected}
          onToggle={(v) => toggle(setRolesSelected, v)}
          onClear={() => setRolesSelected(new Set())}
          searchable={roles.length > 10}
        />
        <OdFilterPopover
          label="Category"
          options={categories}
          selected={catSelected}
          onToggle={(v) => toggle(setCatSelected, v)}
          onClear={() => setCatSelected(new Set())}
          searchable={categories.length > 10}
        />
        <OdFilterPopover
          label="Vendor"
          options={vendorOptions || []}
          selected={vendorSelected}
          onToggle={(v) => toggle(setVendorSelected, v)}
          onClear={() => setVendorSelected(new Set())}
          searchable
        />
        <OdFilterPopover
          label="CE Hours"
          options={ceHours}
          selected={ceSelected}
          onToggle={(v) => toggle(setCeSelected, v)}
          onClear={() => setCeSelected(new Set())}
          formatOption={(o) => (typeof o === "string" ? o : `${o} CE`)}
        />

        <div className="filterBarSpacer" />

        {setSortBy && (
          <label className="filterBarSort">
            <span className="filterBarSortLabel">Sort by</span>
            <select
              className="filterBarSortSelect"
              value={sortBy || "newest"}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name (A → Z)</option>
              <option value="ce_desc">CE hours (high → low)</option>
              <option value="ce_asc">CE hours (low → high)</option>
            </select>
          </label>
        )}
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

function OdFilterPopover({ label, options, selected, onToggle, onClear, searchable = false, formatOption }) {
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

  const visibleOptions = useMemo(() => {
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
            {visibleOptions.length === 0 ? (
              <div className="filterPopEmpty">No matches</div>
            ) : (
              visibleOptions.map((opt) => {
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
