import { useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { csvRowToEvent } from "../lib/normalize-csv.js";
import { useClient } from "./AdminApp.jsx";

const isXlsxName = (name) => /\.(xlsx|xlsm|xls)$/i.test(name || "");
const FORMAT_BADGES = ["CSV", "XLSX", "XLS"];

export default function ImportCsv() {
  const navigate = useNavigate();
  const { currentClientId, currentClient } = useClient();
  const [parsed, setParsed] = useState([]);
  const [chosenFile, setChosenFile] = useState(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [drag, setDrag] = useState(false);
  const [showColumnRef, setShowColumnRef] = useState(false);
  const fileRef = useRef(null);

  const onParsed = (rows) => {
    const cleaned = (rows || []).filter((r) =>
      Object.values(r).some((v) => String(v ?? "").trim() !== "")
    );
    setParsed(cleaned.map((raw) => ({ raw, ready: csvRowToEvent(raw) })));
  };

  const handleFile = (file) => {
    if (!file) return;
    setError("");
    setParsed([]);
    setDoneCount(0);
    setChosenFile({ name: file.name, size: file.size, type: file.type });

    if (isXlsxName(file.name)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: "array", cellHTML: false });
          const sheetName = wb.SheetNames[0];
          if (!sheetName) throw new Error("Workbook has no sheets.");
          const sheet = wb.Sheets[sheetName];
          const ref = sheet["!ref"];
          if (!ref) throw new Error("Sheet is empty.");
          const range = XLSX.utils.decode_range(ref);

          const headers = [];
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
            const h = cell ? String(cell.w ?? cell.v ?? "").trim() : "";
            headers.push(h || `Col${c}`);
          }
          const rows = [];
          for (let r = range.s.r + 1; r <= range.e.r; r++) {
            const row = {};
            for (let c = range.s.c; c <= range.e.c; c++) {
              const cell = sheet[XLSX.utils.encode_cell({ r, c })];
              if (!cell) continue;
              const key = headers[c - range.s.c];
              const linkTarget = cell.l?.Target;
              const value = linkTarget != null && linkTarget !== ""
                ? linkTarget
                : (cell.w ?? cell.v ?? "");
              row[key] = value;
            }
            rows.push(row);
          }
          onParsed(rows);
        } catch (err) {
          setError(err.message || "Failed to read Excel file.");
        }
      };
      reader.onerror = () => setError("Could not read file.");
      reader.readAsArrayBuffer(file);
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        if (res.errors?.length) console.warn("CSV parse warnings:", res.errors);
        onParsed(res.data);
      },
      error: (err) => setError(err.message),
    });
  };

  const reset = () => {
    setParsed([]);
    setChosenFile(null);
    setError("");
    setDoneCount(0);
  };

  const runImport = async () => {
    if (parsed.length === 0) return;
    if (!confirm(`Import ${parsed.length} events as DRAFTS? You can publish them after review.`)) return;
    setImporting(true);
    setDoneCount(0);
    const batchSize = 50;
    try {
      for (let i = 0; i < parsed.length; i += batchSize) {
        const slice = parsed
          .slice(i, i + batchSize)
          .map((p) => ({ ...p.ready, client_id: currentClientId }));
        const { error } = await supabase.from("events").insert(slice);
        if (error) throw error;
        setDoneCount(i + slice.length);
      }
      alert(`Imported ${parsed.length} events as drafts. Review them on the Events page.`);
      navigate("/admin");
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const mb2Count = parsed.filter((p) => p.ready.mb2_exclusive).length;
  const withDate = parsed.filter((p) => p.ready.event_date).length;
  const withVendor = parsed.filter((p) => (p.ready.vendor || "").trim()).length;

  return (
    <section className="impPage">
      <header className="elHero">
        <div className="elHeroTop">
          <div>
            <p className="elKicker">Data</p>
            <h1 className="elH1">Import events</h1>
            <p className="elHeroLead">
              Drop a CSV or Excel file. We read the first sheet, match column headers automatically,
              and stage every row as a draft so you can review before it goes live.
              {currentClient && (
                <> Importing into <strong>{currentClient.name}</strong>.</>
              )}
            </p>
          </div>
          <div className="impFormatBadges">
            {FORMAT_BADGES.map((b) => <span key={b} className="impFormatBadge">{b}</span>)}
          </div>
        </div>
      </header>

      {error && <div className="evErrorBanner">{error}</div>}

      {parsed.length === 0 ? (
        <div className="impSplit">
          {/* LEFT: drop zone */}
          <div
            className={`impDropZone ${drag ? "drag" : ""} ${chosenFile && !parsed.length ? "loading" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,.xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="impDropIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none">
                <path d="M12 16V4M8 8l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 17v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="impDropTitle">
              {chosenFile ? `Reading ${chosenFile.name}…` : drag ? "Drop your file" : "Drag a file here, or click to browse"}
            </h2>
            <p className="impDropSub">
              Supported formats: <strong>CSV</strong>, <strong>XLSX</strong>, <strong>XLS</strong> — max 1 sheet read per file.
            </p>
          </div>

          {/* RIGHT: 3-step guide */}
          <aside className="impGuide">
            <div className="impGuideStep">
              <span className="impStepN">1</span>
              <div>
                <h3>Export your sheet</h3>
                <p>From Google Sheets: <strong>File → Download → Comma Separated Values</strong> or <strong>Microsoft Excel</strong>.</p>
              </div>
            </div>
            <div className="impGuideStep">
              <span className="impStepN">2</span>
              <div>
                <h3>Drop the file</h3>
                <p>We'll parse the first sheet, normalize fuzzy headers (Course Name = Name of Event, etc.), and detect hyperlinks.</p>
              </div>
            </div>
            <div className="impGuideStep">
              <span className="impStepN">3</span>
              <div>
                <h3>Review and import</h3>
                <p>Inspect the preview, then import as drafts. Nothing goes live until you flip each Publish toggle.</p>
              </div>
            </div>

            <button
              type="button"
              className="impColumnRefToggle"
              onClick={() => setShowColumnRef((s) => !s)}
            >
              {showColumnRef ? "Hide column reference" : "Which columns do we read?"}
              <span className="impCaret">{showColumnRef ? "▴" : "▾"}</span>
            </button>

            {showColumnRef && (
              <div className="impColumnRef">
                <ColRefRow field="Event title"   aliases={["Name of Event", "Event Name", "Title", "Course Name", "Course"]} />
                <ColRefRow field="Date"          aliases={["Date of the Event", "Event Date", "Date"]} />
                <ColRefRow field="Format"        aliases={["Format", "Event Format", "Type"]} note='Or use "Virtual" = Yes/No' />
                <ColRefRow field="CE credits"    aliases={["CE Hours", "Credits", "CE Credits", "Hours"]} />
                <ColRefRow field="Cost"          aliases={["Cost", "Price"]} />
                <ColRefRow field="Vendor"        aliases={["Presenter / Vendor (Tag)", "Vendor", "Presenter"]} />
                <ColRefRow field="Vendor logo"   aliases={["Vendor Logo", "Logo"]} />
                <ColRefRow field="Thumbnail"     aliases={["Course Thumb", "Thumbnail", "Image"]} />
                <ColRefRow field="Description"   aliases={["Description", "Course Description"]} />
                <ColRefRow field="Category"      aliases={["category", "Topic", "Subject"]} />
                <ColRefRow field="Roles"         aliases={["Roles", "Role", "Position"]} />
                <ColRefRow field="Location"      aliases={["Location", "Venue", "Address"]} />
                <ColRefRow field="Session 1"     aliases={["Time of the event", "Registration Link", "Link"]} />
                <ColRefRow field="Session 2"     aliases={["2nd time of the Event", "Second Registration Link"]} />
                <ColRefRow field="In-person link" aliases={["In-Person Registration Link"]} />
                <ColRefRow field="MB2 Exclusive" aliases={["MB2 Exclusive"]} note="Auto-detected from titles containing 'Exclusive' too" />
              </div>
            )}
          </aside>
        </div>
      ) : (
        // POST-UPLOAD: file metadata + preview + import
        <>
          <div className="impFileCard">
            <div className="impFileMeta">
              <div className="impFileIcon">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div className="impFileName">{chosenFile?.name}</div>
                <div className="impFileSub">{parsed.length} rows • {formatBytes(chosenFile?.size)}</div>
              </div>
            </div>
            <div className="impFileStats">
              <Mini label="Will import" value={parsed.length} tone="accent" />
              <Mini label="With dates" value={withDate} tone="neutral" />
              <Mini label="With vendor" value={withVendor} tone="neutral" />
              <Mini label="MB2 Exclusive" value={mb2Count} tone="gold" />
            </div>
            <button type="button" className="impPickAgainBtn" onClick={reset}>
              Pick a different file
            </button>
          </div>

          <div className="impPreviewCard">
            <div className="impPreviewHead">
              <h2>Preview</h2>
              <span className="muted">Showing first {Math.min(50, parsed.length)} of {parsed.length} rows</span>
            </div>
            <div className="tableWrap impPreviewTable">
              <table className="adminTable">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Date</th>
                    <th>Vendor</th>
                    <th>Format</th>
                    <th>CE</th>
                    <th>MB2</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 50).map((p, i) => (
                    <tr key={i}>
                      <td className="impPrevTitle">{p.ready.title}</td>
                      <td>{p.ready.event_date ? new Date(p.ready.event_date).toLocaleDateString() : <span className="muted">—</span>}</td>
                      <td>{p.ready.vendor || <span className="muted">—</span>}</td>
                      <td>{p.ready.format
                        ? <span className="elFmtPill elFmtDefault">{p.ready.format}</span>
                        : <span className="muted">—</span>}</td>
                      <td>{p.ready.ce_hours ?? <span className="muted">—</span>}</td>
                      <td>{p.ready.mb2_exclusive ? <span className="mb2Star mb2StarOn" style={{ pointerEvents: "none", fontSize: 18 }}>★</span> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="impStickyBar">
            <div className="impStickyLeft">
              <strong>{parsed.length}</strong> events will be imported as drafts
            </div>
            <div className="impStickyRight">
              <button type="button" className="ghostBtn" onClick={reset} disabled={importing}>Clear</button>
              <button type="button" className="primaryBtn impImportBtn" onClick={runImport} disabled={importing}>
                {importing
                  ? <>Importing <strong>{doneCount}</strong> / {parsed.length}…</>
                  : <>Import {parsed.length} events</>}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ColRefRow({ field, aliases, note }) {
  return (
    <div className="impColRefRow">
      <div className="impColRefField">{field}</div>
      <div className="impColRefAliases">
        {aliases.map((a) => <code key={a}>{a}</code>)}
        {note && <em>{note}</em>}
      </div>
    </div>
  );
}

function Mini({ label, value, tone }) {
  return (
    <div className={`impMini impMini-${tone}`}>
      <div className="impMiniVal">{value}</div>
      <div className="impMiniLbl">{label}</div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
