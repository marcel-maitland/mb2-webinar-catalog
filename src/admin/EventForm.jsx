import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { AddVendorModal } from "./Vendors.jsx";
import { useClient } from "./AdminApp.jsx";

const BLANK = {
  title: "",
  description: "",
  event_date: "",
  category: "",
  ce_hours: "",
  cost: "",
  vendor: "",
  vendor_logo_url: "",
  thumb_url: "",
  format: "Webinar",
  roles: [],
  location: "",
  in_person_registration_url: "",
  session1_label: "",
  session1_url: "",
  session2_label: "",
  session2_url: "",
  mb2_exclusive: false,
  is_published: false,
};

const FORMATS = ["Webinar", "In-Person", "Hybrid", "Online"];

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDate = (d) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const isUrl = (u) => typeof u === "string" && u.trim().startsWith("http");
const isInPersonFormat = (f) => {
  const s = (f || "").toLowerCase();
  return s === "in-person" || s === "in person" || s === "inperson" || s === "hybrid";
};

/* =====================================================================
   MAIN FORM
===================================================================== */
export default function EventForm({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentClientId, currentClient } = useClient();
  const exclusiveLabel = currentClient?.name
    ? `${currentClient.name} Exclusive`
    : "Exclusive";
  const [form, setForm] = useState(BLANK);
  const [original, setOriginal] = useState(BLANK);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const thumbInput = useRef(null);

  // Autocomplete suggestions pulled from this client's existing events
  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [roleSuggestions, setRoleSuggestions] = useState([]);

  useEffect(() => {
    if (!currentClientId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("category, roles")
        .eq("client_id", currentClientId);
      if (cancelled || !data) return;

      const catCounts = {};
      const roleCounts = {};
      for (const r of data) {
        const c = (r.category || "").trim();
        if (c) catCounts[c] = (catCounts[c] || 0) + 1;
        if (Array.isArray(r.roles)) {
          for (const role of r.roles) {
            const t = (role || "").trim();
            if (t) roleCounts[t] = (roleCounts[t] || 0) + 1;
          }
        }
      }
      const toSorted = (counts) =>
        Object.entries(counts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      setCategorySuggestions(toSorted(catCounts));
      setRoleSuggestions(toSorted(roleCounts));
    })();
    return () => { cancelled = true; };
  }, [currentClientId]);

  useEffect(() => {
    if (mode !== "edit") { setOriginal(BLANK); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("events").select("*").eq("id", id).single();
      if (cancelled) return;
      if (error) setError(error.message);
      else if (data) {
        const next = {
          ...BLANK,
          ...data,
          event_date: toLocalInput(data.event_date),
          roles: Array.isArray(data.roles) ? data.roles : [],
        };
        setForm(next);
        setOriginal(next);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mode, id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const dirty = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(original);
  }, [form, original]);

  // Save with Cmd+S
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && !saving) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const uploadThumb = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `thumb/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("event-images")
        .upload(path, file, { cacheControl: "31536000", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("event-images").getPublicUrl(path);
      set("thumb_url", pub.publicUrl);
    } catch (e) {
      alert("Upload failed: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!form.title.trim()) { setError("Event title is required."); return; }
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      ce_hours: form.ce_hours === "" || form.ce_hours == null ? null : Number(form.ce_hours),
      event_date: form.event_date ? new Date(form.event_date).toISOString() : null,
      roles: form.roles,
      client_id: currentClientId,
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

  const remove = async () => {
    if (mode !== "edit") return;
    if (!confirm(`Delete "${form.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) return alert("Delete failed: " + error.message);
    navigate("/admin");
  };

  const duplicate = async () => {
    if (mode !== "edit") return;
    if (dirty) {
      if (!confirm("You have unsaved changes. Duplicate based on the saved version anyway?")) return;
    }
    const payload = {
      title: `${form.title} (copy)`,
      description: form.description || null,
      event_date: form.event_date ? new Date(form.event_date).toISOString() : null,
      category: form.category || null,
      ce_hours: form.ce_hours === "" || form.ce_hours == null ? null : Number(form.ce_hours),
      cost: form.cost || null,
      vendor: form.vendor || null,
      vendor_logo_url: form.vendor_logo_url || null,
      thumb_url: form.thumb_url || null,
      format: form.format || null,
      roles: form.roles || [],
      location: form.location || null,
      in_person_registration_url: form.in_person_registration_url || null,
      session1_label: form.session1_label || null,
      session1_url: form.session1_url || null,
      session2_label: form.session2_label || null,
      session2_url: form.session2_url || null,
      mb2_exclusive: !!form.mb2_exclusive,
      is_published: false,         // safer default
      client_id: currentClientId,
    };
    const { data, error } = await supabase
      .from("events")
      .insert(payload)
      .select()
      .single();
    if (error) return alert("Duplicate failed: " + error.message);
    navigate(`/admin/events/${data.id}`);
  };

  if (loading) {
    return <div className="formLoading"><div className="spinner" /> Loading event…</div>;
  }

  const showInPerson = isInPersonFormat(form.format);

  return (
    <div className="evForm">
      {/* Sticky top action bar */}
      <div className="evToolbar">
        <div className="evToolbarLeft">
          <Link to="/admin" className="evBack" aria-label="Back to events">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Events
          </Link>
          <div>
            <h1 className="evTitle">{mode === "new" ? "New event" : "Edit event"}</h1>
            <p className="evSubtitle">
              {dirty
                ? <span className="evDirty">● Unsaved changes</span>
                : <span className="evClean">All changes saved</span>}
            </p>
          </div>
        </div>
        <div className="evToolbarRight">
          <Switch
            label={exclusiveLabel}
            checked={form.mb2_exclusive}
            onChange={(v) => set("mb2_exclusive", v)}
            tone="gold"
          />
          <Switch
            label="Published"
            checked={form.is_published}
            onChange={(v) => set("is_published", v)}
            tone="accent"
          />
          {mode === "edit" && (
            <button type="button" className="ghostBtn" onClick={duplicate} title="Create a draft copy of this event">
              <svg viewBox="0 0 24 24" width="14" height="14" style={{ marginRight: 6, verticalAlign: "-2px" }} aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Duplicate
            </button>
          )}
          <button type="button" className="ghostBtn" onClick={() => navigate("/admin")}>Cancel</button>
          <button type="button" className="primaryBtn" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : mode === "new" ? "Create event" : "Save changes"}
          </button>
        </div>
      </div>

      {error && <div className="evErrorBanner">{error}</div>}

      {/* Two-column body */}
      <div className="evBody">
        <form className="evMain" onSubmit={save}>
          <Section title="Event basics" subtitle="The core details people see first.">
            <Field label="Event title" required>
              <input
                className="hero"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Give this event a name"
              />
            </Field>

            <div className="row3">
              <Field label="Date & time">
                <input
                  type="datetime-local"
                  value={form.event_date}
                  onChange={(e) => set("event_date", e.target.value)}
                />
              </Field>
              <Field label="CE credits">
                <input
                  type="number" step="0.25" min="0"
                  value={form.ce_hours ?? ""}
                  onChange={(e) => set("ce_hours", e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Cost">
                <CostInput value={form.cost ?? ""} onChange={(v) => set("cost", v)} />
              </Field>
            </div>

            <Field label="Format">
              <PillSelector
                options={FORMATS}
                value={form.format ?? ""}
                onChange={(v) => set("format", v)}
              />
            </Field>

            <Field label="Category">
              <CategoryCombobox
                value={form.category ?? ""}
                onChange={(v) => set("category", v)}
                suggestions={categorySuggestions}
              />
            </Field>
          </Section>

          <Section title="Presenter" subtitle="Who's teaching and who this is for.">
            <Field label="Presenter / Vendor">
              <VendorCombobox
                value={form.vendor ?? ""}
                onChange={(name, logo) => {
                  set("vendor", name);
                  if (logo !== undefined) set("vendor_logo_url", logo);
                }}
              />
              <p className="evHint">
                Manage vendors and logos on the <Link to="/admin/vendors">Vendors page</Link>.
              </p>
            </Field>

            <Field label="Roles" hint="Pick from the dropdown or type a new role. Click a chip to remove.">
              <ChipInput
                value={form.roles}
                onChange={(next) => set("roles", next)}
                suggestions={roleSuggestions}
                placeholder="Dentist"
              />
            </Field>
          </Section>

          <Section title="Description" subtitle="What attendees will learn.">
            <textarea
              className="evTextarea"
              rows={6}
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Explain the value of attending in a few sentences."
            />
            <div className="evCharCount muted">{(form.description ?? "").length} characters</div>
          </Section>

          <Section title="Thumbnail" subtitle="The image visitors see in the catalog grid.">
            <ThumbnailDropZone
              url={form.thumb_url}
              uploading={uploading}
              onUpload={uploadThumb}
              onClear={() => set("thumb_url", "")}
              onUrlChange={(v) => set("thumb_url", v)}
              fileRef={thumbInput}
            />
          </Section>

          <Section title="Online registration" subtitle="Up to two sessions per event.">
            <SessionRow
              n={1}
              label={form.session1_label}
              url={form.session1_url}
              onLabel={(v) => set("session1_label", v)}
              onUrl={(v) => set("session1_url", v)}
            />
            <SessionRow
              n={2}
              label={form.session2_label}
              url={form.session2_url}
              onLabel={(v) => set("session2_label", v)}
              onUrl={(v) => set("session2_url", v)}
            />
          </Section>

          {showInPerson && (
            <Section title="In-person details" subtitle="Where it's happening and how to register.">
              <Field label="Location">
                <input
                  value={form.location ?? ""}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="1718 Trinity Valley Dr., Carrollton, TX 75006"
                />
              </Field>
              <Field label="In-person registration link">
                <input
                  value={form.in_person_registration_url ?? ""}
                  onChange={(e) => set("in_person_registration_url", e.target.value)}
                  placeholder="https://"
                />
              </Field>
            </Section>
          )}

          {mode === "edit" && (
            <Section title="Danger zone" subtitle="Permanent actions." tone="danger">
              <div className="dangerRow">
                <div>
                  <strong>Delete this event</strong>
                  <p className="muted">Removes it from the database. Cannot be undone.</p>
                </div>
                <button type="button" className="ghostBtn danger" onClick={remove}>
                  Delete event
                </button>
              </div>
            </Section>
          )}
        </form>

        {/* Live preview */}
        <aside className="evPreview">
          <div className="evPreviewSticky">
            <div className="evPreviewLabel">Live preview</div>
            <PreviewCard form={form} exclusiveLabel={exclusiveLabel} />
            <p className="evPreviewHint muted">
              This is what visitors will see on the public catalog. Updates as you type.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* =====================================================================
   SUBCOMPONENTS
===================================================================== */

function Section({ title, subtitle, tone, children }) {
  return (
    <section className={`evSection ${tone === "danger" ? "evSectionDanger" : ""}`}>
      <header>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="evSectionBody">{children}</div>
    </section>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div className="evField">
      <label className="evLabel">
        {label}{required && <span className="evRequired">*</span>}
      </label>
      {children}
      {hint && <div className="evFieldHint muted">{hint}</div>}
    </div>
  );
}

function Switch({ label, checked, onChange, tone = "accent" }) {
  return (
    <label className={`evSwitch evSwitch-${tone} ${checked ? "on" : ""}`}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="evSwitchSlider" />
      <span className="evSwitchLabel">{label}</span>
    </label>
  );
}

function PillSelector({ options, value, onChange }) {
  return (
    <div className="evPills" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={value === opt}
          className={`evPill ${value === opt ? "active" : ""}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function CostInput({ value, onChange }) {
  const isFree = (value || "").trim().toLowerCase() === "free";
  return (
    <div className="evCostInput">
      <span className="evCostPrefix">{isFree ? "" : "$"}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="475"
      />
      <button
        type="button"
        className={`evCostFreeBtn ${isFree ? "active" : ""}`}
        onClick={() => onChange(isFree ? "" : "FREE")}
        title="Toggle free"
      >
        FREE
      </button>
    </div>
  );
}

function ChipInput({ value, onChange, placeholder, suggestions = [] }) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const commit = (raw) => {
    const next = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (next.length === 0) return;
    const merged = Array.from(new Set([...value, ...next]));
    onChange(merged);
    setDraft("");
  };
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));
  const addOne = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...value, trimmed]);
    setDraft("");
  };

  // Filter suggestions: exclude already-selected, match draft if any
  const filtered = useMemo(() => {
    const used = new Set(value.map((v) => v.toLowerCase()));
    const q = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => !used.has(s.name.toLowerCase()))
      .filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [suggestions, value, draft]);

  const hasDraftMatch =
    !!draft.trim() &&
    !suggestions.some((s) => s.name.toLowerCase() === draft.trim().toLowerCase());

  return (
    <div className="vendorCombo" ref={wrapRef}>
      <div className="evChipInput">
        {value.map((tag, i) => (
          <span key={i} className="evChip" onClick={() => remove(i)} title="Remove">
            {tag}
            <span className="evChipX">×</span>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) commit(v.slice(0, -1));
            else { setDraft(v); setOpen(true); }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(draft); }
            if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          placeholder={value.length === 0 ? placeholder : ""}
        />
      </div>
      {open && (filtered.length > 0 || hasDraftMatch) && (
        <ul className="vendorComboList" role="listbox">
          {hasDraftMatch && (
            <li
              className="vendorComboAdd"
              onMouseDown={(e) => { e.preventDefault(); addOne(draft); }}
            >
              <span className="vendorComboLogo vendorComboLogoAddIcon">+</span>
              <span className="vendorComboName">Add "{draft.trim()}"</span>
            </li>
          )}
          {filtered.slice(0, 30).map((s) => (
            <li
              key={s.name}
              role="option"
              onMouseDown={(e) => { e.preventDefault(); addOne(s.name); }}
            >
              <span className="vendorComboName">{s.name}</span>
              <span className="vendorComboCount">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Single-select combobox for the Category field — same vibe as VendorCombobox */
function CategoryCombobox({ value, onChange, suggestions = [] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter((c) => c.name.toLowerCase().includes(q));
  }, [suggestions, value]);

  const isNew =
    !!(value || "").trim() &&
    !suggestions.some((c) => c.name.toLowerCase() === (value || "").trim().toLowerCase());

  return (
    <div className="vendorCombo" ref={wrapRef}>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Surgical, Orthodontics, Prevention…"
        autoComplete="off"
      />
      {open && (
        <ul className="vendorComboList" role="listbox">
          {isNew && (
            <li
              className="vendorComboAdd"
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); }}
            >
              <span className="vendorComboLogo vendorComboLogoAddIcon">+</span>
              <span className="vendorComboName">Use "{value.trim()}" as a new category</span>
            </li>
          )}
          {filtered.length === 0 && !isNew && (
            <li className="vendorComboEmpty muted">No categories yet — type to create one.</li>
          )}
          {filtered.map((c) => (
            <li
              key={c.name}
              role="option"
              onMouseDown={(e) => { e.preventDefault(); onChange(c.name); setOpen(false); }}
              className={value && c.name.toLowerCase() === value.toLowerCase() ? "active" : ""}
            >
              <span className="vendorComboName">{c.name}</span>
              <span className="vendorComboCount">{c.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ThumbnailDropZone({ url, uploading, onUpload, onClear, onUrlChange, fileRef }) {
  const [drag, setDrag] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  return (
    <div className="evThumbWrap">
      <div
        className={`evThumbZone ${drag ? "drag" : ""} ${url ? "hasImage" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onUpload(f);
        }}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        {url ? (
          <img src={url} alt="" className="evThumbImage" />
        ) : (
          <div className="evThumbEmpty">
            <div className="evThumbEmptyIcon">🖼️</div>
            <div className="evThumbEmptyText">
              <strong>Drop an image here</strong>
              <span>or click to upload</span>
            </div>
          </div>
        )}
        {url && (
          <div className="evThumbOverlay">
            <span>{uploading ? "Uploading…" : "Replace"}</span>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => onUpload(e.target.files?.[0])}
        />
      </div>

      <div className="evThumbActions">
        {url && (
          <button type="button" className="ghostBtn danger" onClick={onClear}>Remove image</button>
        )}
        <button type="button" className="evLinkBtn" onClick={() => setShowUrl((s) => !s)}>
          {showUrl ? "Hide URL field" : "Use image URL instead"}
        </button>
      </div>

      {showUrl && (
        <input
          className="urlInput"
          placeholder="https://…image.jpg"
          value={url ?? ""}
          onChange={(e) => onUrlChange(e.target.value)}
        />
      )}
    </div>
  );
}

function SessionRow({ n, label, url, onLabel, onUrl }) {
  return (
    <div className="evSessionRow">
      <span className="evSessionN">{n}</span>
      <input
        className="evSessionLabel"
        value={label ?? ""}
        onChange={(e) => onLabel(e.target.value)}
        placeholder={n === 1 ? "Time, e.g. 7:00 PM CT" : "Optional second session time"}
      />
      <input
        className="evSessionUrl"
        value={url ?? ""}
        onChange={(e) => onUrl(e.target.value)}
        placeholder="https://registration-link"
      />
    </div>
  );
}

/* =====================================================================
   VENDOR COMBOBOX  (unchanged behavior, polished labels)
===================================================================== */
function VendorCombobox({ value, onChange }) {
  const { currentClientId } = useClient();
  const [vendors, setVendors] = useState([]);
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(false);    // when true, render input instead of chip
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const loadVendors = async () => {
    if (!currentClientId) return;
    const { data, error } = await supabase
      .from("vendors")
      .select("id, name, logo_url")
      .eq("client_id", currentClientId)
      .order("name");
    if (!error) setVendors(data || []);
  };

  useEffect(() => { loadVendors(); }, [currentClientId]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        // Drop out of edit mode on outside click; chip reappears if value matches a known vendor
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Currently-selected vendor object (when the value matches a known vendor)
  const selectedVendor = useMemo(() => {
    const v = (value || "").trim().toLowerCase();
    if (!v) return null;
    return vendors.find((x) => x.name.toLowerCase() === v) || null;
  }, [vendors, value]);

  const showChip = !!selectedVendor && !editing;

  const filtered = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) => v.name.toLowerCase().includes(q));
  }, [vendors, value]);

  const select = (v) => {
    onChange(v.name, v.logo_url || "");
    setOpen(false);
    setEditing(false);
  };

  const clearVendor = () => {
    onChange("", "");
    setEditing(true);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const startChange = () => {
    setEditing(true);
    setOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  return (
    <div className="vendorCombo" ref={wrapRef}>
      {showChip ? (
        <div className="vendorChip">
          {selectedVendor.logo_url
            ? <img src={selectedVendor.logo_url} alt="" className="vendorChipLogo" />
            : <span className="vendorChipLogoPh">{selectedVendor.name.charAt(0).toUpperCase()}</span>}
          <span className="vendorChipName">{selectedVendor.name}</span>
          <div className="vendorChipActions">
            <button type="button" className="vendorChipChange" onClick={startChange}>
              Change
            </button>
            <button
              type="button"
              className="vendorChipClear"
              onClick={clearVendor}
              title="Remove vendor"
              aria-label="Remove vendor"
            >×</button>
          </div>
        </div>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={value ?? ""}
          onChange={(e) => { onChange(e.target.value, undefined); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Type to search vendors"
          autoComplete="off"
        />
      )}

      {open && (
        <ul className="vendorComboList" role="listbox">
          <li
            className="vendorComboAdd"
            onMouseDown={(e) => { e.preventDefault(); setOpen(false); setShowAdd(true); }}
          >
            <span className="vendorComboLogo vendorComboLogoAddIcon">+</span>
            <span className="vendorComboName">Add new vendor…</span>
          </li>
          {filtered.length === 0 && (
            <li className="vendorComboEmpty muted">No matches — add a new vendor above.</li>
          )}
          {filtered.map((v) => (
            <li
              key={v.id}
              role="option"
              onMouseDown={(e) => { e.preventDefault(); select(v); }}
              className={value && v.name.toLowerCase() === value.toLowerCase() ? "active" : ""}
            >
              {v.logo_url
                ? <img src={v.logo_url} alt="" className="vendorComboLogo" />
                : <span className="vendorComboLogo vendorComboLogoEmpty" />
              }
              <span className="vendorComboName">{v.name}</span>
            </li>
          ))}
        </ul>
      )}
      {showAdd && (
        <AddVendorModal
          initialName={value || ""}
          onClose={() => setShowAdd(false)}
          onCreated={async (v) => {
            await loadVendors();
            onChange(v.name, v.logo_url || "");
            setEditing(false);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

/* =====================================================================
   LIVE PREVIEW CARD (mirrors the public catalog tile)
===================================================================== */
function PreviewCard({ form, exclusiveLabel = "Exclusive" }) {
  const d = form.event_date ? new Date(form.event_date) : null;
  const thumb = isUrl(form.thumb_url) ? form.thumb_url : "";
  const logo = isUrl(form.vendor_logo_url) ? form.vendor_logo_url : "";
  const inPerson = isInPersonFormat(form.format);

  return (
    <article className="previewCard">
      <div className={`previewThumb ${thumb ? "" : "previewThumbEmpty"}`}>
        {thumb && <img src={thumb} alt="" />}
        {form.mb2_exclusive && <span className="previewMb2Badge">{exclusiveLabel}</span>}
        {!form.is_published && <span className="previewDraftBadge">Draft</span>}
      </div>
      <div className="previewBody">
        <div className="previewMetaRow">
          {d && !isNaN(d.getTime()) && (
            <span className="previewBadge previewDateBadge">{formatDate(d)}</span>
          )}
          {form.ce_hours !== "" && form.ce_hours !== null && (
            <span className="previewBadge previewCeBadge">{form.ce_hours} CE</span>
          )}
          {form.format && (
            <span className="previewBadge previewFormatBadge">{form.format}</span>
          )}
          {logo && <img className="previewVendorLogo" src={logo} alt="" />}
        </div>
        <h3 className="previewTitle">{form.title || "Untitled event"}</h3>
        {form.description && (
          <p className="previewDesc">{form.description}</p>
        )}
        {form.roles?.length > 0 && (
          <div className="previewRoles">
            <span className="muted">Ideal for</span> {form.roles.join(", ")}
          </div>
        )}
        {inPerson && (form.location || form.session1_label) && (
          <div className="previewInPerson">
            {form.session1_label && <div><strong>Time</strong> {form.session1_label}</div>}
            {form.location && <div><strong>Location</strong> {form.location}</div>}
          </div>
        )}
        {(() => {
          const links = [];
          if (isUrl(form.session1_url)) {
            links.push({ url: form.session1_url, label: safe(form.session1_label) || "Session 1" });
          }
          if (isUrl(form.session2_url)) {
            links.push({ url: form.session2_url, label: safe(form.session2_label) || "Session 2" });
          }
          if (isUrl(form.in_person_registration_url)) {
            links.push({ url: form.in_person_registration_url, label: "In-person registration" });
          }
          if (links.length === 0) return null;
          if (links.length === 1) {
            return (
              <a
                className="previewRegister previewRegisterLink"
                href={links[0].url}
                target="_blank"
                rel="noopener noreferrer"
                title="Opens the registration link in a new tab"
              >
                Register
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ marginLeft: 6, verticalAlign: "-2px" }}>
                  <path d="M14 4h6v6M10 14L21 3M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            );
          }
          return (
            <div className="previewRegisterList">
              {links.map((l, i) => (
                <a
                  key={i}
                  className="previewRegisterRow"
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Opens in a new tab"
                >
                  <span className="previewRegisterLabel">{l.label}</span>
                  <span className="previewRegisterAction">
                    Register
                    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" style={{ marginLeft: 4, verticalAlign: "-1px" }}>
                      <path d="M14 4h6v6M10 14L21 3M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                </a>
              ))}
            </div>
          );
        })()}
      </div>
    </article>
  );
}
