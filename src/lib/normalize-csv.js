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
  // Handle "06/11/26-06/12/26" multi-day ranges → take the start date.
  const start = s.split(/[–—-]/)[0].trim();
  const d = new Date(start);
  return isNaN(d.getTime()) ? null : d.toISOString();
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

  return {
    title:                       get("Name of Event", "Event Name", "Title") || "Untitled Event",
    description:                 get("Description", "description", "DESC", "Course Description") || null,
    event_date:                  parseDate(get("Date of the Event", "Event Date", "Date")),
    category:                    get("category", "Category", "CATEGORY") || null,
    ce_hours:                    parseCe(get("CE Hours", "CE", "CE Hour", "CE hours")),
    cost:                        get("Cost", "cost", "Price") || null,
    vendor:                      get("Presenter / Vendor (Tag)", "Vendor", "Presenter", "Presenter/Vendor") || null,
    vendor_logo_url:             get("Vendor Logo", "Vender Logo", "Vendor logo", "Logo") || null,
    thumb_url:                   get("Course Thumb", "Course Thumbnail", "Thumbnail", "Thumb", "Image") || null,
    format:                      get("Format", "format", "Event Format", "Type") || null,
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
    session1_url:                get("Registration Link", "Reg Link", "Registration") || null,
    session2_label:              get("2nd time of the Event", "Second Time", "Time 2") || null,
    session2_url:                get("Second Registration Link", "Second Reg Link", "Registration 2") || null,
    mb2_exclusive:               isTruthyFlag(get("MB2 Exclusive", "MB2Exclusive", "Exclusive")),
    // Drafts by default — admin chooses what to publish after a bulk import.
    is_published:                false,
  };
}
