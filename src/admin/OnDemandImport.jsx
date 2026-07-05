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
  title: ["title", "course title", "course", "name"],
  type: ["type", "course type", "kind"],
  description: ["description", "desc", "summary", "overview"],
  course_url: ["url", "course url", "link", "course link", "course_url"],
  thumbnail_url: ["thumbnail url", "thumbnail", "image", "image url", "thumb", "thumbnail_url"],
  ce_hours: ["ce hours", "ce credits", "ce", "credits", "ce_hours", "credit hours", "hours"],
};

// Normalize a raw CSV/XLSX row into an on-demand course payload.
function normalizeRow(raw) {
  const out = {
    title: "",
    type: "Course",
    description: "",
    course_url: "",
    thumbnail_url: "",
    ce_hours: "",
  };
  // Build a lower-cased key lookup
  const map = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (k == null) continue;
    map[String(k).trim().toLowerCase()] = v == null ? "" : String(v).trim();
  }
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) {
      if (map[a] !== undefined && map[a] !== "") {
        out[field] = map[a];
        break;
      }
    }
  }
  // Normalize type — only accept "Course" or "Learning Path" (case-insensitive)
  const t = out.type.toLowerCase();
  if (t.includes("learning") || t.includes("path")) out.type = "Learning Path";
  else out.type = "Course";
  return out;
}

export default function OnDemandImport() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("file"); // "file" | "paste"
  const [parsed, setParsed] = useState([]); // [{ raw, ready, status: 'new' | 'duplicate' }]
  const [chosenFile, setChosenFile] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteSourceLabel, setPasteSourceLabel] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [drag, setDrag] = useState(false);
  const [showColumnRef, setShowColumnRef] = useState(false);
  const [skipDupes, setSkipDupes] = useState(true);
  const fileRef = useRef(null);

  const reset = () => {
    setChosenFile(null);
    setPasteText("");
    setPasteSourceLabel("");
    setParsed([]);
    setDoneCount(0);
    setError("");
  };

  const switchMode = (m) => {
    setMode(m);
    reset();
  };

  // Tag each parsed row "new" or "duplicate" by comparing against existing
  // titles (case-insensitive).
  const annotateRows = async (rows) => {
    if (rows.length === 0) return rows;
    const { data } = await supabase
      .from("on_demand_courses")
      .select("title");
    const existing = new Set(
      (data || []).map((r) => (r.title || "").trim().toLowerCase())
    );
    return rows.map((r) => ({
      ...r,
      status: existing.has((r.ready.title || "").trim().toLowerCase())
        ? "duplicate"
        : "new",
    }));
  };

  const onParsed = async (rows) => {
    const cleaned = (rows || []).filter((r) =>
      Object.values(r).some((v) => String(v ?? "").trim() !== "")
    );
    const initial = cleaned.map((raw) => ({ raw, ready: normalizeRow(raw) }));
    // Filter rows with no title — they're not usable
    const usable = initial.filter((r) => r.ready.title);

    // If we successfully found data rows but none of them have a title,
    // the "title" column probably has an unrecognized header name.
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
          const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
          onParsed(rows);
        } catch (err) {
          setError("Could not parse Excel file: " + err.message);
        }
      };
      reader.onerror = () => setError("Failed to read file.");
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => onParsed(result.data),
        error: (err) => setError("Could not parse CSV: " + err.message),
      });
    }
  };

  // Parse pasted text. Handle all common line endings and detect delimiter
  // manually since Papa's auto-detection is unreliable on pasted content.
  const parsePaste = () => {
    setError("");
    setParsed([]);
    setDoneCount(0);

    let text = pasteText;
    if (!text || !text.trim()) {
      setError("Nothing to parse. Paste your data first.");
      return;
    }

    // Strip UTF-8 BOM if present (Google Sheets exports sometimes include it)
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    // Normalize ALL possible line separators to \n.
    // Windows: \r\n · classic Mac: \r · Unix: \n · Unicode:
    text = text.replace(/\r\n|\r| | /g, "\n");
    text = text.trim();

    // Split into lines and drop empty ones
    const allLines = text.split("\n").filter((l) => l.trim());

    // Detect delimiter by looking at the FIRST non-empty line.
    // Google Sheets / Excel paste as TAB-separated; raw CSV is comma-separated.
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

    // Preview of what got pasted (for diagnostics)
    const preview = text.slice(0, 200);
    const previewNice = preview
      .replace(/\t/g, "→")   // tab → arrow
      .replace(/\n/g, "⏎\n"); // newline → return arrow

    // If we only see ONE line total, no amount of parsing will help.
    // Show the user a clear diagnostic with a preview of the raw content.
    if (allLines.length < 2) {
      setError(
        `Only ${allLines.length} line detected in the paste — we need at least 2 (headers + one data row).\n\n` +
        `Detected delimiter would be ${delimLabel}. The paste's first 200 chars (→ = tab, ⏎ = newline):\n\n${previewNice}\n\n` +
        `If you see all your data flowing together in one line above, your spreadsheet probably lost the row breaks during copy. ` +
        `Try re-selecting the rows in your source and pasting again. If you're pasting from a PDF or web page, use the file upload option instead.`
      );
      return;
    }

    // Parse synchronously (no callback) to get result back directly
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      delimiter,
    });

    if (!result?.data || result.data.length === 0) {
      setError(
        `No data rows detected. ${allLines.length} lines seen, ${delimLabel} delimiter chosen, ` +
        `${result?.errors?.length || 0} parse errors. Preview:\n\n${previewNice}`
      );
      return;
    }

    // Debug: log to console so we can inspect if needed
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.log("[on-demand paste]", {
        delimiter: delimLabel,
        lineCount: allLines.length,
        headers: Object.keys(result.data[0] || {}),
        rowCount: result.data.length,
        firstRow: result.data[0],
      });
    }

    setPasteSourceLabel(
      `Pasted data (${delimLabel}) · ${result.data.length} row${result.data.length === 1 ? "" : "s"}`
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
      const toImport = skipDupes
        ? parsed.filter((r) => r.status === "new")
        : parsed;

      for (const r of toImport) {
        // Parse CE hours as number, tolerate blank
        const ceRaw = (r.ready.ce_hours || "").toString().trim();
        const ceNumber = ceRaw ? Number(ceRaw) : null;
        const payload = {
          title: r.ready.title,
          type: r.ready.type,
          description: r.ready.description || null,
          course_url: r.ready.course_url || null,
          thumbnail_url: r.ready.thumbnail_url || null,
          ce_hours: Number.isFinite(ceNumber) ? ceNumber : null,
          is_published: true,
        };
        const { error } = await supabase.from("on_demand_courses").insert(payload);
        if (error) {
          failedRow = { title: r.ready.title, err: error.message };
          throw error;
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
  const willImportCount = skipDupes ? newCount : parsed.length;

  return (
    <div className="adminMain">
      <div className="elHero">
        <div className="elHeroLeft">
          <Link to="/admin/on-demand" className="evBack" style={{ marginBottom: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to courses
          </Link>
          <div className="elHeroLabel">BULK IMPORT</div>
          <h1 className="elHeroTitle">Import On-Demand Courses</h1>
          <p className="elHeroSubtitle">
            Upload a CSV or Excel file with your course list. We'll match your columns
            automatically and let you review the results before saving.
          </p>
        </div>
      </div>

      {/* Column reference */}
      <div className="impColumnRef">
        <button
          type="button"
          className="impColumnRefToggle"
          onClick={() => setShowColumnRef((s) => !s)}
        >
          {showColumnRef ? "Hide" : "Show"} expected columns
        </button>
        {showColumnRef && (
          <div className="impColumnRefBody">
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Column headers are matched case-insensitively. Only <strong>Course Title</strong>{" "}
              is required.
            </p>
            <table className="impColumnTable">
              <thead>
                <tr>
                  <th>Column name</th>
                  <th>Accepted aliases</th>
                  <th>Example</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>Course Title</code> *</td>
                  <td>title, name</td>
                  <td>Implant Placement Fundamentals</td>
                </tr>
                <tr>
                  <td><code>Type</code></td>
                  <td>type, course type, kind</td>
                  <td>Course, Learning Path</td>
                </tr>
                <tr>
                  <td><code>Description</code></td>
                  <td>description, desc, summary</td>
                  <td>A short summary…</td>
                </tr>
                <tr>
                  <td><code>URL</code></td>
                  <td>url, course url, link</td>
                  <td>https://learn.example.com/…</td>
                </tr>
                <tr>
                  <td><code>Thumbnail URL</code></td>
                  <td>thumbnail, image, image url, thumb</td>
                  <td>https://…/image.jpg</td>
                </tr>
                <tr>
                  <td><code>CE Hours</code></td>
                  <td>ce hours, ce credits, ce, credits, hours</td>
                  <td>1, 1.5, 2</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mode toggle: Upload file vs Paste data */}
      {!chosenFile && parsed.length === 0 && (
        <div className="impModeTabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "file"}
            className={`impModeTab ${mode === "file" ? "active" : ""}`}
            onClick={() => switchMode("file")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 3v12m0-12l-4 4m4-4l4 4M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Upload file</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "paste"}
            className={`impModeTab ${mode === "paste" ? "active" : ""}`}
            onClick={() => switchMode("paste")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="8" y="4" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 6H6a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>Paste from spreadsheet</span>
          </button>
        </div>
      )}

      {/* File drop zone */}
      {!chosenFile && parsed.length === 0 && mode === "file" && (
        <div
          className={`impDrop ${drag ? "dragOver" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileRef.current?.click()}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v12m0-12l-4 4m4-4l4 4M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ marginTop: 12 }}>
            <strong>Drop your file here, or click to browse</strong>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Accepts .csv, .xlsx, .xls
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

      {/* Paste-from-spreadsheet area */}
      {!chosenFile && parsed.length === 0 && mode === "paste" && (
        <div className="impPasteZone">
          <div className="impPasteInstructions">
            <strong>Paste tabular data from Google Sheets or Excel</strong>
            <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
              Select your rows (including the header row) in your spreadsheet,
              copy with <kbd>⌘</kbd>+<kbd>C</kbd> or <kbd>Ctrl</kbd>+<kbd>C</kbd>,
              then paste them into the box below. Both CSV and tab-separated
              formats are auto-detected.
            </p>
          </div>
          <textarea
            className="impPasteTextarea"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`Course Title\tType\tDescription\tURL\tThumbnail URL
Implant Placement 101\tCourse\tLearn the fundamentals…\thttps://…\thttps://…
Endodontic Learning Path\tLearning Path\tMulti-course series…\thttps://…\thttps://…`}
            spellCheck={false}
            rows={10}
            autoFocus
          />
          <div className="impPasteActions">
            <span className="muted" style={{ fontSize: 12 }}>
              {pasteText.trim()
                ? `${pasteText.split(/\r?\n/).filter(l => l.trim()).length} line${pasteText.split(/\r?\n/).filter(l => l.trim()).length === 1 ? "" : "s"} pasted`
                : "Nothing pasted yet"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
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
                Parse data →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File chosen OR paste parsed — show preview */}
      {(chosenFile || (parsed.length > 0 && mode === "paste")) && (
        <>
          <div className="impFileHeader">
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
            <button
              type="button"
              className="ghostBtn"
              onClick={reset}
            >
              {chosenFile ? "Change file" : "Change source"}
            </button>
          </div>

          {parsed.length > 0 && (
            <>
              <div className="impFileStats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <div className="impFileStat">
                  <div className="impFileStatValue">{parsed.length}</div>
                  <div className="impFileStatLabel">Rows parsed</div>
                </div>
                <div className="impFileStat impFileStatSuccess">
                  <div className="impFileStatValue">{newCount}</div>
                  <div className="impFileStatLabel">New</div>
                </div>
                <div className="impFileStat impFileStatWarn">
                  <div className="impFileStatValue">{dupeCount}</div>
                  <div className="impFileStatLabel">Duplicate titles</div>
                </div>
              </div>

              {dupeCount > 0 && (
                <label className="impSkipDupe">
                  <input
                    type="checkbox"
                    checked={skipDupes}
                    onChange={(e) => setSkipDupes(e.target.checked)}
                  />
                  <span>Skip duplicates ({dupeCount} row{dupeCount === 1 ? "" : "s"} will be ignored)</span>
                </label>
              )}

              {/* Preview table */}
              <div className="impPreview">
                <table className="impPreviewTable">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((r, i) => (
                      <tr
                        key={i}
                        className={r.status === "duplicate" ? "impRowDupe" : ""}
                      >
                        <td>
                          {r.status === "duplicate" ? (
                            <span className="impStatusPill impStatusPillDupe">Duplicate</span>
                          ) : (
                            <span className="impStatusPill impStatusPillNew">New</span>
                          )}
                        </td>
                        <td><strong>{r.ready.title}</strong></td>
                        <td>{r.ready.type}</td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {r.ready.description ? (
                            r.ready.description.length > 80
                              ? r.ready.description.slice(0, 80) + "…"
                              : r.ready.description
                          ) : (
                            <em>—</em>
                          )}
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>
                          {r.ready.course_url ? (
                            <a href={r.ready.course_url} target="_blank" rel="noopener">
                              {r.ready.course_url.replace(/^https?:\/\//, "").slice(0, 40)}…
                            </a>
                          ) : (
                            <em>—</em>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Import action */}
              <div className="impActions">
                <div className="impActionsInfo muted">
                  {importing
                    ? `Importing… ${doneCount} of ${willImportCount}`
                    : `Ready to import ${willImportCount} course${willImportCount === 1 ? "" : "s"}.`}
                </div>
                <button
                  type="button"
                  className="primaryBtn"
                  onClick={runImport}
                  disabled={importing || willImportCount === 0}
                >
                  {importing ? "Importing…" : `Import ${willImportCount} course${willImportCount === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {error && (
        <pre
          className="errMsg"
          style={{
            marginTop: 16,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {error}
        </pre>
      )}
    </div>
  );
}
