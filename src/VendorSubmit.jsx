import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import "./vendor-submit.css";

/* ============================================================
   PUBLIC vendor course submission page — /submit-course
   Share this link with vendors. Submissions create UNPUBLISHED
   courses that the MB2 Shield team reviews and publishes.
   ============================================================ */

const ROLES = [
  "Assistants",
  "Hygienist",
  "Front Office",
  "Treatment Coordinators",
  "Dentist",
  "Leadership & Management",
];

export default function VendorSubmit() {
  const [categories, setCategories] = useState([]);
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
    ideal_date: "",
    highlights: "",
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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleIn = (k, value) =>
    setForm((f) => ({
      ...f,
      [k]: f[k].includes(value) ? f[k].filter((x) => x !== value) : [...f[k], value],
    }));

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

    if (!form.vendor.trim()) return setError("Please enter your company name.");
    if (!form.contact_first.trim() || !form.contact_last.trim())
      return setError("Please enter your first and last name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim()))
      return setError("Please enter a valid email address.");
    if (!form.title.trim()) return setError("Please enter the course title.");
    if (!form.description.trim()) return setError("Please enter a course description.");
    if (!/^https?:\/\//i.test(form.course_url.trim()))
      return setError("Please enter the full course link, starting with https://");
    if (!flyerFile) return setError("Please attach your course flyer (PDF).");

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
        form.phone.trim() && `Phone: ${form.phone.trim()}`,
        form.speaker.trim() && `Speaker: ${form.speaker.trim()}`,
        form.ideal_date && `Ideal post date: ${form.ideal_date}`,
        form.highlights.trim() && `Highlights / promo codes: ${form.highlights.trim()}`,
        logoUrl && `Company logo: ${logoUrl}`,
      ]
        .filter(Boolean)
        .join("\n");

      const { data, error: rpcErr } = await supabase.rpc("submit_vendor_course", {
        p: {
          vendor: form.vendor.trim(),
          contact_name: `${form.contact_first.trim()} ${form.contact_last.trim()}`,
          contact_email: form.contact_email.trim(),
          title: form.title.trim(),
          description,
          ce_hours: form.ce_hours,
          cost: form.cost,
          course_url: form.course_url.trim(),
          categories: form.categories,
          roles: form.roles,
          thumbnail_url: thumbUrl,
          flyer_url: flyerUrl,
          logo_url: logoUrl,
          notes,
        },
      });
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

  if (done) {
    return (
      <div className="vsPage" ref={topRef}>
        <div className="vsCard vsThanks">
          <div className="vsThanksIcon" aria-hidden="true">✓</div>
          <h1>Thank you!</h1>
          <p>
            Your course has been submitted to the MB2 Shield education team.
            We'll review it and reach out to <strong>{form.contact_email}</strong>{" "}
            if we have any questions. Once approved, it will appear on the
            on-demand catalog.
          </p>
          <button
            type="button"
            className="vsPrimaryBtn"
            onClick={() => window.location.reload()}
          >
            Submit another course
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vsPage" ref={topRef}>
      <div className="vsCard">
        <div className="vsHeader">
          <h1>Submit an On-Demand Course</h1>
          <p>
            Partner with MB2 Dental to feature your on-demand CE course on the
            MB2 Shield catalog. Fill out the details below — our education team
            reviews every submission before it's published.
          </p>
        </div>

        <form onSubmit={submit} noValidate>
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

          <h2 className="vsSectionTitle">Course details</h2>
          <div className="vsRow">
            <label className="vsField">
              <span>Course title *</span>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} />
            </label>
          </div>
          <div className="vsRow">
            <label className="vsField">
              <span>Course description *</span>
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
          <div className="vsRow">
            <label className="vsField">
              <span>Important highlights or promo codes</span>
              <textarea rows={2} placeholder="Anything the MB2 team should know or feature." value={form.highlights} onChange={(e) => set("highlights", e.target.value)} />
            </label>
          </div>

          <h2 className="vsSectionTitle">Who is this course for?</h2>
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
              <h2 className="vsSectionTitle">Course categories</h2>
              <div className="vsChecks">
                {categories.map((c) => (
                  <label key={c} className={`vsCheck ${form.categories.includes(c) ? "on" : ""}`}>
                    <input type="checkbox" checked={form.categories.includes(c)} onChange={() => toggleIn("categories", c)} />
                    {c}
                  </label>
                ))}
              </div>
            </>
          )}

          <h2 className="vsSectionTitle">Files</h2>
          <div className="vsRow">
            <label className="vsField">
              <span>Course flyer (PDF) *</span>
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
            {submitting ? "Submitting…" : "Submit course for review"}
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
