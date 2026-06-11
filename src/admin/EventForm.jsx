import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

const BLANK = {
  title: "",
  description: "",
  event_date: "",      // datetime-local format (yyyy-MM-ddTHH:mm)
  category: "",
  ce_hours: "",
  cost: "",
  vendor: "",
  vendor_logo_url: "",
  thumb_url: "",
  format: "Webinar",
  roles: [],           // editable as comma-separated string in UI
  location: "",
  in_person_registration_url: "",
  session1_label: "",
  session1_url: "",
  session2_label: "",
  session2_url: "",
  mb2_exclusive: false,
  is_published: false,
};

// timestamptz → "yyyy-MM-ddTHH:mm" for <input type=datetime-local>
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function EventForm({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(BLANK);
  const [rolesText, setRolesText] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const thumbInput = useRef(null);
  const logoInput = useRef(null);
  const [uploading, setUploading] = useState({ thumb: false, logo: false });

  useEffect(() => {
    if (mode !== "edit") return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("events").select("*").eq("id", id).single();
      if (cancelled) return;
      if (error) setError(error.message);
      else if (data) {
        setForm({
          ...BLANK,
          ...data,
          event_date: toLocalInput(data.event_date),
        });
        setRolesText((data.roles || []).join(", "));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mode, id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const uploadImage = async (file, kind) => {
    if (!file) return;
    setUploading((u) => ({ ...u, [kind]: true }));
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("event-images")
        .upload(path, file, { cacheControl: "31536000", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("event-images").getPublicUrl(path);
      const url = pub.publicUrl;
      if (kind === "thumb") set("thumb_url", url);
      else set("vendor_logo_url", url);
    } catch (e) {
      alert("Upload failed: " + e.message);
    } finally {
      setUploading((u) => ({ ...u, [kind]: false }));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      ...form,
      ce_hours: form.ce_hours === "" || form.ce_hours == null ? null : Number(form.ce_hours),
      event_date: form.event_date ? new Date(form.event_date).toISOString() : null,
      roles: rolesText
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    };

    try {
      if (mode === "new") {
        const { error } = await supabase.from("events").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("events").update(payload).eq("id", id);
        if (error) throw error;
      }
      navigate("/admin");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <div className="rowBetween">
        <h2>{mode === "new" ? "New event" : "Edit event"}</h2>
      </div>

      <form onSubmit={save} className="adminForm">
        <div className="grid2">
          <label className="field">
            <span>Title *</span>
            <input required value={form.title} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className="field">
            <span>Date / time</span>
            <input
              type="datetime-local"
              value={form.event_date}
              onChange={(e) => set("event_date", e.target.value)}
            />
          </label>

          <label className="field">
            <span>Format</span>
            <select value={form.format ?? ""} onChange={(e) => set("format", e.target.value)}>
              <option value="Webinar">Webinar</option>
              <option value="In-Person">In-Person</option>
              <option value="Online">Online</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </label>
          <label className="field">
            <span>CE hours</span>
            <input
              type="number" step="0.25" min="0"
              value={form.ce_hours ?? ""}
              onChange={(e) => set("ce_hours", e.target.value)}
            />
          </label>

          <label className="field">
            <span>Category</span>
            <input value={form.category ?? ""} onChange={(e) => set("category", e.target.value)} />
          </label>
          <label className="field">
            <span>Cost</span>
            <input
              placeholder="FREE, $475, etc."
              value={form.cost ?? ""}
              onChange={(e) => set("cost", e.target.value)}
            />
          </label>

          <label className="field">
            <span>Presenter / Vendor</span>
            <input value={form.vendor ?? ""} onChange={(e) => set("vendor", e.target.value)} />
          </label>
          <label className="field">
            <span>Roles (comma-separated)</span>
            <input
              placeholder="Dentist, Hygienist, Assistants"
              value={rolesText}
              onChange={(e) => setRolesText(e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span>Description</span>
          <textarea rows={5} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </label>

        <div className="grid2">
          <div className="field">
            <span>Course thumbnail</span>
            <div className="uploadRow">
              {form.thumb_url ? (
                <img className="previewImg" src={form.thumb_url} alt="" />
              ) : (
                <div className="previewImg previewImgEmpty">No image</div>
              )}
              <div className="uploadControls">
                <input
                  ref={thumbInput}
                  type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => uploadImage(e.target.files?.[0], "thumb")}
                />
                <button type="button" className="ghostBtn"
                        disabled={uploading.thumb}
                        onClick={() => thumbInput.current?.click()}>
                  {uploading.thumb ? "Uploading…" : "Upload image"}
                </button>
                {form.thumb_url && (
                  <button type="button" className="ghostBtn danger"
                          onClick={() => set("thumb_url", "")}>Remove</button>
                )}
                <input
                  className="urlInput"
                  placeholder="…or paste an image URL"
                  value={form.thumb_url ?? ""}
                  onChange={(e) => set("thumb_url", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <span>Vendor logo</span>
            <div className="uploadRow">
              {form.vendor_logo_url ? (
                <img className="previewImg" src={form.vendor_logo_url} alt="" />
              ) : (
                <div className="previewImg previewImgEmpty">No logo</div>
              )}
              <div className="uploadControls">
                <input
                  ref={logoInput}
                  type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => uploadImage(e.target.files?.[0], "logo")}
                />
                <button type="button" className="ghostBtn"
                        disabled={uploading.logo}
                        onClick={() => logoInput.current?.click()}>
                  {uploading.logo ? "Uploading…" : "Upload logo"}
                </button>
                {form.vendor_logo_url && (
                  <button type="button" className="ghostBtn danger"
                          onClick={() => set("vendor_logo_url", "")}>Remove</button>
                )}
                <input
                  className="urlInput"
                  placeholder="…or paste a logo URL"
                  value={form.vendor_logo_url ?? ""}
                  onChange={(e) => set("vendor_logo_url", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <h3>Online registration sessions</h3>
        <div className="grid2">
          <label className="field">
            <span>Session 1 label</span>
            <input value={form.session1_label ?? ""} onChange={(e) => set("session1_label", e.target.value)} />
          </label>
          <label className="field">
            <span>Session 1 link</span>
            <input value={form.session1_url ?? ""} onChange={(e) => set("session1_url", e.target.value)} />
          </label>
          <label className="field">
            <span>Session 2 label</span>
            <input value={form.session2_label ?? ""} onChange={(e) => set("session2_label", e.target.value)} />
          </label>
          <label className="field">
            <span>Session 2 link</span>
            <input value={form.session2_url ?? ""} onChange={(e) => set("session2_url", e.target.value)} />
          </label>
        </div>

        <h3>In-person details</h3>
        <div className="grid2">
          <label className="field">
            <span>Location</span>
            <input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />
          </label>
          <label className="field">
            <span>In-person registration link</span>
            <input value={form.in_person_registration_url ?? ""} onChange={(e) => set("in_person_registration_url", e.target.value)} />
          </label>
        </div>

        <div className="flagRow">
          <label className="checkRow">
            <input type="checkbox" checked={!!form.mb2_exclusive} onChange={(e) => set("mb2_exclusive", e.target.checked)} />
            <span>MB2 Exclusive</span>
          </label>
          <label className="checkRow">
            <input type="checkbox" checked={!!form.is_published} onChange={(e) => set("is_published", e.target.checked)} />
            <span>Published (visible on public catalog)</span>
          </label>
        </div>

        {error && <p className="errMsg">{error}</p>}

        <div className="formActions">
          <button type="button" className="ghostBtn" onClick={() => navigate("/admin")}>Cancel</button>
          <button type="submit" className="primaryBtn" disabled={saving}>
            {saving ? "Saving…" : mode === "new" ? "Create event" : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
