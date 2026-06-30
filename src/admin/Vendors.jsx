import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useClient } from "./AdminApp.jsx";

/**
 * Vendors / presenters page — card grid.
 * - Each vendor renders as a card with a big, contained logo at top.
 * - Click a card → opens the unified VendorModal in edit mode.
 * - "+ Add vendor" opens the same modal in add mode.
 * - Hover-reveal delete icon on each card.
 */
export default function Vendors() {
  const { currentClientId } = useClient();
  const [rows, setRows] = useState([]);
  const [eventCounts, setEventCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null); // { mode: 'add' } | { mode: 'edit', vendor }

  const load = async () => {
    if (!currentClientId) return;
    setLoading(true);
    setError("");
    const { data: vData, error: vErr } = await supabase
      .from("vendors")
      .select("id, name, logo_url, default_thumb_url, updated_at")
      .eq("client_id", currentClientId)
      .order("name");
    if (vErr) { setError(vErr.message); setLoading(false); return; }

    const { data: eData } = await supabase
      .from("events")
      .select("vendor")
      .eq("client_id", currentClientId);
    const counts = {};
    for (const r of eData || []) {
      const v = (r.vendor || "").trim().toLowerCase();
      if (v) counts[v] = (counts[v] || 0) + 1;
    }
    setEventCounts(counts);
    setRows(vData || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentClientId]);

  const remove = async (row) => {
    if (!confirm(`Delete vendor "${row.name}"?\n\nEvents that reference this vendor will keep the vendor name on them, but it'll be removed from the dropdown.`)) return;
    const { error } = await supabase.from("vendors").delete().eq("id", row.id);
    if (error) return alert("Failed: " + error.message);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const counts = useMemo(() => {
    const c = { all: rows.length, withLogo: 0, missingLogo: 0, eventsPowered: 0 };
    for (const r of rows) {
      if (r.logo_url && r.logo_url.trim()) c.withLogo++;
      else c.missingLogo++;
      c.eventsPowered += eventCounts[r.name.toLowerCase()] || 0;
    }
    return c;
  }, [rows, eventCounts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filter === "withLogo")    return !!(r.logo_url && r.logo_url.trim());
        if (filter === "missingLogo") return !(r.logo_url && r.logo_url.trim());
        return true;
      })
      .filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [rows, query, filter]);

  return (
    <section className="vdrPage">
      {/* HERO */}
      <header className="elHero">
        <div className="elHeroTop">
          <div>
            <p className="elKicker">Brand</p>
            <h1 className="elH1">Presenters &amp; Vendors</h1>
            <p className="elHeroLead">
              The companies and instructors behind every course. Their logos appear on the public catalog.
            </p>
          </div>
          <button className="elPrimaryBtn" onClick={() => setModal({ mode: "add" })}>
            <span className="elPlus">+</span> Add vendor
          </button>
        </div>

        <div className="elStats vdrStatsGrid">
          <Stat label="Total"           value={counts.all}           tone="neutral" />
          <Stat label="With logo"       value={counts.withLogo}      tone="accent"  />
          <Stat label="Missing logo"    value={counts.missingLogo}   tone="amber"   />
          <Stat label="Events powered"  value={counts.eventsPowered} tone="green"   />
        </div>
      </header>

      {/* TOOLBAR */}
      <div className="elToolbar">
        <div className="elSearch">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search vendors by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="elSearchClear" onClick={() => setQuery("")} aria-label="Clear search">×</button>
          )}
        </div>

        <div className="elFilterPills" role="tablist">
          <FilterPill id="all"          label="All"           count={counts.all}          active={filter} onSelect={setFilter} />
          <FilterPill id="withLogo"     label="With logo"     count={counts.withLogo}     active={filter} onSelect={setFilter} />
          <FilterPill id="missingLogo"  label="Missing logo"  count={counts.missingLogo}  active={filter} onSelect={setFilter} />
        </div>
      </div>

      {error && <div className="evErrorBanner">{error}</div>}

      {loading ? (
        <div className="formLoading"><div className="spinner" /> Loading vendors…</div>
      ) : visible.length === 0 ? (
        <EmptyState
          query={query}
          filter={filter}
          onClear={() => { setQuery(""); setFilter("all"); }}
          onAdd={() => setModal({ mode: "add" })}
        />
      ) : (
        <div className="vdrCards">
          {visible.map((v) => (
            <VendorTile
              key={v.id}
              vendor={v}
              eventCount={eventCounts[v.name.toLowerCase()] || 0}
              onOpen={() => setModal({ mode: "edit", vendor: v })}
              onDelete={() => remove(v)}
            />
          ))}
        </div>
      )}

      {/* MODAL */}
      {modal && (
        <VendorModal
          mode={modal.mode}
          vendor={modal.vendor}
          onClose={() => setModal(null)}
          onSaved={(v) => {
            if (modal.mode === "add") {
              setRows((prev) => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
            } else {
              setRows((prev) =>
                prev.map((r) => (r.id === v.id ? v : r))
                    .sort((a, b) => a.name.localeCompare(b.name))
              );
            }
            setModal(null);
          }}
        />
      )}
    </section>
  );
}

/* ============================================================
   Vendor tile — the centerpiece
============================================================ */
function VendorTile({ vendor, eventCount, onOpen, onDelete }) {
  const hasLogo = !!(vendor.logo_url && vendor.logo_url.trim());
  return (
    <article
      className={`vdrTile ${hasLogo ? "" : "vdrTileNoLogo"}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
    >
      <button
        type="button"
        className="vdrTileDel"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete vendor"
        aria-label={`Delete ${vendor.name}`}
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path d="M6 7h12M9 7V4h6v3m-7 0v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div className="vdrTileLogo">
        {hasLogo
          ? <img src={vendor.logo_url} alt={`${vendor.name} logo`} />
          : <LetterAvatar name={vendor.name} large />
        }
      </div>

      <div className="vdrTileFoot">
        <h3 className="vdrTileName" title={vendor.name}>{vendor.name}</h3>
        <span className={`vdrTileChip ${eventCount > 0 ? "" : "vdrTileChipMuted"}`}>
          {eventCount} {eventCount === 1 ? "event" : "events"}
        </span>
      </div>

      <div className="vdrTileHoverHint">Click to edit</div>
    </article>
  );
}

/* ============================================================
   Letter avatar (used when no logo)
============================================================ */
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
    <div
      className={`vdrLetter ${large ? "vdrLetterLarge" : ""}`}
      style={{ background: bg, color: fg }}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

function FilterPill({ id, label, count, active, onSelect }) {
  return (
    <button
      role="tab"
      aria-selected={active === id}
      className={`elFilterPill ${active === id ? "active" : ""}`}
      onClick={() => onSelect(id)}
    >
      {label}
      <span className="elFilterCount">{count}</span>
    </button>
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

function EmptyState({ query, filter, onClear, onAdd }) {
  const filtered = query || filter !== "all";
  return (
    <div className="elEmpty">
      <div className="elEmptyArt">🪪</div>
      <h3>{filtered ? "Nothing matches" : "No vendors yet"}</h3>
      <p>
        {filtered
          ? "Try clearing the search or pick a different filter."
          : "Add your first vendor or import events — vendors get created automatically when you do."}
      </p>
      <div className="elEmptyActions">
        {filtered
          ? <button className="primaryBtn" onClick={onClear}>Clear filters</button>
          : <button className="primaryBtn" onClick={onAdd}>+ Add vendor</button>}
      </div>
    </div>
  );
}

/* ============================================================
   Unified vendor modal — handles both Add and Edit
   (Exported as AddVendorModal too for EventForm backwards-compat)
============================================================ */
export function VendorModal({ mode = "add", vendor, onClose, onSaved, initialName = "" }) {
  const { currentClientId } = useClient();
  const isEdit = mode === "edit" && vendor;
  const [name, setName] = useState(isEdit ? vendor.name : initialName);
  const [logoUrl, setLogoUrl] = useState(isEdit ? (vendor.logo_url || "") : "");
  const [defaultThumbUrl, setDefaultThumbUrl] = useState(isEdit ? (vendor.default_thumb_url || "") : "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const thumbFileRef = useRef(null);

  const uploadLogo = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `vendor-logos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("event-images")
        .upload(path, file, { cacheControl: "31536000", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("event-images").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const uploadDefaultThumb = async (file) => {
    if (!file) return;
    setUploadingThumb(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `vendor-thumbs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("event-images")
        .upload(path, file, { cacheControl: "31536000", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("event-images").getPublicUrl(path);
      setDefaultThumbUrl(pub.publicUrl);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploadingThumb(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Vendor name is required."); return; }
    setSaving(true);
    try {
      let result;
      if (isEdit) {
        const { data, error } = await supabase
          .from("vendors")
          .update({ name: name.trim(), logo_url: logoUrl.trim() || null, default_thumb_url: defaultThumbUrl.trim() || null })
          .eq("id", vendor.id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase
          .from("vendors")
          .insert({ name: name.trim(), logo_url: logoUrl.trim() || null, default_thumb_url: defaultThumbUrl.trim() || null, client_id: currentClientId })
          .select()
          .single();
        if (error) throw error;
        result = data;
      }
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modal vdrModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h3>{isEdit ? "Edit vendor" : "Add vendor"}</h3>
          <button className="modalClose" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={save} className="modalBody">
          {/* Large logo preview */}
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
              <button
                type="button"
                className="vdrModalLogoRemove"
                onClick={() => setLogoUrl("")}
              >Remove</button>
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
            <span>Vendor name *</span>
            <input
              autoFocus={!isEdit}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Straumann"
            />
          </label>

          <label className="field">
            <span>Logo URL</span>
            <input
              className="urlInput"
              placeholder="https://example.com/logo.png"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
          </label>

          {/* Default catalog thumbnail — auto-applied to new events with this vendor */}
          <div className="vdrThumbBlock">
            <div className="vdrThumbBlockLabel">
              Default catalog thumbnail
              <span className="vdrThumbBlockHint">
                Auto-applied to new events created with this vendor. Each event
                can override it with its own thumbnail.
              </span>
            </div>
            <div className="vdrThumbBlockMain">
              <div className={`vdrThumbPreview ${defaultThumbUrl ? "" : "vdrThumbPreviewEmpty"}`}>
                {defaultThumbUrl ? (
                  <img src={defaultThumbUrl} alt="Default thumbnail" />
                ) : (
                  <div className="vdrThumbPreviewPh">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="5" width="18" height="14" rx="2" stroke="#94a3b8" strokeWidth="2"/>
                      <circle cx="9" cy="11" r="1.5" fill="#94a3b8"/>
                      <path d="M21 17l-5-5-9 9" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>No thumbnail</span>
                  </div>
                )}
              </div>
              <div className="vdrThumbActions">
                <button
                  type="button"
                  className="ghostBtn"
                  onClick={() => thumbFileRef.current?.click()}
                  disabled={uploadingThumb}
                >
                  {uploadingThumb ? "Uploading…" : (defaultThumbUrl ? "Replace thumbnail" : "Upload thumbnail")}
                </button>
                {defaultThumbUrl && (
                  <button
                    type="button"
                    className="ghostBtn danger"
                    onClick={() => setDefaultThumbUrl("")}
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={thumbFileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => uploadDefaultThumb(e.target.files?.[0])}
                />
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Recommended: 780 × 340 pixels (matches the catalog card thumbnail).
                </p>
              </div>
            </div>
          </div>

          {error && <p className="errMsg">{error}</p>}

          <div className="formActions">
            <button type="button" className="ghostBtn" onClick={onClose}>Cancel</button>
            <button type="submit" className="primaryBtn" disabled={saving}>
              {saving ? "Saving…" : (isEdit ? "Save changes" : "Add vendor")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Keep this export so EventForm's existing import still works
export function AddVendorModal({ onClose, onCreated, initialName }) {
  return (
    <VendorModal
      mode="add"
      initialName={initialName}
      onClose={onClose}
      onSaved={onCreated}
    />
  );
}
