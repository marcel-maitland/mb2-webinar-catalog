import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";

/**
 * Vendors / presenters management page.
 * - Lists every vendor with its logo.
 * - Inline rename + logo upload/paste.
 * - Add and delete via top buttons.
 * - Renaming or changing a logo here propagates to every event using that
 *   vendor via the sync_vendor_logo_to_events trigger in Postgres.
 */
export default function Vendors() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    const { data, error } = await supabase
      .from("vendors")
      .select("id, name, logo_url, updated_at")
      .order("name");
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const remove = async (row) => {
    if (!confirm(`Delete vendor "${row.name}"?\n\nEvents that reference this vendor will keep the vendor name on them, but the vendor will be removed from the dropdown.`)) return;
    const { error } = await supabase.from("vendors").delete().eq("id", row.id);
    if (error) return alert("Failed: " + error.message);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  return (
    <section>
      <div className="rowBetween">
        <h2>Presenters / Vendors</h2>
        <button className="primaryBtn" onClick={() => setAdding(true)}>+ Add vendor</button>
      </div>

      <div className="filtersBar">
        <input
          className="search"
          placeholder="Search vendors…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="errMsg">{error}</p>}

      {!loading && !error && (
        <div className="tableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Logo</th>
                <th>Name</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <VendorRow
                  key={row.id}
                  row={row}
                  onUpdated={(next) =>
                    setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)))
                  }
                  onDelete={() => remove(row)}
                />
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={3} className="muted">No vendors match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <AddVendorModal
          onClose={() => setAdding(false)}
          onCreated={(v) => { setRows((prev) => [...prev, v].sort((a, b) => a.name.localeCompare(b.name))); setAdding(false); }}
        />
      )}
    </section>
  );
}

/* ---------- single row with inline edit ---------- */
function VendorRow({ row, onUpdated, onDelete }) {
  const [name, setName] = useState(row.name);
  const [logoUrl, setLogoUrl] = useState(row.logo_url || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

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
    <tr>
      <td>
        {logoUrl
          ? <img className="tinyThumb vendorLogoCell" src={logoUrl} alt="" />
          : <div className="tinyThumb tinyThumbEmpty vendorLogoCell" />
        }
      </td>
      <td>
        <input
          className="vendorRowInput"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="vendorRowSubControls">
          <input
            className="urlInput"
            placeholder="Logo URL"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => uploadLogo(e.target.files?.[0])}
          />
          <button type="button" className="ghostBtn" disabled={uploading}
                  onClick={() => fileRef.current?.click()}>
            {uploading ? "Uploading…" : "Upload logo"}
          </button>
        </div>
      </td>
      <td>
        <div className="vendorRowActions">
          {dirty && (
            <button className="primaryBtn" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          <button className="ghostBtn danger" onClick={onDelete}>Delete</button>
        </div>
      </td>
    </tr>
  );
}

/* ---------- Add-vendor modal (used here and from EventForm) ---------- */
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
    if (error) {
      setError(error.message);
      return;
    }
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
