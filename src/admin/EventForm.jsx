import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { AddVendorModal } from "./Vendors.jsx";
import { useClient } from "./AdminApp.jsx";

const BLANK = {
  title: "",
  description: "",
  event_date_part: "",          // yyyy-MM-dd for start
  event_time_part: "",          // HH:mm     for start (optional)
  event_timezone: "America/Chicago",
  event_end_date_part: "",      // yyyy-MM-dd for end (optional)
  event_end_time_part: "",      // HH:mm     for end (optional)
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
  discount_code: "",
  discount_description: "",
  mb2_exclusive: false,
  is_published: false,
};

const FORMATS = ["Webinar", "In-Person", "Hybrid", "Online"];

const pad = (n) => String(n).padStart(2, "0");

// US timezones — IANA names plus short labels for display
const US_TIMEZONES = [
  { id: "America/New_York",    label: "Eastern (ET)" },
  { id: "America/Chicago",     label: "Central (CT)" },
  { id: "America/Denver",      label: "Mountain (MT)" },
  { id: "America/Phoenix",     label: "Arizona (no DST)" },
  { id: "America/Los_Angeles", label: "Pacific (PT)" },
  { id: "America/Anchorage",   label: "Alaska (AKT)" },
  { id: "Pacific/Honolulu",    label: "Hawaii (HT)" },
];

// What GMT offset does ianaTz have on/around the given local date+time?
// Returns string like "-05:00" or "+05:30". Handles DST transitions.
const gmtOffsetForZone = (datePart, timePart, ianaTz) => {
  // Sample any moment "near" the target; we just need the offset that the
  // tz has on that day. Using the entered date+time as a UTC sample is fine.
  const sample = new Date(`${datePart}T${timePart || "00:00"}:00Z`);
  if (isNaN(sample.getTime())) return "+00:00";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaTz,
    timeZoneName: "longOffset",
  }).formatToParts(sample);
  const off = parts.find((p) => p.type === "timeZoneName")?.value || "";
  // off looks like "GMT-05:00" or "GMT" (== UTC). Normalize.
  if (off === "GMT") return "+00:00";
  return off.replace("GMT", "");
};

// Given Date + Time inputs in ianaTz, produce the correct UTC ISO timestamp.
const combineDateTime = (datePart, timePart, ianaTz) => {
  if (!datePart) return null;
  const t = timePart || "00:00";
  if (!ianaTz) {
    // Fall back to browser local
    const d = new Date(`${datePart}T${t}`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const offset = gmtOffsetForZone(datePart, t, ianaTz);
  const d = new Date(`${datePart}T${t}:00${offset}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// Given a UTC ISO timestamp + ianaTz, split into date + time parts as they
// would read locally in that tz.
const splitTimestamp = (iso, ianaTz) => {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "", time: "" };
  if (!ianaTz) {
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: h === "00" && m === "00" ? "" : `${h}:${m}`,
    };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaTz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  let hour = get("hour");
  if (hour === "24") hour = "00"; // Intl quirk in some browsers
  const minute = get("minute");
  // If the stored timestamp is exactly midnight, treat it as "no time was
  // entered" rather than 12:00 AM — the form shows blank instead of a
  // misleading default. (Events that are legitimately at midnight will
  // need to be re-entered, but that's a vanishingly rare case in dental CE.)
  const time = hour === "00" && minute === "00" ? "" : `${hour}:${minute}`;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time,
  };
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
  const [justSaved, setJustSaved] = useState(false);
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
        const tz = data.event_timezone || "America/Chicago";
        const { date, time } = splitTimestamp(data.event_date, tz);
        const end = splitTimestamp(data.event_end_date, tz);
        const next = {
          ...BLANK,
          ...data,
          event_date_part: date,
          event_time_part: time,
          event_end_date_part: end.date,
          event_end_time_part: end.time,
          event_timezone: tz,
          roles: Array.isArray(data.roles) ? data.roles : [],
        };
        delete next.event_date;
        delete next.event_end_date;
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

  // Warn before closing/navigating away with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      // Chrome requires returnValue; modern browsers ignore the message text.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

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
    const {
      event_date_part,
      event_time_part,
      event_end_date_part,
      event_end_time_part,
      ...rest
    } = form;
    const tz = form.event_timezone || "America/Chicago";
    const payload = {
      ...rest,
      ce_hours: form.ce_hours === "" || form.ce_hours == null ? null : Number(form.ce_hours),
      event_date: combineDateTime(event_date_part, event_time_part, tz),
      event_end_date: event_end_date_part
        ? combineDateTime(event_end_date_part, event_end_time_part, tz)
        : null,
      event_timezone: tz,
      roles: form.roles,
      client_id: currentClientId,
    };
    try {
      if (mode === "new") {
        const { data, error } = await supabase
          .from("events").insert(payload).select().single();
        if (error) throw error;
        // Navigate into the new event's edit page so the user keeps editing it
        navigate(`/admin/events/${data.id}`, { replace: true });
      } else {
        const { data, error } = await supabase
          .from("events").update(payload).eq("id", id).select().single();
        if (error) throw error;
        // Stay on page. Sync `original` so the form is no longer dirty,
        // and pop a transient "Saved" badge.
        const dtz = data.event_timezone || "America/Chicago";
        const { date, time } = splitTimestamp(data.event_date, dtz);
        const end = splitTimestamp(data.event_end_date, dtz);
        const next = {
          ...BLANK,
          ...data,
          event_date_part: date,
          event_time_part: time,
          event_end_date_part: end.date,
          event_end_time_part: end.time,
          event_timezone: dtz,
          roles: Array.isArray(data.roles) ? data.roles : [],
        };
        delete next.event_date;
        delete next.event_end_date;
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
      event_date: combineDateTime(form.event_date_part, form.event_time_part, form.event_timezone),
      event_end_date: form.event_end_date_part
        ? combineDateTime(form.event_end_date_part, form.event_end_time_part, form.event_timezone)
        : null,
      event_timezone: form.event_timezone || "America/Chicago",
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
      discount_code: form.discount_code || null,
      discount_description: form.discount_description || null,
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
              {justSaved
                ? <span className="evJustSaved">✓ Saved just now</span>
                : dirty
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

            {/* When — scheduling info on its own row */}
            <ScheduleBlock form={form} set={set} />


            {/* Details — pricing + accreditation on a second, looser row */}
            <div className="row2">
              <Field label="CE credits">
                <input
                  type="number" step="0.25" min="0"
                  value={form.ce_hours ?? ""}
                  onChange={(e) => set("ce_hours", e.target.value)}
                  placeholder=""
                />
              </Field>
              <Field label="Cost">
                <CostInput value={form.cost ?? ""} onChange={(v) => set("cost", v)} />
              </Field>
            </div>

            {/* Format on its own row — pills want room to breathe */}
            <Field label="Format">
              <PillSelector
                options={FORMATS}
                value={form.format ?? ""}
                onChange={(v) => set("format", v)}
              />
            </Field>

            {/* Category + Roles paired below */}
            <div className="rowCatRoles">
              <Field label="Category">
                <CategoryCombobox
                  value={form.category ?? ""}
                  onChange={(v) => set("category", v)}
                  suggestions={categorySuggestions}
                />
              </Field>
              <Field label="Roles" hint="Pick from the dropdown or type a new role.">
                <ChipInput
                  value={form.roles}
                  onChange={(next) => set("roles", next)}
                  suggestions={roleSuggestions}
                  placeholder=""
                  createLabel="role"
                />
              </Field>
            </div>

            {/* Optional discount code — shown on the catalog above Register */}
            <DiscountBlock form={form} set={set} />
          </Section>

          <Section title="Presenter" subtitle="Who's teaching this event.">
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

          <Section title="Online registration" subtitle="Where attendees register. Time is taken from the Time field above.">
            <Field label="Registration URL">
              <input
                value={form.session1_url ?? ""}
                onChange={(e) => set("session1_url", e.target.value)}
                placeholder=""
              />
            </Field>

            <SecondTimeSlot
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
                  placeholder=""
                />
              </Field>
              <Field label="In-person registration link">
                <input
                  value={form.in_person_registration_url ?? ""}
                  onChange={(e) => set("in_person_registration_url", e.target.value)}
                  placeholder=""
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

/* =====================================================================
   SCHEDULE BLOCK — start + (optional) end, with a single shared timezone.
   The end fields are collapsed by default behind a small "Add end" button
   so single-occurrence events aren't crowded by extra inputs. When set,
   the Starts → Ends pair shows a visual connector and a friendly
   duration summary ("Spans 3 days · 9 hours") so the admin can spot
   data-entry mistakes at a glance.
===================================================================== */
function ScheduleBlock({ form, set }) {
  const hasEnd = !!(form.event_end_date_part || form.event_end_time_part);
  const [showEnd, setShowEnd] = useState(hasEnd);

  // If the data behind the form changes (e.g. after edit-load), expand
  // the end row automatically so existing values are visible.
  useEffect(() => { if (hasEnd) setShowEnd(true); }, [hasEnd]);

  const hasStart = !!form.event_date_part;

  // Compute a human-readable duration when both ends are set.
  const summary = useMemo(() => {
    if (!form.event_date_part || !form.event_end_date_part) return "";
    const tz = form.event_timezone || "America/Chicago";
    const start = combineDateTime(form.event_date_part, form.event_time_part || "00:00", tz);
    const end = combineDateTime(form.event_end_date_part, form.event_end_time_part || "00:00", tz);
    if (!start || !end) return "";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms <= 0) return "ⓘ End is before start";
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((ms / (1000 * 60)) % 60);
    const parts = [];
    if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
    if (hours > 0) parts.push(`${hours} hr${hours === 1 ? "" : "s"}`);
    if (parts.length === 0 && mins > 0) parts.push(`${mins} min`);
    return parts.length ? `Spans ${parts.join(" · ")}` : "";
  }, [
    form.event_date_part,
    form.event_time_part,
    form.event_end_date_part,
    form.event_end_time_part,
    form.event_timezone,
  ]);

  const removeEnd = () => {
    set("event_end_date_part", "");
    set("event_end_time_part", "");
    setShowEnd(false);
  };

  return (
    <div className="schedBlock">
      <div className="schedHeader">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }}>
          <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
          <path d="M8 3v4M16 3v4M3 10h18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        Schedule
      </div>

      {/* STARTS row */}
      <div className="schedRow">
        <div className="schedRowSide">
          <span className="schedRowLabel">Starts</span>
          <span className="schedRowDot schedRowDotStart" aria-hidden="true" />
        </div>
        <div className="schedFields schedFields3">
          <Field label="Date">
            <input
              type="date"
              value={form.event_date_part ?? ""}
              onChange={(e) => {
                const next = e.target.value;
                set("event_date_part", next);
                if (!next) {
                  set("event_time_part", "");
                  set("event_end_date_part", "");
                  set("event_end_time_part", "");
                  setShowEnd(false);
                }
              }}
            />
          </Field>
          <Field label="Time" hint={hasStart ? "Optional" : "Set a date first"}>
            <input
              type="time"
              value={form.event_time_part ?? ""}
              onChange={(e) => set("event_time_part", e.target.value)}
              disabled={!hasStart}
            />
          </Field>
          <Field label="Timezone">
            <select
              value={form.event_timezone || "America/Chicago"}
              onChange={(e) => set("event_timezone", e.target.value)}
              disabled={!hasStart}
            >
              {US_TIMEZONES.map((tz) => (
                <option key={tz.id} value={tz.id}>{tz.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* CONNECTOR + ENDS row, or "add" button when collapsed */}
      {showEnd ? (
        <>
          <div className="schedConnector" aria-hidden="true">
            <span className="schedConnectorLine" />
            {summary && <span className={`schedSummary ${summary.startsWith("ⓘ") ? "schedSummaryErr" : ""}`}>{summary}</span>}
          </div>
          <div className="schedRow">
            <div className="schedRowSide">
              <span className="schedRowLabel">Ends</span>
              <span className="schedRowDot schedRowDotEnd" aria-hidden="true" />
            </div>
            <div className="schedFields schedFields2">
              <Field label="Date">
                <input
                  type="date"
                  value={form.event_end_date_part ?? ""}
                  onChange={(e) => {
                    const next = e.target.value;
                    set("event_end_date_part", next);
                    if (!next) set("event_end_time_part", "");
                  }}
                  min={form.event_date_part || undefined}
                  disabled={!hasStart}
                />
              </Field>
              <Field label="Time" hint="Optional">
                <input
                  type="time"
                  value={form.event_end_time_part ?? ""}
                  onChange={(e) => set("event_end_time_part", e.target.value)}
                  disabled={!hasStart}
                />
              </Field>
              <div className="schedEndActions">
                <button
                  type="button"
                  className="schedRemoveBtn"
                  onClick={removeEnd}
                  title="Remove end date/time"
                  aria-label="Remove end date/time"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="schedAddEndBtn"
          onClick={() => setShowEnd(true)}
          disabled={!hasStart}
        >
          + Add end date/time
        </button>
      )}
    </div>
  );
}

/* =====================================================================
   DISCOUNT BLOCK — optional code + description. Collapsed by default
   behind a small "Add discount code" link. Existing data auto-expands.
===================================================================== */
function DiscountBlock({ form, set }) {
  const hasDiscount = !!(form.discount_code || form.discount_description);
  const [show, setShow] = useState(hasDiscount);
  useEffect(() => { if (hasDiscount) setShow(true); }, [hasDiscount]);

  if (!show) {
    return (
      <button
        type="button"
        className="discountAddBtn"
        onClick={() => setShow(true)}
      >
        + Add a discount code
      </button>
    );
  }

  const remove = () => {
    set("discount_code", "");
    set("discount_description", "");
    setShow(false);
  };

  return (
    <div className="discountBlock">
      <div className="discountHeader">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }}>
          <path d="M9 4l11 11-7 7L2 11V4h7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
          <circle cx="7" cy="9" r="1.5" fill="currentColor"/>
        </svg>
        Discount (optional)
        <button
          type="button"
          className="discountRemoveBtn"
          onClick={remove}
          title="Remove discount"
          aria-label="Remove discount"
        >
          ×
        </button>
      </div>
      <div className="discountFields">
        <Field label="Code" hint="What attendees type at checkout">
          <input
            value={form.discount_code ?? ""}
            onChange={(e) => set("discount_code", e.target.value)}
            placeholder=""
            style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: "0.05em", textTransform: "uppercase" }}
          />
        </Field>
        <Field label="Description" hint="Short explanation of the savings">
          <input
            value={form.discount_description ?? ""}
            onChange={(e) => set("discount_description", e.target.value)}
            placeholder=""
          />
        </Field>
      </div>
    </div>
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
        placeholder=""
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

function ChipInput({ value, onChange, placeholder, suggestions = [], createLabel = "item" }) {
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
              <span className="vendorComboName">Create new {createLabel}: <strong>{draft.trim()}</strong></span>
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
        placeholder=""
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
          placeholder=""
          value={url ?? ""}
          onChange={(e) => onUrlChange(e.target.value)}
        />
      )}
    </div>
  );
}

function SessionRow({ n, label, url, onLabel, onUrl, hideLabel = false }) {
  return (
    <div className="evSessionRow" style={hideLabel ? { gridTemplateColumns: "32px 1fr" } : undefined}>
      <span className="evSessionN">{n}</span>
      {!hideLabel && (
        <input
          className="evSessionLabel"
          value={label ?? ""}
          onChange={(e) => onLabel(e.target.value)}
          placeholder=""
        />
      )}
      <input
        className="evSessionUrl"
        value={url ?? ""}
        onChange={(e) => onUrl(e.target.value)}
        placeholder=""
      />
    </div>
  );
}

/* =====================================================================
   SECOND TIME SLOT — collapsed by default, expands into a clear
   "additional session" block with explicit Time + Registration URL
   fields so it's obvious what each input does.
===================================================================== */
function SecondTimeSlot({ label, url, onLabel, onUrl }) {
  const hasValue = !!(label || url);
  const [expanded, setExpanded] = useState(hasValue);

  // If parent props change to have a value (e.g. on edit load), open.
  useEffect(() => {
    if (hasValue) setExpanded(true);
  }, [hasValue]);

  if (!expanded) {
    return (
      <button
        type="button"
        className="evSecondSlotAdd"
        onClick={() => setExpanded(true)}
      >
        + Add another time slot
      </button>
    );
  }

  return (
    <div className="evSecondSlot">
      <div className="evSecondSlotHeader">
        <span className="evSecondSlotTitle">Additional time slot</span>
        <button
          type="button"
          className="evSecondSlotRemove"
          onClick={() => {
            onLabel("");
            onUrl("");
            setExpanded(false);
          }}
        >
          Remove
        </button>
      </div>
      <div className="evSecondSlotGrid">
        <Field label="Time for this session">
          <input
            value={label ?? ""}
            onChange={(e) => onLabel(e.target.value)}
            placeholder=""
          />
        </Field>
        <Field label="Registration URL for this session">
          <input
            value={url ?? ""}
            onChange={(e) => onUrl(e.target.value)}
            placeholder=""
          />
        </Field>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Only fill this in if the same event runs at a second time with its own
        registration link. Most events only need the one above.
      </p>
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
  // Reconstruct a Date from the split parts for preview purposes
  const dIso = combineDateTime(form.event_date_part, form.event_time_part);
  const d = dIso ? new Date(dIso) : null;
  const thumb = isUrl(form.thumb_url) ? form.thumb_url : "";
  const logo = isUrl(form.vendor_logo_url) ? form.vendor_logo_url : "";
  const inPerson = isInPersonFormat(form.format);

  return (
    <article className="previewCard">
      <div className={`previewThumb ${thumb ? "" : "previewThumbEmpty"}`}>
        {thumb && <img src={thumb} alt="" />}
        {form.mb2_exclusive && <span className="previewMb2Badge">Exclusive</span>}
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
          const trim = (v) => (typeof v === "string" ? v.trim() : "");
          const links = [];
          if (isUrl(form.session1_url)) {
            links.push({ url: form.session1_url, label: trim(form.session1_label) || "Session 1" });
          }
          if (isUrl(form.session2_url)) {
            links.push({ url: form.session2_url, label: trim(form.session2_label) || "Session 2" });
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
