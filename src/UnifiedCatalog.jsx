import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import App from "./App.jsx";
import OnDemand from "./OnDemand.jsx";
import { supabase } from "./lib/supabase.js";
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
const DEFAULT_TAB = "on-demand";

export default function UnifiedCatalog() {
  const { slug: routeSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const slug = (routeSlug || DEFAULT_SLUG).toLowerCase();
  const initialTab = searchParams.get("tab") === "events" ? "events" : DEFAULT_TAB;
  const [tab, setTab] = useState(initialTab);

  // Client info for the shared header (logo, name)
  const [client, setClient] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name, slug, logo_url")
        .eq("slug", slug)
        .maybeSingle();
      if (!cancelled) setClient(data || null);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const switchTab = (nextTab) => {
    setTab(nextTab);
    // Keep URL in sync so hard-refresh preserves the tab.
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  };

  const displayName = client?.name || (slug === "mb2" ? "MB2 Dental" : slug);

  return (
    <div className="unifiedPage">
      {/* Client header — logo + name centered */}
      <header className="unifiedHeader">
        {client?.logo_url && (
          <img
            className="unifiedHeaderLogo"
            src={client.logo_url}
            alt={`${displayName} logo`}
          />
        )}
        <div className="unifiedHeaderText">
          <div className="unifiedHeaderKicker">Continuing Education Catalog</div>
          <h1 className="unifiedHeaderTitle">{displayName}</h1>
        </div>
      </header>

      {/* Big tabs — On Demand / Live Events */}
      <nav className="unifiedTabs" role="tablist" aria-label="Catalog type">
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
      </nav>

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
