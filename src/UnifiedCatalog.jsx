import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import App from "./App.jsx";
import OnDemand from "./OnDemand.jsx";
import { createCatalogChannel, post } from "./embedSync.js";
import "./catalog-extras.css";
import "./on-demand.css";
import "./unified-catalog.css";

/**
 * UnifiedCatalog — a single page that toggles between the On-Demand
 * catalog and the Live Events / Webinars catalog for a given client.
 * Intended to be embedded in TI (Thought Industries) as one stable URL.
 *
 * Routes:
 *   /all[/:slug]       → the full page (title + tabs + filters + grid)
 *   /all-bar[/:slug]   → TWO-FRAME EMBED: tabs + filter bar ONLY. The
 *                        parent page makes this iframe position:sticky,
 *                        so it pins natively with zero scroll jitter.
 *   /all-grid[/:slug]  → TWO-FRAME EMBED: the grid ONLY. Auto-heights.
 * The bar and grid frames sync tab + filter state over a
 * BroadcastChannel (see embedSync.js).
 *
 * Query param `tab` deep-links the initial tab:
 *   ?tab=on-demand    → shows On-Demand courses first
 *   ?tab=events       → shows Live Events first
 */
const DEFAULT_SLUG = "mb2";
const DEFAULT_TAB = "events";

export default function UnifiedCatalog({ ui = null }) {
  const { slug: routeSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const slug = (routeSlug || DEFAULT_SLUG).toLowerCase();
  const tabParam = searchParams.get("tab");
  const initialTab =
    tabParam === "on-demand" || tabParam === "events" ? tabParam : DEFAULT_TAB;
  const [tab, setTab] = useState(initialTab);
  const headerRef = useRef(null);

  // Two-frame embed: shared channel between the bar and grid frames.
  const channel = useMemo(
    () => (ui ? createCatalogChannel(slug) : null),
    [ui, slug]
  );
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    if (!channel) return;
    const onMsg = (e) => {
      const m = e.data || {};
      if (ui === "grid" && m.kind === "tab" && (m.tab === "events" || m.tab === "on-demand")) {
        setTab(m.tab);
      }
      // A grid frame that loads after the bar asks for the current tab.
      if (ui === "bar" && m.kind === "hello") {
        post(channel, { kind: "tab", tab: tabRef.current });
      }
    };
    channel.addEventListener("message", onMsg);
    if (ui === "grid") post(channel, { kind: "hello" });
    return () => channel.removeEventListener("message", onMsg);
  }, [channel, ui]);

  // Bar frame: make the page background transparent so that when the
  // parent grows this iframe for a filter dropdown, the catalog cards
  // stay visible behind it instead of a blank white area. The bar
  // itself keeps its own solid background.
  useEffect(() => {
    if (ui !== "bar") return;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, [ui]);

  // Publish the tabs bar's real height as a CSS variable so the filter
  // bar's sticky offset always sits flush below it (any screen size).
  useEffect(() => {
    const setVar = () => {
      const h = headerRef.current ? headerRef.current.offsetHeight : 100;
      document.documentElement.style.setProperty("--ucTabsH", `${h}px`);
    };
    setVar();
    window.addEventListener("resize", setVar);
    return () => window.removeEventListener("resize", setVar);
  }, []);

  const backToFilters = () => {
    // scrollIntoView propagates to the parent page even from inside an
    // iframe, so this works in the TI embed as well as standalone.
    headerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const switchTab = (nextTab) => {
    setTab(nextTab);
    // Two-frame embed: tell the grid frame which tab is active.
    if (ui === "bar") post(channel, { kind: "tab", tab: nextTab });
    // Keep URL in sync so hard-refresh preserves the tab.
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  };

  /* ---------- TWO-FRAME EMBED: bar frame (tabs + filters only) ---------- */
  if (ui === "bar") {
    return (
      <div className="unifiedPage unifiedBarOnly" data-mb2-embed-ui="bar">
        <div className="unifiedStickyHeader" ref={headerRef}>
          <nav className="unifiedTabs" role="tablist" aria-label="Catalog type">
            <TabButton
              active={tab === "events"}
              onClick={() => switchTab("events")}
              label="Live Events & Webinars"
              sub="Scheduled sessions · register to attend"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              }
            />
            <TabButton
              active={tab === "on-demand"}
              onClick={() => switchTab("on-demand")}
              label="On Demand Courses"
              sub="Learn anytime · self-paced"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M8 5v14l11-7z" fill="currentColor"/>
                </svg>
              }
            />
            <TabLink
              href="https://learn.dentlogics.com/pages/state-requirements"
              label="CE Requirements"
              sub="State by state required courses for credentialing"
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                  <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              }
            />
          </nav>
        </div>
        {tab === "on-demand" ? (
          <OnDemand embedded embedUi="bar" syncChannel={channel} />
        ) : (
          <App embedded slugOverride={slug} embedUi="bar" syncChannel={channel} />
        )}
      </div>
    );
  }

  /* ---------- TWO-FRAME EMBED: grid frame (cards only) ---------- */
  if (ui === "grid") {
    return (
      <div className="unifiedPage unifiedGridOnly" data-mb2-embed-ui="grid">
        {tab === "on-demand" ? (
          <OnDemand embedded embedUi="grid" syncChannel={channel} />
        ) : (
          <App embedded slugOverride={slug} embedUi="grid" syncChannel={channel} />
        )}
      </div>
    );
  }

  /* ---------- Normal single-page mode (unchanged) ---------- */
  return (
    <div className="unifiedPage">
      {/* Section title — scrolls away normally so the pinned area stays
          compact and leaves more room for the course cards. */}
      <header className="unifiedTitleBar">
        <h1 className="unifiedTitle">
          On-demand Courses, Live Events, Webinars and State Requirements
        </h1>
      </header>

      {/* Sticky block — TABS only (title excluded). The filter bar from
          the child catalog docks flush below and stays pinned too. */}
      <div className="unifiedStickyHeader" ref={headerRef}>
        {/* Big tabs — On Demand / Live Events / CE Requirements. */}
        <nav className="unifiedTabs" role="tablist" aria-label="Catalog type">
        <TabButton
          active={tab === "events"}
          onClick={() => switchTab("events")}
          label="Live Events & Webinars"
          sub="Scheduled sessions · register to attend"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          }
        />
        <TabButton
          active={tab === "on-demand"}
          onClick={() => switchTab("on-demand")}
          label="On Demand Courses"
          sub="Learn anytime · self-paced"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M8 5v14l11-7z" fill="currentColor"/>
            </svg>
          }
        />
        <TabLink
          href="https://learn.dentlogics.com/pages/state-requirements"
          label="CE Requirements"
          sub="State by state required courses for credentialing"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          }
        />
        </nav>
      </div>

      {/* Body — mount whichever catalog is active. Keep the inactive one
          unmounted so its filter/search state doesn't linger. */}
      <div className="unifiedBody">
        {tab === "on-demand" ? (
          <OnDemand embedded />
        ) : (
          <App embedded slugOverride={slug} />
        )}
      </div>

      {/* End-of-catalog helper — one tap back to the search + filters.
          Rendered in normal flow (not fixed) because viewport-pinned UI
          can't work inside the auto-sized TI iframe. */}
      <div className="unifiedBackRow">
        <button type="button" className="unifiedBackBtn" onClick={backToFilters}>
          ↑ Back to search &amp; filters
        </button>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, sub, icon }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`unifiedTab ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span className="unifiedTabIcon" aria-hidden="true">{icon}</span>
      <span className="unifiedTabText">
        <span className="unifiedTabLabel">{label}</span>
        <span className="unifiedTabSub">{sub}</span>
      </span>
    </button>
  );
}

/* External-link variant of TabButton — opens a URL in a new tab.
   Used for the CE Requirements tab which lives on the marketing site.
   `target="_blank"` + `rel="noopener"` ensures it escapes the iframe
   cleanly and doesn't hand any window reference back to the opener. */
function TabLink({ href, label, sub, icon }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="unifiedTab unifiedTabLink"
    >
      <span className="unifiedTabIcon" aria-hidden="true">{icon}</span>
      <span className="unifiedTabText">
        <span className="unifiedTabLabel">
          {label}
          <svg
            className="unifiedTabExternal"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M14 4h6v6M20 4L10 14M6 6h4M6 6v12h12v-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="unifiedTabSub">{sub}</span>
      </span>
    </a>
  );
}
