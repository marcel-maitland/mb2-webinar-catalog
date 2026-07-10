import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import App from "./App.jsx";
import OnDemand from "./OnDemand.jsx";
import "./catalog-extras.css";
import "./on-demand.css";
import "./unified-catalog.css";

/**
 * UnifiedCatalog — a single page that toggles between the On-Demand
 * catalog and the Live Events / Webinars catalog for a given client.
 * Intended to be embedded in TI (Thought Industries) as one stable URL.
 *
 * Routes:
 *   /all              → defaults to slug "mb2" (matches the rest of the app)
 *   /all/:slug        → specific client's unified catalog
 *
 * Query param `tab` deep-links the initial tab:
 *   ?tab=on-demand    → shows On-Demand courses first
 *   ?tab=events       → shows Live Events first
 * The default is "on-demand" per the product requirements.
 */
const DEFAULT_SLUG = "mb2";
const DEFAULT_TAB = "events";

export default function UnifiedCatalog() {
  const { slug: routeSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const slug = (routeSlug || DEFAULT_SLUG).toLowerCase();
  const tabParam = searchParams.get("tab");
  const initialTab =
    tabParam === "on-demand" || tabParam === "events" ? tabParam : DEFAULT_TAB;
  const [tab, setTab] = useState(initialTab);

  const switchTab = (nextTab) => {
    setTab(nextTab);
    // Keep URL in sync so hard-refresh preserves the tab.
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="unifiedPage">
      {/* Sticky header block — title + tabs stick together at the top of
          the widget. Below them, the filter bar (from inside the child
          catalog) docks flush and stays pinned too. */}
      <div className="unifiedStickyHeader">
        <header className="unifiedTitleBar">
          <h1 className="unifiedTitle">
            On-demand Courses, Live Events, Webinars and State Requirements
          </h1>
        </header>

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
