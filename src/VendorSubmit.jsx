import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "./lib/supabase.js";
import "./vendor-submit.css";

/* ============================================================
   PUBLIC vendor submission page.
     /submit-course          → MB2 (default)
     /submit-course/:slug    → a specific client, e.g. /submit-course/acme
   Vendors can submit a LIVE EVENT (webinar, in-person, hybrid)
   or an ON-DEMAND COURSE. Either way the submission lands as an
   UNPUBLISHED draft, stamped with the client whose link was used,
   for the MB2 Shield team to review and publish.
   ============================================================ */

const ROLES = [
  "Assistants",
  "Hygienist",
  "Front Office",
  "Treatment Coordinators",
  "Dentist",
  "Leadership & Management",
];

const FORMATS = ["Webinar", "In-Person", "Hybrid", "Online"];

const OPEN_TO_OPTIONS = [
  "The public",
  "MB2 Only",
  "MB2 & Carabelli Club",
  "Carabelli Club Only",
];

const TIMEZONES = [
  { id: "America/New_York",    label: "Eastern (ET)" },
  { id: "America/Chicago",     label: "Central (CT)" },
  { id: "America/Denver",      label: "Mountain (MT)" },
  { id: "America/Phoenix",     label: "Arizona (no DST)" },
  { id: "America/Los_Angeles", label: "Pacific (PT)" },
  { id: "America/Anchorage",   label: "Alaska (AKT)" },
  { id: "Pacific/Honolulu",    label: "Hawaii (HT)" },
];

export default function VendorSubmit() {
  const { slug } = useParams();
  const effectiveSlug = (slug || "mb2").toLowerCase();
  const [client, setClient] = useState(null);
  const [clientLoading, setClientLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [kind, setKind] = useState("event"); // 'event' | 'course'
  const [form, setForm] = useState({
    vendor: "",
    contact_first: "",
    contact_last: "",
    contact_email: "",
    phone: "",
    title: "",
    description: "",
    speaker: "",
    ce_hours: "",
    cost: "FREE",
    course_url: "",
    reg_email: "",
    ideal_date: "",
    highlights: "",
    open_to: "The public",
    // Live-event details
    start_date: "",
    start_time: "",
    end_date: "",
    end_time: "",
    timezone: "America/Chicago",
    format: "Webinar",
    location: "",
    discount_code: "",
    discount_description: "",
    categories: [],
    roles: [],
    website: "", // honeypot — real people never fill this
  });
  const [flyerFile, setFlyerFile] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [thumbFile, setThumbFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const topRef = useRef(null);

  useEffect(() => {
    supabase
      .from("on_demand_categories")
      .select("name")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .then(({ data }) => setCategories((data || []).map((r) => r.name)));
  }, []);

  // Resolve the client this submission link belongs to.
  useEffect(() => {
    let cancelled = false;
    setClientLoading(true);
    supabase
      .from("clients")
      .select("id, name, slug, logo_url")
      .eq("slug", effectiveSlug)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setClient(data || null);
        setClientLoading(false);
      });
    return () => { cancelled = true; };
  }, [effectiveSlug]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleIn = (k, value) =>
    setForm((f) => ({
      ...f,
      [k]: f[k].includes(value) ? f[k].filter((x) => x !== value) : [...f[k], value],
    }));

  // Live events have ONE category — behave like a radio group.
  const pickCategory = (value) =>
    setForm((f) => {
      if (kind === "event") {
        return { ...f, categories: f.categories[0] === value ? [] : [value] };
      }
      return {
        ...f,
        categories: f.categories.includes(value)
          ? f.categories.filter((x) => x !== value)
          : [...f.categories, value],
      };
    });

  const switchKind = (next) => {
    setKind(next);
    setError("");
    // Events are single-category — keep just the first pick when switching.
    if (next === "event") {
      setForm((f) => ({ ...f, categories: f.categories.slice(0, 1) }));
    }
  };

  const uploadFile = async (file, label) => {
    if (!file) return "";
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${cleanName}`;
    const { error: upErr } = await supabase.storage
      .from("vendor-submissions")
      .upload(path, file, { cacheControl: "31536000", upsert: false });
    if (upErr) throw new Error(`${label} upload failed: ${upErr.message}`);
    const { data } = supabase.storage.from("vendor-submissions").getPublicUrl(path);
    return data.publicUrl;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    // Honeypot: bots fill every field — real people never see this one.
    if (form.website.trim() !== "") return;

    const isEvent = kind === "event";
    const hasUrl = /^https?:\/\//i.test(form.course_url.trim());
    const hasRegEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.reg_email.trim());

    if (!form.vendor.trim()) return setError("Please enter your company name.");
    if (!form.contact_first.trim() || !form.contact_last.trim())
      return setError("Please enter your first and last name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim()))
      return setError("Please enter a valid email address.");
    if (!form.title.trim())
      return setError(isEvent ? "Please enter the event title." : "Please enter the course title.");
    if (!form.description.trim()) return setError("Please enter a description.");
    if (isEvent) {
      if (!form.start_date) return setError("Please enter the event date.");
      if (!hasUrl && !hasRegEmail)
        return setError("Please provide a registration link (starting with https://) or a registration email.");
      if (form.course_url.trim() && !hasUrl)
        return setError("Please enter the full registration link, starting with https://");
    } else {
      if (!hasUrl)
        return setError("Please enter the full course link, starting with https://");
    }
    if (!flyerFile) return setError("Please attach your flyer (PDF).");

    setSubmitting(true);
    try {
      const [flyerUrl, logoUrl, thumbUrl] = [
        await uploadFile(flyerFile, "Flyer"),
        await uploadFile(logoFile, "Logo"),
        await uploadFile(thumbFile, "Thumbnail"),
      ];

      let description = form.description.trim();
      if (form.speaker.trim()) {
        description += `\n\nPresented by ${form.speaker.trim()}.`;
      }

      const notes = [
        `Open to: ${form.open_to}`,
        form.phone.trim() && `Phone: ${form.phone.trim()}`,
        form.speaker.trim() && `Speaker: ${form.speaker.trim()}`,
        !isEvent && form.ideal_date && `Ideal post date: ${form.ideal_date}`,
        form.highlights.trim() && `Highlights / promo codes: ${form.highlights.trim()}`,
        logoUrl && `Company logo: ${logoUrl}`,
      ]
        .filter(Boolean)
        .join("\n");

      const common = {
        client_slug: effectiveSlug,
        vendor: form.vendor.trim(),
        contact_name: `${form.contact_first.trim()} ${form.contact_last.trim()}`,
        contact_email: form.contact_email.trim(),
        title: form.title.trim(),
        description,
        ce_hours: form.ce_hours,
        cost: form.cost,
        roles: form.roles,
        thumbnail_url: thumbUrl,
        flyer_url: flyerUrl,
        logo_url: logoUrl,
        notes,
      };

      let rpcName, payload;
      if (isEvent) {
        rpcName = "submit_vendor_event";
        payload = {
          ...common,
          category: form.categories[0] || "",
          format: form.format,
          location: form.location.trim(),
          start_date: form.start_date,
          start_time: form.start_time,
          end_date: form.end_date,
          end_time: form.end_time,
          timezone: form.timezone,
          registration_url: form.course_url.trim(),
          registration_email: form.reg_email.trim(),
          discount_code: form.discount_code.trim(),
          discount_description: form.discount_description.trim(),
        };
      } else {
        rpcName = "submit_vendor_course";
        payload = {
          ...common,
          categories: form.categories,
          course_url: form.course_url.trim(),
        };
      }

      const { data, error: rpcErr } = await supabase.rpc(rpcName, { p: payload });
      if (rpcErr) throw rpcErr;
      if (!data) throw new Error("Submission failed — please try again.");
      setDone(true);
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      setError(err?.message || "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (clientLoading) {
    return (
      <div className="vsPage" ref={topRef}>
        <div className="vsCard vsThanks">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="vsPage" ref={topRef}>
        <div className="vsCard vsThanks">
          <h1>This link isn't valid</h1>
          <p>
            This submission link doesn't match an active catalog.
            Please double-check the link you were given, or contact the
            team that sent it to you for an updated one.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="vsPage" ref={topRef}>
        <div className="vsCard vsThanks">
          <div className="vsThanksIcon" aria-hidden="true">✓</div>
          <h1>Thank you!</h1>
          <p>
            Your {kind === "event" ? "event" : "course"} has been submitted to
            the MB2 Shield education team. We'll review it and reach out to{" "}
            <strong>{form.contact_email}</strong> if we have any questions.
            Once approved, it will appear on the catalog.
          </p>
          <button
            type="button"
            className="vsPrimaryBtn"
            onClick={() => window.location.reload()}
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  const isEvent = kind === "event";
  const needsLocation = form.format === "In-Person" || form.format === "Hybrid";

  return (
    <div className="vsPage" ref={topRef}>
      <div className="vsCard">
        <div className="vsHeader">
          {client.logo_url && (
            <img
              className="vsBrandLogo"
              src={client.logo_url}
              alt={`${client.name} logo`}
            />
          )}
          <span className="vsBrandTag">{client.name} · MB2 Shield Education</span>
          <h1>Submit a CE Event or Course</h1>
          <p>
            Partner with {client.name} to feature your live CE event or
            on-demand course on the MB2 Shield catalog. Fill out the details
            below — our education team reviews every submission before it's
            published.
          </p>
        </div>

        <form onSubmit={submit} noValidate>
          <h2 className="vsSectionTitle">What are you submitting?</h2>
          <div className="vsKindRow" role="radiogroup" aria-label="Submission type">
            <button
              type="button"
              role="radio"
              aria-checked={isEvent}
              className={`vsKind ${isEvent ? "on" : ""}`}
              onClick={() => switchKind("event")}
            >
              <strong>Live event</strong>
              <span>Webinar, in-person, or hybrid on a specific date</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!isEvent}
              className={`vsKind ${!isEvent ? "on" : ""}`}
              onClick={() => switchKind("course")}
            >
              <strong>On-demand course</strong>
              <span>Recorded content available anytime</span>
            </button>
          </div>

          <h2 className="vsSectionTitle">Your information</h2>
          <div className="vsRow">
            <label className="vsField">
              <span>Company / vendor name *</span>
              <input value={form.vendor} onChange={(e) => set("vendor", e.target.value)} />
            </label>
          </div>
          <div className="vsRow vsRow2">
            <label className="vsField">
              <span>First name *</span>
              <input value={form.contact_first} onChange={(e) => set("contact_first", e.target.value)} />
            </label>
            <label className="vsField">
              <span>Last name *</span>
              <input value={form.contact_last} onChange={(e) => set("contact_last", e.target.value)} />
            </label>
          </div>
          <div className="vsRow vsRow2">
            <label className="vsField">
              <span>Email *</span>
              <input type="email" placeholder="you@company.com" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
            </label>
            <label className="vsField">
              <span>Phone</span>
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </label>
          </div>

          <h2 className="vsSectionTitle">{isEvent ? "Event details" : "Course details"}</h2>
          <div className="vsRow">
            <label className="vsField">
              <span>{isEvent ? "Event title *" : "Course title *"}</span>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} />
            </label>
          </div>
          <div className="vsRow">
            <label className="vsField">
              <span>Description *</span>
              <textarea
                rows={5}
                placeholder="What will attendees learn? 2–4 sentences works best."
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </label>
          </div>
          <div className="vsRow vsRow2">
            <label className="vsField">
              <span>Speaker / presenter &amp; credentials</span>
              <input placeholder="e.g. Jane Smith, DDS" value={form.speaker} onChange={(e) => set("speaker", e.target.value)} />
            </label>
            <label className="vsField">
              <span>CE credits</span>
              <input type="number" step="0.25" min="0" placeholder="Leave blank if no CE" value={form.ce_hours} onChange={(e) => set("ce_hours", e.target.value)} />
            </label>
          </div>
          <div className="vsRow">
            <label className="vsField">
              <span>This {isEvent ? "event" : "course"} is open to *</span>
              <select value={form.open_to} onChange={(e) => set("open_to", e.target.value)}>
                {OPEN_TO_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
          </div>

          {isEvent && (
            <>
              <div className="vsRow vsRow2">
                <label className="vsField">
                  <span>Event date *</span>
                  <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
                </label>
                <label className="vsField">
                  <span>Start time</span>
                  <input type="time" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} />
                </label>
              </div>
              <div className="vsRow vsRow2">
                <label className="vsField">
                  <span>Time zone</span>
                  <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                    {TIMEZONES.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label className="vsField">
                  <span>Format</span>
                  <select value={form.format} onChange={(e) => set("format", e.target.value)}>
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="vsRow vsRow2">
                <label className="vsField">
                  <span>End date <em>(multi-day events)</em></span>
                  <input type="date" min={form.start_date || undefined} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
                </label>
                <label className="vsField">
                  <span>End time</span>
                  <input type="time" value={form.end_time} onChange={(e) => set("end_time", e.target.value)} />
                </label>
              </div>
              {needsLocation && (
                <div className="vsRow">
                  <label className="vsField">
                    <span>Location <em>(venue, city, state)</em></span>
                    <input placeholder="e.g. Omni Hotel, Dallas, TX" value={form.location} onChange={(e) => set("location", e.target.value)} />
                  </label>
                </div>
              )}
              <div className="vsRow vsRow2">
                <label className="vsField">
                  <span>Registration link *</span>
                  <input type="url" placeholder="https://…" value={form.course_url} onChange={(e) => set("course_url", e.target.value)} />
                </label>
                <label className="vsField">
                  <span>…or registration email</span>
                  <input type="email" placeholder="events@company.com" value={form.reg_email} onChange={(e) => set("reg_email", e.target.value)} />
                </label>
              </div>
              <div className="vsRow vsRow2">
                <label className="vsField">
                  <span>Cost to attendees</span>
                  <input placeholder='e.g. FREE or $99' value={form.cost} onChange={(e) => set("cost", e.target.value)} />
                </label>
                <label className="vsField">
                  <span>Discount code <em>(optional)</em></span>
                  <input placeholder="e.g. MB2SAVE20" value={form.discount_code} onChange={(e) => set("discount_code", e.target.value)} />
                </label>
              </div>
              {form.discount_code.trim() && (
                <div className="vsRow">
                  <label className="vsField">
                    <span>What does the discount give?</span>
                    <input placeholder="e.g. 20% off registration for MB2 offices" value={form.discount_description} onChange={(e) => set("discount_description", e.target.value)} />
                  </label>
                </div>
              )}
            </>
          )}

          {!isEvent && (
            <>
              <div className="vsRow vsRow2">
                <label className="vsField">
                  <span>Cost to attendees</span>
                  <input placeholder='e.g. FREE or $99' value={form.cost} onChange={(e) => set("cost", e.target.value)} />
                </label>
                <label className="vsField">
                  <span>Ideal post date</span>
                  <input type="date" value={form.ideal_date} onChange={(e) => set("ideal_date", e.target.value)} />
                </label>
              </div>
              <div className="vsRow">
                <label className="vsField">
                  <span>Course / registration link *</span>
                  <input type="url" placeholder="https://…" value={form.course_url} onChange={(e) => set("course_url", e.target.value)} />
                </label>
              </div>
            </>
          )}

          <div className="vsRow">
            <label className="vsField">
              <span>Important highlights or promo codes</span>
              <textarea rows={2} placeholder="Anything the MB2 team should know or feature." value={form.highlights} onChange={(e) => set("highlights", e.target.value)} />
            </label>
          </div>

          <h2 className="vsSectionTitle">Who is this for?</h2>
          <div className="vsChecks">
            {ROLES.map((r) => (
              <label key={r} className={`vsCheck ${form.roles.includes(r) ? "on" : ""}`}>
                <input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleIn("roles", r)} />
                {r}
              </label>
            ))}
          </div>

          {categories.length > 0 && (
            <>
              <h2 className="vsSectionTitle">
                {isEvent ? "Event category (pick one)" : "Course categories"}
              </h2>
              <div className="vsChecks">
                {categories.map((c) => (
                  <label key={c} className={`vsCheck ${form.categories.includes(c) ? "on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={form.categories.includes(c)}
                      onChange={() => pickCategory(c)}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </>
          )}

          <h2 className="vsSectionTitle">Files</h2>
          <div className="vsRow">
            <label className="vsField">
              <span>{isEvent ? "Event flyer (PDF) *" : "Course flyer (PDF) *"}</span>
              <input type="file" accept="application/pdf" onChange={(e) => setFlyerFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div className="vsRow vsRow2">
            <label className="vsField">
              <span>High-resolution company logo</span>
              <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
            </label>
            <label className="vsField">
              <span>Catalog thumbnail image <em>(780 × 340 recommended)</em></span>
              <input type="file" accept="image/*" onChange={(e) => setThumbFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          {/* Honeypot — hidden from real users */}
          <label className="vsHoney" aria-hidden="true">
            Should be empty
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} />
          </label>

          {error && <p className="vsError">{error}</p>}

          <button type="submit" className="vsPrimaryBtn vsSubmit" disabled={submitting}>
            {submitting
              ? "Submitting…"
              : isEvent
                ? "Submit event for review"
                : "Submit course for review"}
          </button>
          <p className="vsFinePrint">
            Submissions are reviewed by the MB2 Shield education team before
            appearing on the catalog.
          </p>
        </form>
      </div>
    </div>
  );
}
