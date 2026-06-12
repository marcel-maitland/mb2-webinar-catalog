import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";

/**
 * Vendors / presenters management page.
 * - Each row is a "quiet-input" card: name and URL look like text until focused.
 * - Missing logos are replaced with a colored letter avatar so every vendor has identity.
 * - Each row shows how many events use this vendor.
 * - Hover reveals edit + delete; Save button only appears when the row is dirty.
 */
export default function Vendors() {
  const [rows, setRows] = useState([]);
  const [eventCounts, setEventCounts] = useState({}); // { lowername: count }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | withLogo | missingLogo
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");

    // Vendors
    const { data: vData, error: vErr } = await supabase
      .from("vendors")
      .select("id, name, logo_url, updated_at")
      .order("name");
    if (vErr) { setError(vErr.message); setLoading(false); return; }

    // Event counts — fetch the vendor column for every event and tally in JS
    const { data: eData, error: eErr } = await supabase
      .from("events")
      .select("vendor");
    if (!eErr) {
      const counts = {};
      for (const r of eData || []) {
        const v = (r.vendor || "").trim().toLowerCase();
        if (v) counts[v] = (counts[v] || 0) + 1;
      }
      setEventCounts(counts);
    }

    setRows(vData || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (row) => {
    if (!confirm(`Delete vendor "${row.name}"?\n\nEvents that reference this vendor will keep the vendor name on them, but the vendor will be removed from the dropdown.`)) return;
    const { error } = await supabase.from("vendors").delete().eq("id", row.id);
    if (error) return alert("Failed: " + error.message);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const counts = useMemo(() => {
    const c = { all: rows.length, withLogo: 0, missingLogo: 0, eventsPowered: 0 };
    for (const r of rows) {
      if (r.logo_url && r.logo_url.trim()) c.withLogo++;
      else c.missingLogo++;
      const used = eventCounts[r.name.toLowerCase()] || 0;
      c.eventsPowered += used;
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
          <button className="elPrimaryBtn" onClick={() => setAdding(true)}>
            <span className="elPlus">+</span> Add vendor
          </button>
        </div>

        <div className="elStats vdrStatsGrid">
          <Stat label="Total"           value={counts.all}          tone="neutral" />
          <Stat label="With logo"       value={counts.withLogo}     tone="accent"  />
          <Stat label="Missing logo"    value={counts.missingLogo}  tone="amber"   />
          <Stat label="Events powered"  value={counts.eventsPowered} tone="green"  />
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

      {/* ROWS */}
      {error && <div className="evErrorBanner">{error}</div>}

      {loading ? (
        <div className="formLoading"><div className="spinner" /> Loading vendors…</div>
      ) : visible.length === 0 ? (
        <div className="elEmpty">
          <div className="elEmptyArt">🪪</div>
          <h3>{query || filter !== "all" ? "Nothing matches" : "No vendors yet"}</h3>
          <p>
            {query || filter !== "all"
              ? "Try clearing the search or pick a different filter."
              : "Add your first vendor or import events — vendors get created automatically when you do."}
          </p>
          <div className="elEmptyActions">
            {query || filter !== "all"
              ? <button className="primaryBtn" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>
              : <button className="primaryBtn" onClick={() => setAdding(true)}>+ Add vendor</button>}
          </div>
        </div>
      ) : (
        <div className="vdrGrid">
          {visible.map((row) => (
            <VendorCard
              key={row.id}
              row={row}
              eventCount={eventCounts[row.name.toLowerCase()] || 0}
              onUpdated={(next) =>
                setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)).sort((a,b)=>a.name.localeCompare(b.name)))
              }
              onDelete={() => remove(row)}
            />
          ))}
        </div>
      )}

      {adding && (
        <AddVendorModal
          onClose={() => setAdding(false)}
          onCreated={(v) => {
            setRows((prev) => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}

/* ============================================================
   Letter avatar — deterministic color per vendor name
============================================================ */
const AVATAR_PALETTES = [
  ["#fff7ed", "#c2410c"], // orange
  ["#ecfdf5", "#047857"], // green
  ["#eff6ff", "#1d4ed8"], // blue
  ["#f5f3ff", "#6d28d9"], // purple
  ["#fef2f2", "#b91c1c"], // red
  ["#fffbeb", "#b45309"], // amber
  ["#ecfeff", "#0e7490"], // cyan
  ["#fdf2f8", "#be185d"], // pink
];
function paletteFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}
function LetterAvatar({ name }) {
  const [bg, fg] = paletteFor(name || "?");
  return (
    <div className="vdrAvatar vdrAvatarLetter" style={{ background: bg, color: fg }}>
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

/* ============================================================
   Single vendor card (quiet inputs, hover-reveal actions)
============================================================ */
function VendorCard({ row, eventCount, onUpdated, onDelete }) {
  const [name, setName] = useState(row.name);
  const [logoUrl, setLogoUrl] = useState(row.logo_url || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef(null);

  const hasLogo = !!(logoUrl && logoUrl.trim());
  const dirty = name !== row.name || logoUrl !== (row.logo_url || "");

  const save = async () => {
    if (!name.trim()) return alert("Vendor name is required.");
    setSaving(true);
    const { data, error } = await supabase
      .from("vendors")
      .update({ name: name.trim(), logo_url: logoUrl.trim() || null })
      .eq("id", row.id)
      .select()
      .single();
    setSaving(false);
    if (error) return alert("Failed: " + error.message);
    onUpdated(data);
  };

  const reset = () => { setName(row.name); setLogoUrl(row.logo_url || ""); };

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
      alert("Upload failed: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <article className={`vdrCard ${dirty ? "dirty" : ""}`}>
      <div className="vdrCardMain">
        <div
          className="vdrLogoBox"
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          title={hasLogo ? "Replace logo" : "Upload logo"}
        >
          {hasLogo
            ? <img className="vdrAvatar vdrAvatarImg" src={logoUrl} alt="" />
            : <LetterAvatar name={name} />
          }
          <div className="vdrLogoOverlay">{uploading ? "Uploading…" : (hasLogo ? "Replace" : "Upload")}</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => uploadLogo(e.target.files?.[0])}
          />
        </div>

        <div className="vdrNameWrap">
          <input
            className="vdrNameInput"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vendor name"
            spellCheck={false}
          />
          <button
            type="button"
            className="vdrUrlToggle"
            onClick={() => setExpanded((s) => !s)}
            title={hasLogo ? "Edit logo URL" : "Paste a logo URL"}
          >
            {hasLogo
              ? <span className="vdrUrlHasLink" title={logoUrl}>{shortenUrl(logoUrl)}</span>
              : <span className="muted">No logo · click to add a URL</span>}
            <span className="vdrUrlCaret">{expanded ? "▴" : "▾"}</span>
          </button>
        </div>

        <div className="vdrMetaRight">
          <span className={`vdrEventChip ${eventCount > 0 ? "" : "vdrEventChipMuted"}`}>
            {eventCount} {eventCount === 1 ? "event" : "events"}
          </span>
          <div className="vdrActions">
            <button
              type="button"
              className="elIconBtn elIconBtnDanger"
              onClick={onDelete}
              title="Delete vendor"
              aria-label="Delete vendor"
            >
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M6 7h12M9 7V4h6v3m-7 0v13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="vdrExpand">
          <label className="evLabel">Logo URL</label>
          <input
            className="urlInput"
            placeholder="https://example.com/logo.png"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        </div>
      )}

      {dirty && (
        <div className="vdrSaveBar">
          <span className="muted">Unsaved changes</span>
          <div>
            <button className="ghostBtn" onClick={reset}>Discard</button>
            <button className="primaryBtn" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function shortenUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname.replace(/^www\./, "") + (url.pathname !== "/" ? "/…" : "");
  } catch {
    return u;
  }
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

/* ============================================================
   Add-vendor modal (used here and from EventForm)
============================================================ */
export function AddVendorModal({ onClose, onCreated, initialName = "" }) {
  const [name, setName] = useState(initialName);
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

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

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Vendor name is required."); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from("vendors")
      .insert({ name: name.trim(), logo_url: logoUrl.trim() || null })
      .select()
      .single();
    setSaving(false);
    if (error) { setError(error.message); return; }
    onCreated(data);
  };

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h3>Add vendor</h3>
          <button className="modalClose" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={save} className="modalBody">
          <label className="field">
            <span>Vendor name *</span>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Straumann"
            />
          </label>

          <div className="field">
            <span>Logo</span>
            <div className="uploadRow">
              {logoUrl
                ? <img className="previewImg" src={logoUrl} alt="" />
                : <div className="previewImg previewImgEmpty">No logo</div>
              }
              <div className="uploadControls">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => uploadLogo(e.target.files?.[0])}
                />
                <button type="button" className="ghostBtn" disabled={uploading}
                        onClick={() => fileRef.current?.click()}>
                  {uploading ? "Uploading…" : "Upload image"}
                </button>
                {logoUrl && (
                  <button type="button" className="ghostBtn danger"
                          onClick={() => setLogoUrl("")}>Remove</button>
                )}
                <input
                  className="urlInput"
                  placeholder="…or paste a logo URL"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && <p className="errMsg">{error}</p>}

          <div className="formActions">
            <button type="button" className="ghostBtn" onClick={onClose}>Cancel</button>
            <button type="submit" className="primaryBtn" disabled={saving}>
              {saving ? "Saving…" : "Add vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
