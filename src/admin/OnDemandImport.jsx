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
function normalizeRow(raw, opts = {}) {
  const { includeDescription = true } = opts;
  const out = {
    title: "",
    type: "Course",
    description: "",
    course_url: "",
    thumbnail_url: "",
    ce_hours: "",
  };
  const map = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (k == null) continue;
    map[String(k).trim().toLowerCase()] = v == null ? "" : String(v).trim();
  }
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (field === "description" && !includeDescription) continue;
    for (const a of aliases) {
      if (map[a] !== undefined && map[a] !== "") {
        out[field] = map[a];
        break;
      }
    }
  }
  const t = out.type.toLowerCase();
  if (t.includes("learning") || t.includes("path")) out.type = "Learning Path";
  else out.type = "Course";
  return out;
}

// Downloadable CSV template
const TEMPLATE_CSV = [
  "Course Title,Type,CE Hours,URL,Thumbnail URL,Description",
  '"7 Strategies for Telephone Success",Course,0.5,https://learn.example.com/telephone,https://example.com/thumb1.jpg,"Optional — leave blank if you\'ll add later."',
  '"Endodontics Learning Path","Learning Path",4,https://learn.example.com/endo-path,https://example.com/thumb2.jpg,',
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
  const [skipDupes, setSkipDupes] = useState(true);
  const [ignoreDescription, setIgnoreDescription] = useState(true);
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
    const initial = cleaned.map((raw) => ({
      raw,
      ready: normalizeRow(raw, { includeDescription: !ignoreDescription }),
    }));
    const usable = initial.filter((r) => r.ready.title);

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
      const toImport = skipDupes
        ? parsed.filter((r) => r.status === "new")
        : parsed;

      for (const r of toImport) {
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
                <FormatRow name="Description" aliases="description, desc, summary" example="Short summary shown on the card." />
              </div>
            </div>
          )}

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
                <label className="impInlineCheckbox">
                  <input
                    type="checkbox"
                    checked={ignoreDescription}
                    onChange={(e) => setIgnoreDescription(e.target.checked)}
                  />
                  <span>
                    Ignore <strong>Description</strong> column
                    <span className="impInlineCheckboxHint"> — safer when descriptions have line breaks. Add them later per course.</span>
                  </span>
                </label>
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

              {dupeCount > 0 && (
                <label className="impInlineCheckbox impInlineCheckboxCard">
                  <input
                    type="checkbox"
                    checked={skipDupes}
                    onChange={(e) => setSkipDupes(e.target.checked)}
                  />
                  <span>
                    Skip duplicates
                    <span className="impInlineCheckboxHint"> — {dupeCount} row{dupeCount === 1 ? "" : "s"} with matching titles will be ignored.</span>
                  </span>
                </label>
              )}

              <div className="impPreviewV2">
                <div className="impPreviewHeader">Preview · {parsed.length} rows</div>
                <div className="impPreviewScroll">
                  <table className="impPreviewTableV2">
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>Status</th>
                        <th>Title</th>
                        <th style={{ width: 120 }}>Type</th>
                        <th style={{ width: 80 }}>CE</th>
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
                  {importing
                    ? `Importing… ${doneCount} of ${willImportCount}`
                    : `Ready to import ${willImportCount} course${willImportCount === 1 ? "" : "s"}.`}
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
                    {importing ? "Importing…" : `Import ${willImportCount} course${willImportCount === 1 ? "" : "s"}`}
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
