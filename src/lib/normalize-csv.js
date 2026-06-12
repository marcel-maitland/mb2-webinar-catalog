/**
 * Convert one raw CSV row (object keyed by sheet column names) into a clean
 * Supabase `events` row ready for insert. Used by:
 *   - admin/ImportCsv.jsx (bulk import from your existing Google Sheet export)
 *   - one-time migration script (optional)
 *
 * Stays tolerant of header typos the way your old normalize() in App.jsx does.
 */

const safe = (v) =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

const splitCsv = (value) => {
  const s = safe(value);
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
};

const isTruthyFlag = (value) => {
  const v = safe(value).toLowerCase();
  return ["yes", "y", "true", "1", "x", "✓", "checked"].includes(v);
};

const parseCe = (raw) => {
  const n = Number(String(safe(raw)).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const parseDate = (raw) => {
  const s = safe(raw);
  if (!s) return null;
  // Handle multi-day ranges like "06/11/26-06/12/26" or "June 12-13th" → take the start
  let start = s.split(/[–—-]/)[0].trim();
  // Strip ordinal suffixes: "June 10th" → "June 10", "Sept 2nd" → "Sept 2"
  start = start.replace(/(\d+)(st|nd|rd|th)\b/gi, "$1");
  const d = new Date(start);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// "Virtual" column → format. "Yes" means online/webinar.
const virtualFlagToFormat = (value, fallback) => {
  const v = safe(value).toLowerCase();
  if (v === "yes" || v === "y" || v === "true" || v === "1") return "Webinar";
  if (v === "no"  || v === "n" || v === "false" || v === "0") return "In-Person";
  return safe(fallback) || null;
};

// Detect MB2 Exclusive: explicit flag column wins, fall back to "Exclusive" in title.
const detectMb2 = (flagValue, title) => {
  if (isTruthyFlag(flagValue)) return true;
  return /\bexclusive\b/i.test(safe(title));
};

/**
 * @param {Record<string, any>} row  - one parsed CSV row
 * @returns {object} row ready for `supabase.from('events').insert(...)`
 */
export function csvRowToEvent(row) {
  const get = (...keys) => {
    for (const k of keys) {
      const v = row?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        return String(v).trim();
      }
    }
    return "";
  };

  const title = get("Name of Event", "Event Name", "Title", "Course Name", "Course") || "Untitled Event";

  return {
    title,
    description:                 get("Description", "description", "DESC", "Course Description") || null,
    event_date:                  parseDate(get("Date of the Event", "Event Date", "Date")),
    category:                    get("category", "Category", "CATEGORY", "Topic", "Subject") || null,
    ce_hours:                    parseCe(get("CE Hours", "CE", "CE Hour", "CE hours", "Credits", "Credit", "CE Credits", "Hours")),
    cost:                        get("Cost", "cost", "Price") || null,
    vendor:                      get("Presenter / Vendor (Tag)", "Vendor", "Presenter", "Presenter/Vendor") || null,
    vendor_logo_url:             get("Vendor Logo", "Vender Logo", "Vendor logo", "Logo") || null,
    thumb_url:                   get("Course Thumb", "Course Thumbnail", "Thumbnail", "Thumb", "Image") || null,
    format:                      virtualFlagToFormat(get("Virtual", "Online"), get("Format", "format", "Event Format", "Type")),
    roles:                       splitCsv(get("Roles", "Role", "Role / Position", "Position", "Positions")),
    location:                    get("Location", "location", "Venue", "Address") || null,
    in_person_registration_url:  get(
      "In person registration link",
      "In Person Registration Link",
      "In-Person Registration Link",
      "In person Registration link",
      "In Person Reg Link",
      "In-Person Reg Link"
    ) || null,
    session1_label:              get("Time of the event", "Time of Event", "Time 1") || null,
    session1_url:                get("Registration Link", "Reg Link", "Registration", "Link", "Register Link", "Register") || null,
    session2_label:              get("2nd time of the Event", "Second Time", "Time 2") || null,
    session2_url:                get("Second Registration Link", "Second Reg Link", "Registration 2") || null,
    mb2_exclusive:               detectMb2(get("MB2 Exclusive", "MB2Exclusive", "Exclusive"), title),
    // Drafts by default — admin chooses what to publish after a bulk import.
    is_published:                false,
  };
}
