import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useClient } from "./AdminApp.jsx";

/**
 * /admin/clients — super admin only.
 * Lists every client with logo + slug + event count.
 * Add / edit / delete via modal.
 */
export default function Clients() {
  const { isSuperAdmin, reload: reloadClientContext } = useClient();
  const [rows, setRows] = useState([]);
  const [eventCounts, setEventCounts] = useState({});
  const [adminCounts, setAdminCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null); // { mode: 'add' } | { mode: 'edit', client, openTab?: 'team' }

  const load = async () => {
    setLoading(true); setError("");
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, slug, logo_url, updated_at, portal_token, portal_last_used_at")
      .order("name");
    if (error) { setError(error.message); setLoading(false); return; }
    setRows(data || []);

    const { data: ev } = await supabase.from("events").select("client_id");
    const counts = {};
    for (const r of ev || []) {
      if (r.client_id) counts[r.client_id] = (counts[r.client_id] || 0) + 1;
    }
    setEventCounts(counts);

    // Admin counts per client (RLS lets super admin see all). We join in
    // admins.email so we can filter out the system "portal-*" service
    // accounts from the count — those exist for RLS plumbing but aren't
    // real teammates.
    const { data: caRows } = await supabase
      .from("client_admins")
      .select("client_id, admins ( email )");
    const aCounts = {};
    for (const r of caRows || []) {
      if (!r.client_id) continue;
      const email = r.admins?.email || "";
      if (email.toLowerCase().endsWith("@portal.dentlogics.com")) continue;
      aCounts[r.client_id] = (aCounts[r.client_id] || 0) + 1;
    }
    setAdminCounts(aCounts);

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (row) => {
    const evCount = eventCounts[row.id] || 0;
    if (evCount > 0) {
      alert(`Can't delete "${row.name}" — it has ${evCount} event${evCount === 1 ? "" : "s"} attached.\n\nDelete or reassign the events first.`);
      return;
    }
    if (!confirm(`Delete client "${row.name}"?\n\nThis cannot be undone.`)) return;
    const { error } = await supabase.from("clients").delete().eq("id", row.id);
    if (error) return alert("Failed: " + error.message);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    reloadClientContext();
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      !q || r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q)
    );
  }, [rows, query]);

  if (!isSuperAdmin) {
    return (
      <div className="adminCard" style={{ maxWidth: 480, margin: "80px auto" }}>
        <h2>Super admin only</h2>
        <p>Client management is restricted to super admins.</p>
      </div>
    );
  }

  return (
    <section className="vdrPage">
      <header className="elHero">
        <div className="elHeroTop">
          <div>
            <p className="elKicker">Platform</p>
            <h1 className="elH1">Clients</h1>
            <p className="elHeroLead">
              Every organization whose catalog this platform hosts. Each client has isolated events,
              vendors, and admins.
            </p>
          </div>
          <button className="elPrimaryBtn" onClick={() => setModal({ mode: "add" })}>
            <span className="elPlus">+</span> Add client
          </button>
        </div>

        <div className="elStats vdrStatsGrid">
          <Stat label="Total clients"   value={rows.length}                                 tone="neutral" />
          <Stat label="With logo"       value={rows.filter((r) => r.logo_url).length}       tone="accent" />
          <Stat label="Missing logo"    value={rows.filter((r) => !r.logo_url).length}      tone="amber" />
          <Stat label="Events catalog-wide" value={Object.values(eventCounts).reduce((a, b) => a + b, 0)} tone="green" />
        </div>
      </header>

      <div className="elToolbar">
        <div className="elSearch">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search by name or slug…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="elSearchClear" onClick={() => setQuery("")} aria-label="Clear">×</button>
          )}
        </div>
      </div>

      {error && <div className="evErrorBanner">{error}</div>}

      {loading ? (
        <div className="formLoading"><div className="spinner" /> Loading clients…</div>
      ) : visible.length === 0 ? (
        <div className="elEmpty">
          <div className="elEmptyArt">🏢</div>
          <h3>{query ? "Nothing matches" : "No clients yet"}</h3>
          <p>{query ? "Try a different search." : "Add your first client to get started."}</p>
          <div className="elEmptyActions">
            {query
              ? <button className="primaryBtn" onClick={() => setQuery("")}>Clear search</button>
              : <button className="primaryBtn" onClick={() => setModal({ mode: "add" })}>+ Add client</button>}
          </div>
        </div>
      ) : (
        <div className="vdrCards">
          {visible.map((c) => (
            <ClientTile
              key={c.id}
              client={c}
              eventCount={eventCounts[c.id] || 0}
              adminCount={adminCounts[c.id] || 0}
              onOpen={() => setModal({ mode: "edit", client: c })}
            />
          ))}
        </div>
      )}

      {modal && (
        <ClientModal
          mode={modal.mode}
          client={modal.client}
          openTab={modal.openTab}
          eventCount={modal.client ? (eventCounts[modal.client.id] || 0) : 0}
          onClose={() => setModal(null)}
          onDelete={() => { if (modal.client) { remove(modal.client); setModal(null); } }}
          onSaved={(c) => {
            if (modal.mode === "add") {
              setRows((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
            } else {
              setRows((prev) =>
                prev.map((r) => (r.id === c.id ? c : r))
                    .sort((a, b) => a.name.localeCompare(b.name))
              );
            }
            setModal(null);
            reloadClientContext();
          }}
        />
      )}
    </section>
  );
}

/* ============================================================ */
function ClientTile({ client, eventCount, adminCount, onOpen }) {
  const hasLogo = !!(client.logo_url && client.logo_url.trim());
  return (
    <article
      className={`vdrTile ${hasLogo ? "" : "vdrTileNoLogo"}`}
      role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
    >
      <div className="vdrTileLogo">
        {hasLogo
          ? <img src={client.logo_url} alt={`${client.name} logo`} />
          : <LetterAvatar name={client.name} large />
        }
      </div>

      <div className="vdrTileFoot">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="vdrTileName" title={client.name}>{client.name}</h3>
          <div className="clientTileMeta">
            <span className="muted">/c/{client.slug}</span>
            <span className="clientTileSeparator">·</span>
            <span className="clientTileMetric">
              {eventCount} {eventCount === 1 ? "event" : "events"}
            </span>
            <span className="clientTileSeparator">·</span>
            <span className="clientTileMetric">
              {adminCount} {adminCount === 1 ? "admin" : "admins"}
            </span>
          </div>
        </div>
      </div>

      <div className="vdrTileHoverHint">Click to edit</div>
    </article>
  );
}

const AVATAR_PALETTES = [
  ["#fff7ed", "#c2410c"], ["#ecfdf5", "#047857"], ["#eff6ff", "#1d4ed8"],
  ["#f5f3ff", "#6d28d9"], ["#fef2f2", "#b91c1c"], ["#fffbeb", "#b45309"],
  ["#ecfeff", "#0e7490"], ["#fdf2f8", "#be185d"],
];
function paletteFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}
function LetterAvatar({ name, large }) {
  const [bg, fg] = paletteFor(name || "?");
  return (
    <div className={`vdrLetter ${large ? "vdrLetterLarge" : ""}`} style={{ background: bg, color: fg }}>
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`elStat elStat-${tone}`}>
      <div className="elStatValue">{value}</div>
      <div className="elStatLabel">{label}</div>
    </div>
  );
}

/* ============================================================
   Add / edit modal — now with a Team tab for managing access
============================================================ */
function ClientModal({ mode = "add", client, openTab, eventCount = 0, onClose, onSaved, onDelete }) {
  const isEdit = mode === "edit" && client;
  const [tab, setTab] = useState(openTab || "details"); // 'details' | 'team' | 'portal'
  const [name, setName] = useState(isEdit ? client.name : "");
  const [slug, setSlug] = useState(isEdit ? client.slug : "");
  const [logoUrl, setLogoUrl] = useState(isEdit ? (client.logo_url || "") : "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const [slugTouched, setSlugTouched] = useState(isEdit);

  // Auto-derive slug from name in add mode (until the user types one)
  useEffect(() => {
    if (slugTouched || isEdit) return;
    const auto = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setSlug(auto);
  }, [name, slugTouched, isEdit]);

  const uploadLogo = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `client-logos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("event-images")
        .upload(path, file, { cacheControl: "31536000", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("event-images").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
    } catch (e) { setError(e.message); }
    finally { setUploading(false); }
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !slug.trim()) { setError("Name and slug are required."); return; }
    const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-|-$/g, "");
    if (!clean) { setError("Slug must contain at least one letter or number."); return; }
    setSaving(true);
    try {
      let result;
      if (isEdit) {
        const { data, error } = await supabase
          .from("clients")
          .update({ name: name.trim(), slug: clean, logo_url: logoUrl.trim() || null })
          .eq("id", client.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase
          .from("clients")
          .insert({ name: name.trim(), slug: clean, logo_url: logoUrl.trim() || null })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
      onSaved(result);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modal vdrModal clientModalWide" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h3>{isEdit ? "Edit client" : "Add client"}</h3>
          <button className="modalClose" onClick={onClose} aria-label="Close">×</button>
        </div>

        {isEdit && (
          <div className="clientModalTabs">
            <button
              type="button"
              className={`clientModalTab ${tab === "details" ? "active" : ""}`}
              onClick={() => setTab("details")}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }}>
                <path d="M12 20.5c2-1.5 6-3.5 6-9V6l-6-2.5L6 6v5.5c0 5.5 4 7.5 6 9z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
              Details
            </button>
            <button
              type="button"
              className={`clientModalTab ${tab === "team" ? "active" : ""}`}
              onClick={() => setTab("team")}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }}>
                <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="2"/>
                <path d="M3 20c0-3 3-5 6-5s6 2 6 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="16" cy="9" r="2.5" fill="none" stroke="currentColor" strokeWidth="2"/>
                <path d="M14 20c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Approved emails
            </button>
            <button
              type="button"
              className={`clientModalTab ${tab === "portal" ? "active" : ""}`}
              onClick={() => setTab("portal")}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }}>
                <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1.5 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1.5-1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Portal Link
            </button>
          </div>
        )}

        {tab === "details" ? (
          <form onSubmit={save} className="modalBody">
            <div className="vdrModalLogo">
              {logoUrl
                ? <img src={logoUrl} alt="" />
                : <LetterAvatar name={name || "?"} large />}
              <button
                type="button"
                className="vdrModalLogoBtn"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading…" : (logoUrl ? "Replace logo" : "Upload logo")}
              </button>
              {logoUrl && (
                <button type="button" className="vdrModalLogoRemove"
                        onClick={() => setLogoUrl("")}>Remove</button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => uploadLogo(e.target.files?.[0])}
              />
            </div>

            <label className="field">
              <span>Client name *</span>
              <input
                autoFocus={!isEdit}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. MB2 Dental"
              />
            </label>

            <label className="field">
              <span>Slug *</span>
              <input
                required
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
                placeholder="mb2"
                spellCheck={false}
              />
              <span className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                URL: <code>/c/{slug || "..."}</code>
              </span>
            </label>

            {error && <p className="errMsg">{error}</p>}

            <div className="formActions clientFormActions">
              {isEdit && onDelete && (
                <button
                  type="button"
                  className="ghostBtn danger clientDeleteBtn"
                  onClick={onDelete}
                  title={eventCount > 0
                    ? `Can't delete — ${eventCount} event${eventCount === 1 ? "" : "s"} still attached`
                    : "Permanently delete this client"}
                  disabled={eventCount > 0}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }}>
                    <path d="M6 7h12M9 7V4h6v3m-7 0v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Delete client
                </button>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button type="button" className="ghostBtn" onClick={onClose}>Cancel</button>
                <button type="submit" className="primaryBtn" disabled={saving}>
                  {saving ? "Saving…" : (isEdit ? "Save changes" : "Add client")}
                </button>
              </div>
            </div>
          </form>
        ) : tab === "portal" ? (
          <PortalPanel client={client} onClose={onClose} />
        ) : (
          <TeamPanel client={client} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Portal panel — show + regenerate the client's portal URL
============================================================ */
function PortalPanel({ client, onClose }) {
  const [portalToken, setPortalToken] = useState(client.portal_token || null);
  const [lastUsedAt, setLastUsedAt] = useState(client.portal_last_used_at || null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Fetch latest token + last-used in case it changed since the list was loaded.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const { data, error } = await supabase
        .from("clients")
        .select("portal_token, portal_last_used_at")
        .eq("id", client.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) { setError(error.message); return; }
      setPortalToken(data?.portal_token || null);
      setLastUsedAt(data?.portal_last_used_at || null);
    }
    refresh();
    return () => { cancelled = true; };
  }, [client.id]);

  const portalUrl = portalToken
    ? `${window.location.origin}/portal/${portalToken}`
    : null;

  const copy = async () => {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this URL:", portalUrl);
    }
  };

  const regenerate = async () => {
    if (!window.confirm(
      `Regenerate the portal URL for ${client.name}?\n\n` +
      "The current URL will stop working immediately. Anyone using it will need the new URL."
    )) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase
        .rpc("regenerate_client_portal_token", { p_client_id: client.id });
      if (error) throw error;
      setPortalToken(data);
      setLastUsedAt(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const mailto = portalUrl
    ? `mailto:?subject=${encodeURIComponent(
        `Your ${client.name} Dentlogics portal`
      )}&body=${encodeURIComponent(
        `Click below to open your ${client.name} admin dashboard. Bookmark it — it works any time.\n\n${portalUrl}\n\nQuestions? support@dentlogics.com`
      )}`
    : "#";

  return (
    <div className="modalBody portalPanel">
      <p className="muted teamIntro">
        Anyone with the URL below can open <strong>{client.name}</strong>'s admin dashboard.
        Share it however works best — email, Slack, text. They can bookmark it and revisit any time.
      </p>

      <div className="portalUrlBox">
        <label className="portalUrlLabel">Portal URL</label>
        <div className="portalUrlRow">
          <input
            type="text"
            readOnly
            value={portalUrl || "Loading…"}
            onFocus={(e) => e.target.select()}
            className="portalUrlInput"
          />
          <button
            type="button"
            className={`primaryBtn ${copied ? "evCopied" : ""}`}
            onClick={copy}
            disabled={!portalUrl}
            style={{ whiteSpace: "nowrap" }}
          >
            {copied ? "✓ Copied" : "Copy URL"}
          </button>
        </div>
        <div className="portalUrlActions">
          <a
            className="ghostBtn"
            href={mailto}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 13, padding: "6px 12px" }}
          >
            Compose email…
          </a>
          <span className="muted" style={{ fontSize: 12 }}>
            {lastUsedAt
              ? `Last opened ${new Date(lastUsedAt).toLocaleString()}`
              : "Not opened yet"}
          </span>
        </div>
      </div>

      {error && <p className="teamNotice teamNoticeErr">{error}</p>}

      <div className="portalSecurityBox">
        <strong>Heads up:</strong>{" "}
        <span className="muted" style={{ fontSize: 13 }}>
          The URL is the credential — anyone with it can access {client.name}. If it leaks
          (forwarded email, screen-share, etc.), click <strong>Regenerate URL</strong> below.
          The old URL stops working instantly.
        </span>
      </div>

      <div className="formActions" style={{ marginTop: 18 }}>
        <button
          type="button"
          className="ghostBtn danger"
          onClick={regenerate}
          disabled={busy}
        >
          {busy ? "Regenerating…" : "Regenerate URL"}
        </button>
        <div style={{ marginLeft: "auto" }}>
          <button type="button" className="ghostBtn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Team panel — legacy email-grant flow (retained, not currently shown)
============================================================ */
function TeamPanel({ client, onClose }) {
  const [team, setTeam] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [granting, setGranting] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [justCopied, setJustCopied] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    const [tRes, pRes] = await Promise.all([
      supabase.rpc("list_client_team", { p_client_id: client.id }),
      supabase.rpc("list_client_pending", { p_client_id: client.id }),
    ]);
    if (tRes.error) setError(tRes.error.message);
    else {
      // Hide the system "portal-*@portal.dentlogics.com" service account
      // — that row exists so RLS can scope portal-link visitors to this
      // client, but it isn't a real teammate the super admin needs to see.
      const filtered = (tRes.data || []).filter(
        (m) => !(typeof m.email === "string" &&
                 m.email.toLowerCase().endsWith("@portal.dentlogics.com"))
      );
      setTeam(filtered);
    }
    if (!pRes.error) setPending(pRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [client.id]);

  const grant = async (e) => {
    e.preventDefault();
    setError(""); setInfo("");
    if (!email.trim()) return;
    setGranting(true);
    try {
      const { data, error } = await supabase
        .rpc("grant_client_access", { p_email: email.trim(), p_client_id: client.id });
      if (error) throw error;
      if (data?.ok === false) {
        setError(data.message || "Could not grant access.");
      } else if (data?.mode === "granted") {
        setInfo(`✓ Granted access to ${data.email}. They can sign in to /admin now.`);
        setEmail("");
        await load();
      } else if (data?.mode === "pending") {
        setInfo(`✓ Invite saved for ${data.email}. Copy the link below and share it with them.`);
        setEmail("");
        await load();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGranting(false);
    }
  };

  const revoke = async (userId, theirEmail) => {
    if (!confirm(`Remove ${theirEmail} from ${client.name}?`)) return;
    const { error } = await supabase
      .rpc("revoke_client_access", { p_user_id: userId, p_client_id: client.id });
    if (error) return alert("Failed: " + error.message);
    await load();
  };

  const revokePending = async (inviteId, theirEmail) => {
    if (!confirm(`Cancel pending invite for ${theirEmail}?`)) return;
    const { error } = await supabase.rpc("revoke_pending_invite", { p_invite_id: inviteId });
    if (error) return alert("Failed: " + error.message);
    await load();
  };

  const inviteLink = (theirEmail) =>
    `${window.location.origin}/?email=${encodeURIComponent(theirEmail)}`;

  const copyLink = async (theirEmail) => {
    try {
      await navigator.clipboard.writeText(inviteLink(theirEmail));
      setJustCopied(theirEmail);
      setTimeout(() => setJustCopied(null), 1800);
    } catch {
      alert("Couldn't copy. Link: " + inviteLink(theirEmail));
    }
  };

  return (
    <div className="modalBody teamPanel">
      <p className="muted teamIntro">
        Anyone listed here can sign in to <strong>/admin</strong> and manage{" "}
        <strong>{client.name}</strong>'s events and vendors. They'll only ever see this client.
      </p>

      <form onSubmit={grant} className="teamInviteRow">
        <input
          type="email"
          placeholder="teammate@client.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="primaryBtn" disabled={granting}>
          {granting ? "Granting…" : "Grant access"}
        </button>
      </form>

      {info && <p className="teamNotice teamNoticeOk">{info}</p>}
      {error && <p className="teamNotice teamNoticeErr">{error}</p>}
      <p className="muted teamHint">
        If the person has never signed in before, we'll create a <strong>pending invite</strong> and
        give you a shareable link below. As soon as they click it and sign in, they're added to your team automatically.
      </p>

      {/* Pending invites */}
      {pending.length > 0 && (
        <div className="teamList" style={{ marginBottom: 14, borderColor: "#fde68a", background: "#fffbeb" }}>
          <div className="teamListHeader">Pending invites ({pending.length})</div>
          {pending.map((inv) => (
            <div key={inv.id} className="teamRow">
              <div className="teamRowAvatar">
                <LetterAvatar name={inv.email} />
              </div>
              <div className="teamRowMeta">
                <div className="teamRowEmail">{inv.email}</div>
                <div className="teamRowSub muted">
                  Invited {new Date(inv.created_at).toLocaleDateString()} · waiting for first sign-in
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className={`primaryBtn ${justCopied === inv.email ? "evCopied" : ""}`}
                  onClick={() => copyLink(inv.email)}
                  style={{ padding: "6px 12px", fontSize: 13 }}
                  title="Copy the sign-in link to share with them"
                >
                  {justCopied === inv.email ? "✓ Copied" : "Copy link"}
                </button>
                <button
                  type="button"
                  className="ghostBtn danger"
                  onClick={() => revokePending(inv.id, inv.email)}
                  style={{ padding: "6px 10px", fontSize: 13 }}
                  title="Cancel this invite"
                >Cancel</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active team */}
      <div className="teamList">
        <div className="teamListHeader">Current team ({team.length})</div>
        {loading ? (
          <p className="muted" style={{ padding: 16 }}>Loading…</p>
        ) : team.length === 0 ? (
          <p className="muted" style={{ padding: 16 }}>
            Nobody is in yet — invite someone above.
          </p>
        ) : (
          team.map((m) => (
            <div key={m.user_id} className="teamRow">
              <div className="teamRowAvatar">
                <LetterAvatar name={m.email} />
              </div>
              <div className="teamRowMeta">
                <div className="teamRowEmail">{m.email}</div>
                <div className="teamRowSub muted">
                  {m.is_super_admin
                    ? "Super admin (sees all clients)"
                    : `Joined ${new Date(m.joined_at).toLocaleDateString()}`}
                </div>
              </div>
              <button
                type="button"
                className="ghostBtn danger"
                onClick={() => revoke(m.user_id, m.email)}
                disabled={m.is_super_admin}
                title={m.is_super_admin ? "Super admins can't be revoked from a single client" : "Remove from this client"}
              >Remove</button>
            </div>
          ))
        )}
      </div>

      <div className="formActions" style={{ marginTop: 18 }}>
        <button type="button" className="ghostBtn" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
