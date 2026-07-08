import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import "./admin.css";

const BLANK = {
  title: "",
  type: "Course",
  description: "",
  thumbnail_url: "",
  course_url: "",
  ce_hours: "",
  categories: [],
  sort_order: 0,
  is_published: false,
};

const COURSE_TYPES = ["Course", "Learning Path"];

// Starting category taxonomy for on-demand courses. Custom categories
// added by super admins get merged with these at edit time; the fixed
// list here just gives every course a consistent starting palette.
const PRESET_CATEGORIES = [
  "Regulatory Compliance and Safety",
  "Clinical Excellence and Medical Knowledge",
  "Front Office",
  "Leadership and Practice Management",
  "Professional Development",
];

export default function OnDemandForm({ mode = "edit" }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(BLANK);
  const [original, setOriginal] = useState(BLANK);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const thumbInput = useRef(null);

  useEffect(() => {
    if (mode !== "edit") { setOriginal(BLANK); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("on_demand_courses")
        .select("*")
        .eq("id", id)
        .single();
      if (cancelled) return;
      if (error) setError(error.message);
      else if (data) {
        const next = { ...BLANK, ...data };
        setForm(next);
        setOriginal(next);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mode, id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(original), [form, original]);

  // Warn on close if dirty
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const uploadThumb = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `on-demand-thumbs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("event-images")
        .upload(path, file, { cacheControl: "31536000", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("event-images").getPublicUrl(path);
      set("thumbnail_url", pub.publicUrl);
    } catch (e) {
      alert("Upload failed: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!form.title.trim()) { setError("Course title is required."); return; }
    setSaving(true);
    setError("");
    const payload = {
      title: form.title.trim(),
      type: form.type || "Course",
      description: form.description || null,
      thumbnail_url: form.thumbnail_url || null,
      course_url: form.course_url || null,
      ce_hours: form.ce_hours === "" || form.ce_hours == null ? null : Number(form.ce_hours),
      categories: Array.isArray(form.categories) ? form.categories : [],
      sort_order: Number(form.sort_order) || 0,
      is_published: !!form.is_published,
    };
    try {
      if (mode === "new") {
        const { data, error } = await supabase
          .from("on_demand_courses").insert(payload).select().single();
        if (error) throw error;
        navigate(`/admin/on-demand/${data.id}`, { replace: true });
      } else {
        const { data, error } = await supabase
          .from("on_demand_courses").update(payload).eq("id", id).select().single();
        if (error) throw error;
        const next = { ...BLANK, ...data };
        setForm(next);
        setOriginal(next);
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2500);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (mode !== "edit") return;
    if (!confirm(`Delete "${form.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("on_demand_courses").delete().eq("id", id);
    if (error) return alert("Delete failed: " + error.message);
    navigate("/admin/on-demand");
  };

  const cancel = () => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    navigate("/admin/on-demand");
  };

  if (loading) {
    return <div className="formLoading"><div className="spinner" /> Loading course…</div>;
  }

  return (
    <div className="evForm">
      {/* Sticky top action bar */}
      <div className="evToolbar">
        <div className="evToolbarLeft">
          <Link to="/admin/on-demand" className="evBack" aria-label="Back to courses">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Courses
          </Link>
          <div>
            <h2 className="evTitle">{mode === "new" ? "New course" : "Edit course"}</h2>
            {mode === "edit" && (
              <p className="evTitleMeta">
                {justSaved ? "✓ Saved" : dirty ? "Unsaved changes" : "All changes saved"}
              </p>
            )}
          </div>
        </div>
        <div className="evToolbarRight">
          <label className={`evSwitch evSwitch-success ${form.is_published ? "on" : ""}`}>
            <input
              type="checkbox"
              checked={!!form.is_published}
              onChange={(e) => set("is_published", e.target.checked)}
            />
            <span className="evSwitchSlider" />
            <span className="evSwitchLabel">Published</span>
          </label>
          <button type="button" className="ghostBtn" onClick={cancel}>Cancel</button>
          <button
            type="button"
            className="primaryBtn"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="evBody" style={{ gridTemplateColumns: "1fr 380px" }}>
        <div>
          <Section title="Course details" subtitle="What visitors see on the catalog.">
            <Field label="Title *">
              <input
                autoFocus={mode === "new"}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder=""
              />
            </Field>

            <Field label="Type">
              <div className="evPills" role="radiogroup">
                {COURSE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={form.type === t}
                    className={`evPill ${form.type === t ? "active" : ""}`}
                    onClick={() => set("type", t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="CE credits" hint="Optional · e.g. 1 or 1.5. Shown on the catalog card in place of 'Available anytime'.">
              <input
                type="number"
                step="0.25"
                min="0"
                value={form.ce_hours ?? ""}
                onChange={(e) => set("ce_hours", e.target.value)}
                placeholder="e.g. 1.5"
                style={{ maxWidth: 200 }}
              />
            </Field>

            <Field label="Description">
              <textarea
                rows={4}
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder=""
              />
            </Field>

            <Field
              label="Categories"
              hint="Pick one or more categories. Click Add custom to create a new tag not in the list."
            >
              <CategoryPicker
                value={Array.isArray(form.categories) ? form.categories : []}
                onChange={(next) => set("categories", next)}
              />
            </Field>
          </Section>

          <Section title="Thumbnail" subtitle="The image visitors see in the catalog grid.">
            <ThumbnailDropZone
              url={form.thumbnail_url}
              uploading={uploading}
              onUpload={uploadThumb}
              onClear={() => set("thumbnail_url", "")}
              onUrlChange={(v) => set("thumbnail_url", v)}
              fileRef={thumbInput}
            />
          </Section>

          <Section title="Course link" subtitle="Where visitors go when they click the card or Go To Course button.">
            <Field label="Course URL">
              <input
                value={form.course_url ?? ""}
                onChange={(e) => set("course_url", e.target.value)}
                placeholder=""
              />
            </Field>
          </Section>

          <Section title="Ordering" subtitle="Controls how courses appear on the public catalog.">
            <Field label="Sort order" hint="Lower numbers appear first">
              <input
                type="number"
                value={form.sort_order ?? 0}
                onChange={(e) => set("sort_order", e.target.value)}
                style={{ maxWidth: 140 }}
              />
            </Field>
          </Section>

          {mode === "edit" && (
            <Section title="Danger zone" subtitle="Permanent actions." tone="danger">
              <div className="dangerRow">
                <div>
                  <strong>Delete this course</strong>
                  <p className="muted">Removes it from the database. Cannot be undone.</p>
                </div>
                <button type="button" className="ghostBtn danger" onClick={remove}>
                  Delete course
                </button>
              </div>
            </Section>
          )}

          {error && <p className="errMsg" style={{ marginTop: 12 }}>{error}</p>}
        </div>

        {/* Live preview column */}
        <aside className="evPreview">
          <div className="evPreviewLabel">LIVE PREVIEW</div>
          <PreviewCard course={form} />
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            This is what visitors will see on the public catalog.
          </p>
        </aside>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function Section({ title, subtitle, children, tone }) {
  return (
    <section className={`evSection ${tone === "danger" ? "evSectionDanger" : ""}`}>
      <div className="evSectionHead">
        <h3 className="evSectionTitle">{title}</h3>
        {subtitle && <p className="evSectionSubtitle">{subtitle}</p>}
      </div>
      <div className="evSectionBody">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="fieldLabel">{label}</span>
      {children}
      {hint && <span className="fieldHint muted">{hint}</span>}
    </label>
  );
}

/* Multi-select category chip picker. Shows the 5 preset categories PLUS
   any custom values already saved on the course. A little "+ Add custom"
   button opens a text field so super admins can invent new categories
   on the fly. Value is a string[] managed by the parent form. */
function CategoryPicker({ value, onChange }) {
  const [addingCustom, setAddingCustom] = useState(false);
  const [customText, setCustomText] = useState("");
  const selected = Array.isArray(value) ? value : [];

  // Merge presets with any already-saved values so custom tags render too.
  const merged = [...new Set([...PRESET_CATEGORIES, ...selected])];

  const toggle = (cat) => {
    if (selected.includes(cat)) {
      onChange(selected.filter((c) => c !== cat));
    } else {
      onChange([...selected, cat]);
    }
  };
  const commitCustom = () => {
    const v = customText.trim();
    if (!v) { setAddingCustom(false); setCustomText(""); return; }
    if (!selected.includes(v)) onChange([...selected, v]);
    setCustomText("");
    setAddingCustom(false);
  };

  return (
    <div className="odCatPicker">
      <div className="odCatChips">
        {merged.map((cat) => {
          const active = selected.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              className={`odCatChip ${active ? "active" : ""}`}
              onClick={() => toggle(cat)}
              aria-pressed={active}
            >
              {active && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ marginRight: 4 }}>
                  <path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {cat}
            </button>
          );
        })}
      </div>
      {addingCustom ? (
        <div className="odCatCustomRow">
          <input
            className="odCatCustomInput"
            type="text"
            autoFocus
            value={customText}
            placeholder="New category name"
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitCustom(); }
              if (e.key === "Escape") { setAddingCustom(false); setCustomText(""); }
            }}
          />
          <button type="button" className="primaryBtn" onClick={commitCustom}>Add</button>
          <button
            type="button"
            className="ghostBtn"
            onClick={() => { setAddingCustom(false); setCustomText(""); }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="odCatAddCustom"
          onClick={() => setAddingCustom(true)}
        >
          + Add custom category
        </button>
      )}
    </div>
  );
}

function ThumbnailDropZone({ url, uploading, onUpload, onClear, onUrlChange, fileRef }) {
  const [dragOver, setDragOver] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  return (
    <div className={`evThumbDrop ${url ? "hasImage" : ""} ${dragOver ? "dragOver" : ""}`}>
      {url ? (
        <div className="evThumbPreview">
          <img src={url} alt="Thumbnail preview" />
        </div>
      ) : (
        <div
          className="evThumbDropZone"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onUpload(file);
          }}
          onClick={() => fileRef.current?.click()}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="#94a3b8" strokeWidth="2"/>
            <circle cx="9" cy="11" r="1.5" fill="#94a3b8"/>
            <path d="M21 17l-5-5-9 9" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="evThumbDropText">
            <strong>Drop an image or click to upload</strong>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Recommended: 780 × 340 pixels
            </div>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => onUpload(e.target.files?.[0])}
      />
      <div className="evThumbActions">
        {url && (
          <button type="button" className="ghostBtn danger" onClick={onClear}>Remove image</button>
        )}
        <button type="button" className="evLinkBtn" onClick={() => setShowUrl((s) => !s)}>
          {showUrl ? "Hide URL field" : "Use image URL instead"}
        </button>
        {uploading && <span className="muted">Uploading…</span>}
      </div>

      {showUrl && (
        <input
          className="urlInput"
          placeholder=""
          value={url ?? ""}
          onChange={(e) => onUrlChange(e.target.value)}
        />
      )}
    </div>
  );
}

function PreviewCard({ course }) {
  const thumbOk = /^https?:\/\//.test(course.thumbnail_url || "");
  const canRegister = /^https?:\/\//.test(course.course_url || "");
  const ce =
    course.ce_hours === "" || course.ce_hours == null
      ? null
      : Number(course.ce_hours);
  const ceOk = ce != null && !Number.isNaN(ce);

  return (
    <article className="card cardElevated evPreviewCard odCard">
      <div className={`thumb odThumb ${thumbOk ? "" : "thumbNoImg"}`}>
        {thumbOk ? (
          <img src={course.thumbnail_url} alt="" />
        ) : (
          <div className="thumbPlaceholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="#cbd5e1" strokeWidth="2"/>
              <circle cx="9" cy="11" r="1.5" fill="#cbd5e1"/>
              <path d="M21 17l-5-5-9 9" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>
      <div className="body">
        <h3 className="title">{course.title || "Untitled course"}</h3>
        {course.description ? (
          <p className="descFull">{course.description}</p>
        ) : null}
        <div className="sessions">
          <div className="sessionGroup">
            <div className="session odSessionRow">
              {ceOk ? (
                <span className="odCredit" aria-label={`${ce} CE ${ce === 1 ? "credit" : "credits"}`}>
                  <svg className="odCreditIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.12"/>
                    <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="odCreditText">
                    <strong>{ce}</strong> CE Credit{ce === 1 ? "" : "s"}
                  </span>
                </span>
              ) : (
                <span className="odCreditFallback">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                    <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Available anytime</span>
                </span>
              )}
              {canRegister ? (
                <a
                  className="sessionBtn odCardCta"
                  href={course.course_url}
                  target="_blank"
                  rel="noopener"
                  onClick={(e) => {
                    if (!confirm("Open the course URL in a new tab?")) e.preventDefault();
                  }}
                >
                  Go To Course →
                </a>
              ) : (
                <span className="muted" style={{ fontSize: 13 }}>Course link not set</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
