import { useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import "./admin.css";
import "./on-demand-admin.css";

const isXlsxName = (name) => /\.(xlsx|xlsm|xls)$/i.test(name || "");

// Header aliases — accept multiple naming conventions so admins don't
// have to worry about exact column names / casing.
const HEADER_ALIASES = {
  title: ["title", "course title", "course", "name", "course name", "coursetitle", "course_title"],
  type: ["type", "course type", "kind", "category", "format", "course_type"],
  description: ["description", "desc", "summary", "overview", "about", "details"],
  course_url: ["url", "course url", "link", "course link", "course_url", "courseurl", "web address", "website", "webpage"],
  thumbnail_url: ["thumbnail url", "thumbnail", "image", "image url", "thumb", "thumbnail_url", "thumbnailurl", "img", "picture", "photo"],
  ce_hours: [
    "ce hours", "ce credits", "ce", "credits", "ce_hours", "credit hours", "hours",
    "ce hrs", "hrs", "credit", "ce credit", "ce_credit", "ce_credits",
    "cehours", "cecredits", "credit_hours", "credithours",
    "ce hour", "hour", "duration",
    "ce credit hours", "ce credit hour", "ce_credit_hours", "cecredithours",
    "credit hour", "credit hrs", "credits hours", "credits hour",
    "continuing education", "continuing education hours", "continuing education credits",
    "continuing education credit hours",
    "agd hours", "agd credits", "pace hours", "pace credits", "agd", "pace",
  ],
  roles: [
    "roles", "role", "audience", "audiences", "for", "targeted at",
    "target audience", "who is this for", "who for",
  ],
};

// Auto-detect the real header row inside a 2D matrix of cells and return
// row objects keyed by that header row's values. Skips leading title /
// branding rows like a merged "dentlogics_course_catalog" cell above the
// actual column names, and skips blank rows. Falls back to row 0 if no
// clearly-real header row is found.
function matrixToObjects(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return [];

  // Score each row on how "header-like" it is:
  //  +3  cell text matches a known column alias (case-insensitive)
  //  +1  cell is a short, non-URL, non-numeric-only string
  //  -2  cell is a URL or extremely long text (>80 chars)
  const KNOWN_HEADERS = new Set(
    Object.values(HEADER_ALIASES).flat().map((a) => a.toLowerCase())
  );

  const scoreRow = (row) => {
    if (!Array.isArray(row)) return -Infinity;
    let score = 0;
    let filled = 0;
    for (const raw of row) {
      const v = String(raw ?? "").trim();
      if (!v) continue;
      filled += 1;
      const lc = v.toLowerCase();
      if (KNOWN_HEADERS.has(lc)) score += 3;
      else if (v.length <= 40 && !/^https?:/i.test(v) && isNaN(Number(v))) score += 1;
      else if (v.length > 80 || /^https?:/i.test(v)) score -= 2;
    }
    // Need at least 2 filled cells to plausibly be a header row
    if (filled < 2) return -Infinity;
    return score;
  };

  // Only search the first 10 rows for the header row — should be plenty.
  let headerIdx = 0;
  let bestScore = -Infinity;
  const searchLimit = Math.min(10, matrix.length);
  for (let i = 0; i < searchLimit; i++) {
    const s = scoreRow(matrix[i]);
    if (s > bestScore) {
      bestScore = s;
      headerIdx = i;
    }
  }

  const rawHeaders = matrix[headerIdx] || [];
  const headers = rawHeaders.map((h, i) => {
    const s = String(h ?? "").trim();
    return s || `col_${i + 1}`;
  });

  // Convert every subsequent row into { header: value }
  const out = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    // Skip completely blank rows
    if (row.every((c) => String(c ?? "").trim() === "")) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c] ?? "";
    }
    out.push(obj);
  }
  return out;
}

// Split a raw roles value (comma, pipe, or semicolon separated) into a
// cleaned string[]. "Dentist, Hygienist | Assistant" → ["Dentist","Hygienist","Assistant"]
function parseRoles(v) {
  if (v == null) return [];
  const s = String(v).trim();
  if (!s) return [];
  return s
    .split(/[,;|/]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Normalize a header key aggressively — lowercase, collapse ALL whitespace
// (including non-breaking spaces  ), strip parenthetical suffixes like
// "(optional)" and non-alphanumerics that people sometimes drop in.
function normalizeKey(k) {
  return String(k)
    .replace(/ /g, " ")           // non-breaking → regular space
    .replace(/\([^)]*\)/g, "")         // "(optional)" → ""
    .replace(/[^\p{L}\p{N}\s_]/gu, " ") // strip punctuation
    .replace(/\s+/g, " ")              // collapse whitespace
    .trim()
    .toLowerCase();
}

// Normalize a raw CSV/XLSX row into an on-demand course payload.
function normalizeRow(raw, opts = {}) {
  const { includeDescription = true } = opts;
  const out = {
    title: "",
    type: "Course",
    description: "",
    course_url: "",
    thumbnail_url: "",
    ce_hours: "",
    roles: [],
  };
  const map = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (k == null) continue;
    map[normalizeKey(k)] = v == null ? "" : String(v).trim();
  }
  // Pass 1: exact match against aliases
  const matchedKeys = new Set();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (field === "description" && !includeDescription) continue;
    for (const a of aliases) {
      if (map[a] !== undefined && map[a] !== "") {
        out[field] = map[a];
        matchedKeys.add(a);
        break;
      }
    }
  }
  // Pass 2: substring fallback for CE hours — any column whose key contains
  // "ce", "credit", "hour", or "hrs" AND whose value looks numeric.
  if (!out.ce_hours) {
    for (const [key, val] of Object.entries(map)) {
      if (!val || matchedKeys.has(key)) continue;
      const num = parseFloat(val);
      if (Number.isNaN(num)) continue;
      if (/\b(ce|credit|hour|hrs?)\b/.test(key)) {
        out.ce_hours = String(num);
        break;
      }
    }
  }
  // Roles came in as a raw string (comma/pipe separated). Split into array.
  if (typeof out.roles === "string") {
    out.roles = parseRoles(out.roles);
  }
  const t = out.type.toLowerCase();
  if (t.includes("learning") || t.includes("path")) out.type = "Learning Path";
  else out.type = "Course";
  return out;
}

// Given the first raw row, figure out which columns mapped to which fields
// and which columns are unrecognized. Purely diagnostic for the UI.
function diagnoseColumns(rawRow, opts = {}) {
  const { includeDescription = true } = opts;
  if (!rawRow) return { mapped: {}, unmapped: [] };
  const map = {};
  const origKeys = {};
  for (const k of Object.keys(rawRow)) {
    const nk = normalizeKey(k);
    map[nk] = rawRow[k] ?? "";
    origKeys[nk] = k;
  }
  const mapped = {};
  const usedNormalized = new Set();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (field === "description" && !includeDescription) continue;
    for (const a of aliases) {
      if (map[a] !== undefined && !usedNormalized.has(a)) {
        mapped[field] = origKeys[a];
        usedNormalized.add(a);
        break;
      }
    }
  }
  // CE fallback
  if (!mapped.ce_hours) {
    for (const nk of Object.keys(map)) {
      if (usedNormalized.has(nk)) continue;
      const v = map[nk];
      const num = parseFloat(v);
      if (Number.isNaN(num)) continue;
      if (/\b(ce|credit|hour|hrs?)\b/.test(nk)) {
        mapped.ce_hours = origKeys[nk] + " (matched by substring)";
        usedNormalized.add(nk);
        break;
      }
    }
  }
  const unmapped = Object.keys(origKeys)
    .filter((nk) => !usedNormalized.has(nk))
    .map((nk) => origKeys[nk]);
  return { mapped, unmapped };
}

// Downloadable CSV template
const TEMPLATE_CSV = [
  "Course Title,Type,CE Hours,Roles,URL,Thumbnail URL,Description",
  '"7 Strategies for Telephone Success",Course,0.5,"Front Office, Assistant",https://learn.example.com/telephone,https://example.com/thumb1.jpg,"Optional — leave blank if you\'ll add later."',
  '"Endodontics Learning Path","Learning Path",4,"Dentist, Hygienist",https://learn.example.com/endo-path,https://example.com/thumb2.jpg,',
].join("\n");

export default function OnDemandImport() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("file");
  const [parsed, setParsed] = useState([]);
  const [chosenFile, setChosenFile] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteSourceLabel, setPasteSourceLabel] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [drag, setDrag] = useState(false);
  const [showFormatRef, setShowFormatRef] = useState(false);
  const [dupeAction, setDupeAction] = useState("skip"); // "skip" | "update" | "insert"
  const [ignoreDescription, setIgnoreDescription] = useState(false);
  const [columnDiag, setColumnDiag] = useState(null); // { mapped, unmapped }
  const fileRef = useRef(null);

  const reset = () => {
    setChosenFile(null);
    setPasteText("");
    setPasteSourceLabel("");
    setParsed([]);
    setDoneCount(0);
    setError("");
    setColumnDiag(null);
  };

  const switchMode = (m) => {
    setMode(m);
    reset();
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "on-demand-courses-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const annotateRows = async (rows) => {
    if (rows.length === 0) return rows;
    const { data } = await supabase
      .from("on_demand_courses")
      .select("id, title");
    // Map lowercased title → existing course id
    const existingByTitle = new Map();
    for (const r of data || []) {
      const key = (r.title || "").trim().toLowerCase();
      if (key) existingByTitle.set(key, r.id);
    }
    return rows.map((r) => {
      const key = (r.ready.title || "").trim().toLowerCase();
      const existingId = existingByTitle.get(key);
      return {
        ...r,
        status: existingId ? "duplicate" : "new",
        existingId: existingId || null,
      };
    });
  };

  const onParsed = async (rows) => {
    const cleaned = (rows || []).filter((r) =>
      Object.values(r).some((v) => String(v ?? "").trim() !== "")
    );
    const initial = cleaned.map((raw) => ({
      raw,
      ready: normalizeRow(raw, { includeDescription: !ignoreDescription }),
    }));
    const usable = initial.filter((r) => r.ready.title);

    // Diagnostic — what columns did we detect in the file?
    if (cleaned.length > 0) {
      setColumnDiag(
        diagnoseColumns(cleaned[0], { includeDescription: !ignoreDescription })
      );
    }

    if (initial.length > 0 && usable.length === 0) {
      const foundHeaders = Object.keys(initial[0].raw || {});
      setError(
        `Found ${initial.length} data row${initial.length === 1 ? "" : "s"}, but ` +
        `none had a recognizable title column. Your headers were: ` +
        `${foundHeaders.map((h) => `"${h}"`).join(", ")}. ` +
        `Accepted title headers include: "Course Title", "Title", "Name".`
      );
      return;
    }

    const annotated = await annotateRows(usable);
    setParsed(annotated);
  };

  const handleFile = (file) => {
    if (!file) return;
    setError("");
    setParsed([]);
    setDoneCount(0);
    setChosenFile({ name: file.name, size: file.size });

    if (isXlsxName(file.name)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: "array" });
          const firstSheet = wb.SheetNames[0];
          const ws = wb.Sheets[firstSheet];
          // Read as a 2D array first so we can auto-detect the real header row.
          // Files often have a title/branding row above the actual column
          // headers ("dentlogics_course_catalog" in A1 with empty siblings),
          // which XLSX would otherwise treat as headers and give us __EMPTY_N.
          const matrix = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            defval: "",
            blankrows: false,
          });
          const rows = matrixToObjects(matrix);
          onParsed(rows);
        } catch (err) {
          setError("Could not parse Excel file: " + err.message);
        }
      };
      reader.onerror = () => setError("Failed to read file.");
      reader.readAsArrayBuffer(file);
    } else {
      // Parse CSV as a 2D array so we can auto-detect the header row,
      // consistent with how the XLSX path handles leading title rows.
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (result) => {
          const rows = matrixToObjects(result.data);
          onParsed(rows);
        },
        error: (err) => setError("Could not parse CSV: " + err.message),
      });
    }
  };

  const parsePaste = () => {
    setError("");
    setParsed([]);
    setDoneCount(0);

    let text = pasteText;
    if (!text || !text.trim()) {
      setError("Nothing to parse. Paste your data first.");
      return;
    }

    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    text = text.replace(/\r\n|\r|\u2028|\u2029/g, "\n");
    text = text.trim();

    const allLines = text.split("\n").filter((l) => l.trim());

    const firstLine = allLines[0] || "";
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;

    let delimiter = "\t";
    if (commaCount > tabCount && commaCount >= semicolonCount) delimiter = ",";
    else if (semicolonCount > tabCount && semicolonCount > commaCount) delimiter = ";";
    else if (tabCount === 0 && commaCount === 0 && semicolonCount === 0) {
      delimiter = ",";
    }

    const delimLabel =
      delimiter === "\t" ? "TAB" : delimiter === "," ? "COMMA" : "SEMICOLON";

    if (allLines.length < 2) {
      const preview = text.slice(0, 200).replace(/\t/g, "→").replace(/\n/g, "⏎\n");
      setError(
        `Only ${allLines.length} line detected. Need at least 2 (headers + one data row).\n\n` +
        `Detected delimiter: ${delimLabel}. First 200 chars (→ = tab, ⏎ = newline):\n\n${preview}`
      );
      return;
    }

    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      delimiter,
    });

    if (!result?.data || result.data.length === 0) {
      const preview = text.slice(0, 200).replace(/\t/g, "→").replace(/\n/g, "⏎\n");
      setError(
        `No data rows detected. ${allLines.length} lines seen, ${delimLabel} delimiter chosen, ` +
        `${result?.errors?.length || 0} parse errors.\n\nPreview:\n\n${preview}`
      );
      return;
    }

    setPasteSourceLabel(
      `Pasted data · ${result.data.length} row${result.data.length === 1 ? "" : "s"}`
    );
    onParsed(result.data);
  };

  const runImport = async () => {
    setImporting(true);
    setError("");
    setDoneCount(0);
    let ok = 0;
    let failedRow = null;
    try {
      // Build the list of rows to act on. Skip mode filters duplicates out.
      const toProcess = dupeAction === "skip"
        ? parsed.filter((r) => r.status === "new")
        : parsed;

      for (const r of toProcess) {
        const ceRaw = (r.ready.ce_hours || "").toString().trim();
        const ceNumber = ceRaw ? Number(ceRaw) : null;
        const rolesArr = Array.isArray(r.ready.roles) ? r.ready.roles : [];
        const fullPayload = {
          title: r.ready.title,
          type: r.ready.type,
          description: r.ready.description || null,
          course_url: r.ready.course_url || null,
          thumbnail_url: r.ready.thumbnail_url || null,
          ce_hours: Number.isFinite(ceNumber) ? ceNumber : null,
          roles: rolesArr,
        };

        if (r.status === "duplicate" && dupeAction === "update" && r.existingId) {
          // UPDATE existing row. Only include fields that have a value in the
          // import so we don't wipe out data that's empty in the spreadsheet.
          const updatePayload = {};
          if (fullPayload.title) updatePayload.title = fullPayload.title;
          if (fullPayload.type) updatePayload.type = fullPayload.type;
          if (fullPayload.description != null) updatePayload.description = fullPayload.description;
          if (fullPayload.course_url != null) updatePayload.course_url = fullPayload.course_url;
          if (fullPayload.thumbnail_url != null) updatePayload.thumbnail_url = fullPayload.thumbnail_url;
          if (fullPayload.ce_hours != null) updatePayload.ce_hours = fullPayload.ce_hours;
          if (rolesArr.length > 0) updatePayload.roles = rolesArr;
          const { error } = await supabase
            .from("on_demand_courses")
            .update(updatePayload)
            .eq("id", r.existingId);
          if (error) {
            failedRow = { title: r.ready.title, err: error.message };
            throw error;
          }
        } else {
          // INSERT — either it's a new row, or dupeAction is "insert" (import as new)
          const insertPayload = { ...fullPayload, is_published: true };
          const { error } = await supabase
            .from("on_demand_courses")
            .insert(insertPayload);
          if (error) {
            failedRow = { title: r.ready.title, err: error.message };
            throw error;
          }
        }
        ok += 1;
        setDoneCount(ok);
      }
      navigate("/admin/on-demand");
    } catch (e) {
      setError(
        failedRow
          ? `Row "${failedRow.title}" failed: ${failedRow.err}`
          : (e?.message || "Import failed.")
      );
    } finally {
      setImporting(false);
    }
  };

  const newCount = parsed.filter((r) => r.status === "new").length;
  const dupeCount = parsed.filter((r) => r.status === "duplicate").length;
  const willImportCount =
    dupeAction === "skip" ? newCount : parsed.length;
  const insertCount =
    dupeAction === "skip"
      ? newCount
      : dupeAction === "insert"
      ? parsed.length
      : newCount; // update mode: only new rows are inserted
  const updateCount = dupeAction === "update" ? dupeCount : 0;
  const showInput = !chosenFile && parsed.length === 0;

  return (
    <div className="adminMain impPageV2">
      {/* Clean header */}
      <header className="impHeaderV2">
        <Link to="/admin/on-demand" className="impBackLink">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to courses
        </Link>
        <h1 className="impTitleV2">Import courses</h1>
        <p className="impSubtitleV2">
          Add multiple on-demand courses in one shot from a spreadsheet.
        </p>
      </header>

      {showInput && (
        <>
          {/* Big method choice cards */}
          <div className="impMethodGrid">
            <button
              type="button"
              className={`impMethodCard ${mode === "file" ? "active" : ""}`}
              onClick={() => switchMode("file")}
            >
              <div className="impMethodIcon impMethodIconBlue">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M14 3v5h5M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 12v6m0-6l-2 2m2-2l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="impMethodCardBody">
                <div className="impMethodCardTitle">Upload a file</div>
                <div className="impMethodCardDesc">
                  Drop a CSV or Excel spreadsheet (.csv, .xlsx, .xls)
                </div>
              </div>
              {mode === "file" && <span className="impMethodCardCheck" aria-hidden="true">✓</span>}
            </button>

            <button
              type="button"
              className={`impMethodCard ${mode === "paste" ? "active" : ""}`}
              onClick={() => switchMode("paste")}
            >
              <div className="impMethodIcon impMethodIconGreen">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="8" y="4" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="2"/>
                  <path d="M8 6H6a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="impMethodCardBody">
                <div className="impMethodCardTitle">Paste from spreadsheet</div>
                <div className="impMethodCardDesc">
                  Copy rows from Google Sheets or Excel and paste
                </div>
              </div>
              {mode === "paste" && <span className="impMethodCardCheck" aria-hidden="true">✓</span>}
            </button>
          </div>

          {/* Utility bar with template + format reference toggle */}
          <div className="impUtilityBar">
            <button
              type="button"
              className="impUtilityLink"
              onClick={downloadTemplate}
              title="Downloads a CSV template with the exact column names we look for"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v13m0 0l-4-4m4 4l4-4M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Download template CSV
            </button>
            <button
              type="button"
              className="impUtilityLink"
              onClick={() => setShowFormatRef((s) => !s)}
              aria-expanded={showFormatRef}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 8v.01M11 12h1v4h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              {showFormatRef ? "Hide" : "See"} column format
            </button>
          </div>

          {/* Format reference — nicely styled, not monospace-ugly */}
          {showFormatRef && (
            <div className="impFormatCard">
              <p className="impFormatIntro">
                Column headers are matched case-insensitively. Only <strong>Course Title</strong> is
                required — everything else is optional and can be filled in later.
              </p>
              <div className="impFormatGrid">
                <FormatRow name="Course Title" required aliases="title, name, course" example="7 Strategies for Telephone Success" />
                <FormatRow name="Type" aliases="type, course type, kind" example="Course or Learning Path" />
                <FormatRow name="CE Hours" aliases="ce hours, ce credits, credits, hours" example="0.5, 1, 1.5, 2" />
                <FormatRow name="URL" aliases="url, course url, link" example="https://learn.example.com/…" />
                <FormatRow name="Thumbnail URL" aliases="thumbnail, image, image url" example="https://…/image.jpg" />
                <FormatRow name="Roles" aliases="roles, role, audience, for, target audience" example="Dentist, Hygienist, Assistant" />
                <FormatRow name="Description" aliases="description, desc, summary" example="Short summary shown on the card." />
              </div>
            </div>
          )}

          {/* Import options — applies to BOTH file and paste modes */}
          <div className="impOptions">
            <div className="impOptionsLabel">Import options</div>
            <label className="impInlineCheckbox">
              <input
                type="checkbox"
                checked={ignoreDescription}
                onChange={(e) => setIgnoreDescription(e.target.checked)}
              />
              <span>
                Ignore <strong>Description</strong> column
                <span className="impInlineCheckboxHint"> — turn on only if descriptions with line breaks cause parse errors.</span>
              </span>
            </label>
          </div>

          {/* Method-specific input */}
          {mode === "file" && (
            <div
              className={`impDropV2 ${drag ? "dragOver" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
              }}
            >
              <div className="impDropIcon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v13m0 0l-4-4m4 4l4-4M6 21h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="impDropText">
                <div className="impDropHeadline">
                  {drag ? "Release to upload" : "Drop your file here"}
                </div>
                <div className="impDropSub">
                  or <span className="impDropLink">click to browse</span> your computer
                </div>
                <div className="impDropAccepts">CSV, XLSX, XLS · up to 5 MB</div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xlsm,.xls"
                style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          )}

          {mode === "paste" && (
            <div className="impPasteZoneV2">
              <div className="impPasteHeader">
                <div>
                  <div className="impPasteHeaderTitle">Paste your rows below</div>
                  <div className="impPasteHeaderSub">
                    In Google Sheets or Excel, select your rows (including the header row),
                    copy with <kbd>⌘C</kbd> / <kbd>Ctrl</kbd>+<kbd>C</kbd>, then paste here.
                    Tab-separated and CSV formats are both auto-detected.
                  </div>
                </div>
                <span className="impPasteLineCount">
                  {pasteText.trim()
                    ? `${pasteText.split(/\r?\n/).filter(l => l.trim()).length} line${pasteText.split(/\r?\n/).filter(l => l.trim()).length === 1 ? "" : "s"}`
                    : "empty"}
                </span>
              </div>

              <textarea
                className="impPasteTextareaV2"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`Course Title\tType\tCE Hours\tURL\tThumbnail URL
Implant Placement 101\tCourse\t1.5\thttps://…\thttps://…
Endodontic Learning Path\tLearning Path\t4\thttps://…\thttps://…`}
                spellCheck={false}
                rows={10}
                autoFocus
              />

              <div className="impPasteFooter">
                <span className="muted" style={{ fontSize: 12 }}>
                  Descriptions with line breaks may cause parse errors. Toggle the
                  "Ignore Description" option above if you hit issues.
                </span>
                <div className="impPasteActionsV2">
                  {pasteText && (
                    <button
                      type="button"
                      className="ghostBtn"
                      onClick={() => setPasteText("")}
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    className="primaryBtn"
                    onClick={parsePaste}
                    disabled={!pasteText.trim()}
                  >
                    Parse data
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 4 }}>
                      <path d="M5 12h14m-6-6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Preview after file chosen or paste parsed */}
      {(chosenFile || (parsed.length > 0 && mode === "paste")) && (
        <>
          <div className="impFileHeaderV2">
            <div className="impFileHeaderLeft">
              <div className="impFileIcon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M14 3v5h5M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div className="impFileName">
                  {chosenFile ? chosenFile.name : (pasteSourceLabel || "Pasted data")}
                </div>
                <div className="impFileSize muted">
                  {chosenFile
                    ? `${(chosenFile.size / 1024).toFixed(1)} KB`
                    : `${pasteText.length.toLocaleString()} characters`}
                </div>
              </div>
            </div>
            <button type="button" className="ghostBtn" onClick={reset}>
              {chosenFile ? "Change file" : "Change source"}
            </button>
          </div>

          {parsed.length > 0 && (
            <>
              <div className="impStatsV2">
                <div className="impStat">
                  <div className="impStatValue">{parsed.length}</div>
                  <div className="impStatLabel">Rows parsed</div>
                </div>
                <div className="impStat impStatOk">
                  <div className="impStatValue">{newCount}</div>
                  <div className="impStatLabel">New</div>
                </div>
                <div className="impStat impStatWarn">
                  <div className="impStatValue">{dupeCount}</div>
                  <div className="impStatLabel">Duplicates</div>
                </div>
              </div>

              {columnDiag && <ColumnMappingPanel diag={columnDiag} /> }

              {dupeCount > 0 && (
                <div className="impDupeControl">
                  <div className="impDupeControlHeader">
                    <div className="impDupeControlIcon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
                        <path d="M12 8v5m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div>
                      <div className="impDupeControlTitle">
                        {dupeCount} course{dupeCount === 1 ? "" : "s"} already exist with the same title
                      </div>
                      <div className="impDupeControlSub">
                        How should we handle these existing rows?
                      </div>
                    </div>
                  </div>
                  <div className="impDupeSegmented" role="radiogroup">
                    <DupeSegOption
                      value="skip"
                      current={dupeAction}
                      onChange={setDupeAction}
                      title="Skip existing"
                      desc="Leave existing rows unchanged. Only insert new titles."
                      icon={
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M6 12h12M14 6l4 6-4 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      }
                    />
                    <DupeSegOption
                      value="update"
                      current={dupeAction}
                      onChange={setDupeAction}
                      title="Update existing"
                      desc="Overwrite existing rows with values from your import. Empty cells won't wipe existing data."
                      icon={
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M4 12a8 8 0 0114-5m2-2v6h-6M20 12a8 8 0 01-14 5m-2 2v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      }
                    />
                    <DupeSegOption
                      value="insert"
                      current={dupeAction}
                      onChange={setDupeAction}
                      title="Import as new"
                      desc="Create a second row with the same title. Rarely what you want."
                      icon={
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      }
                      warn
                    />
                  </div>
                </div>
              )}

              <div className="impPreviewV2">
                <div className="impPreviewHeader">Preview · {parsed.length} rows</div>
                <div className="impPreviewScroll">
                  <table className="impPreviewTableV2">
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>Status</th>
                        <th>Title</th>
                        <th style={{ width: 110 }}>Type</th>
                        <th style={{ width: 60 }}>CE</th>
                        <th style={{ width: 200 }}>Roles</th>
                        <th>URL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.map((r, i) => (
                        <tr key={i} className={r.status === "duplicate" ? "impRowDupe" : ""}>
                          <td>
                            <span className={`impStatusPill ${r.status === "duplicate" ? "impStatusPillDupe" : "impStatusPillNew"}`}>
                              {r.status === "duplicate" ? "Duplicate" : "New"}
                            </span>
                          </td>
                          <td className="impCellTitle">{r.ready.title}</td>
                          <td>
                            <span className={`impTypePill ${r.ready.type === "Learning Path" ? "impTypePillPath" : ""}`}>
                              {r.ready.type}
                            </span>
                          </td>
                          <td className="muted">{r.ready.ce_hours || "—"}</td>
                          <td className="muted">
                            {Array.isArray(r.ready.roles) && r.ready.roles.length > 0 ? (
                              <span className="impRolesCell">
                                {r.ready.roles.map((role) => (
                                  <span key={role} className="impRolePill">{role}</span>
                                ))}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="muted impCellUrl">
                            {r.ready.course_url ? (
                              <a href={r.ready.course_url} target="_blank" rel="noopener">
                                {r.ready.course_url.replace(/^https?:\/\//, "").slice(0, 40)}
                                {r.ready.course_url.length > 40 ? "…" : ""}
                              </a>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="impActionsV2">
                <div className="impActionsInfo">
                  {importing ? (
                    `Working… ${doneCount} of ${willImportCount}`
                  ) : (
                    <>
                      Ready to <strong>{insertCount > 0 ? `insert ${insertCount}` : ""}</strong>
                      {insertCount > 0 && updateCount > 0 ? " and " : ""}
                      <strong>{updateCount > 0 ? `update ${updateCount}` : ""}</strong>
                      {dupeAction === "skip" && dupeCount > 0 ? (
                        <span className="muted"> · skipping {dupeCount} existing</span>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="impActionsBtns">
                  <button type="button" className="ghostBtn" onClick={reset} disabled={importing}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primaryBtn"
                    onClick={runImport}
                    disabled={importing || willImportCount === 0}
                  >
                    {importing
                      ? "Working…"
                      : dupeAction === "update" && updateCount > 0
                      ? `Import ${insertCount} · Update ${updateCount}`
                      : `Import ${willImportCount} course${willImportCount === 1 ? "" : "s"}`}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {error && (
        <pre className="impErrorBox">
          {error}
        </pre>
      )}
    </div>
  );
}

function DupeSegOption({ value, current, onChange, title, desc, icon, warn }) {
  const active = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`impDupeSegOpt ${active ? "active" : ""} ${warn ? "warn" : ""}`}
      onClick={() => onChange(value)}
    >
      <span className="impDupeSegIcon">{icon}</span>
      <span className="impDupeSegText">
        <span className="impDupeSegTitle">{title}</span>
        <span className="impDupeSegDesc">{desc}</span>
      </span>
      {active && (
        <span className="impDupeSegCheck" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      )}
    </button>
  );
}

function FormatRow({ name, required, aliases, example }) {
  return (
    <div className="impFormatRow">
      <div className="impFormatName">
        {name}
        {required && <span className="impFormatReq">Required</span>}
      </div>
      <div className="impFormatAliases">
        <span className="impFormatAliasLabel">Also accepted:</span> {aliases}
      </div>
      <div className="impFormatExample">
        <span className="impFormatExampleLabel">Example:</span> {example}
      </div>
    </div>
  );
}

// Shows which columns in the user's file mapped to our known fields
// and which columns went unrecognized. Big help when CE hours don't map.
const FIELD_LABELS = {
  title: "Title",
  type: "Type",
  ce_hours: "CE Hours",
  roles: "Roles",
  course_url: "URL",
  thumbnail_url: "Thumbnail URL",
  description: "Description",
};
function ColumnMappingPanel({ diag }) {
  const [open, setOpen] = useState(false);
  const mappedEntries = Object.entries(diag.mapped || {});
  const unmapped = diag.unmapped || [];
  const missing = Object.keys(FIELD_LABELS).filter(
    (f) => !(f in (diag.mapped || {}))
  );

  return (
    <div className="impColMap">
      <button
        type="button"
        className="impColMapToggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span>
          Column mapping — <strong>{mappedEntries.length}</strong> matched
          {missing.length > 0 && <>, <strong>{missing.length}</strong> missing</>}
          {unmapped.length > 0 && <>, <strong>{unmapped.length}</strong> unrecognized</>}
        </span>
        <span className="impColMapChev">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="impColMapBody">
          {mappedEntries.length > 0 && (
            <div className="impColMapSection">
              <div className="impColMapSectionLabel impColMapSectionLabelOk">✓ Matched</div>
              {mappedEntries.map(([field, orig]) => (
                <div key={field} className="impColMapRow">
                  <span className="impColMapField">{FIELD_LABELS[field] || field}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14m-6-6l6 6-6 6" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span className="impColMapOrig">"{orig}"</span>
                </div>
              ))}
            </div>
          )}
          {missing.length > 0 && (
            <div className="impColMapSection">
              <div className="impColMapSectionLabel impColMapSectionLabelWarn">
                ⚠ Not found in your file
              </div>
              <div className="impColMapMissing">
                {missing.map((f) => (
                  <span key={f} className="impColMapMissingPill">{FIELD_LABELS[f] || f}</span>
                ))}
              </div>
            </div>
          )}
          {unmapped.length > 0 && (
            <div className="impColMapSection">
              <div className="impColMapSectionLabel impColMapSectionLabelMuted">
                Unrecognized columns (ignored)
              </div>
              <div className="impColMapMissing">
                {unmapped.map((c) => (
                  <span key={c} className="impColMapUnknownPill">"{c}"</span>
                ))}
              </div>
              <p className="impColMapHint">
                If any of these should be a real column (like CE Hours), tell me the
                exact column name and I'll add it as an accepted alias.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
