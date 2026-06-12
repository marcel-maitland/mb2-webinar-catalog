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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null); // { mode: 'add' } | { mode: 'edit', client }

  const load = async () => {
    setLoading(true); setError("");
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, slug, logo_url, updated_at")
      .order("name");
    if (error) { setError(error.message); setLoading(false); return; }
    setRows(data || []);

    const { data: ev } = await supabase.from("events").select("client_id");
    const counts = {};
    for (const r of ev || []) {
      if (r.client_id) counts[r.client_id] = (counts[r.client_id] || 0) + 1;
    }
    setEventCounts(counts);
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
              onOpen={() => setModal({ mode: "edit", client: c })}
              onDelete={() => remove(c)}
            />
          ))}
        </div>
      )}

      {modal && (
        <ClientModal
          mode={modal.mode}
          client={modal.client}
          onClose={() => setModal(null)}
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
function ClientTile({ client, eventCount, onOpen, onDelete }) {
  const hasLogo = !!(client.logo_url && client.logo_url.trim());
  return (
    <article
      className={`vdrTile ${hasLogo ? "" : "vdrTileNoLogo"}`}
      role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
    >
      <button
        type="button"
        className="vdrTileDel"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete client"
        aria-label={`Delete ${client.name}`}
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path d="M6 7h12M9 7V4h6v3m-7 0v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div className="vdrTileLogo">
        {hasLogo
          ? <img src={client.logo_url} alt={`${client.name} logo`} />
          : <LetterAvatar name={client.name} large />
        }
      </div>

      <div className="vdrTileFoot">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="vdrTileName" title={client.name}>{client.name}</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>/c/{client.slug}</div>
        </div>
        <span className={`vdrTileChip ${eventCount > 0 ? "" : "vdrTileChipMuted"}`}>
          {eventCount} {eventCount === 1 ? "event" : "events"}
        </span>
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
   Add / edit modal
============================================================ */
function ClientModal({ mode = "add", client, onClose, onSaved }) {
  const isEdit = mode === "edit" && client;
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
      <div className="modal vdrModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h3>{isEdit ? "Edit client" : "Add client"}</h3>
          <button className="modalClose" onClick={onClose} aria-label="Close">×</button>
        </div>
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

          <div className="formActions">
            <button type="button" className="ghostBtn" onClick={onClose}>Cancel</button>
            <button type="submit" className="primaryBtn" disabled={saving}>
              {saving ? "Saving…" : (isEdit ? "Save changes" : "Add client")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
