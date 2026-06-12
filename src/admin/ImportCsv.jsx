import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { csvRowToEvent } from "../lib/normalize-csv.js";

const isXlsxName = (name) => /\.(xlsx|xlsm|xls)$/i.test(name || "");

export default function ImportCsv() {
  const navigate = useNavigate();
  const [parsed, setParsed] = useState([]);  // [{ raw, ready }]
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const onParsed = (rows) => {
    // Drop fully-empty rows that some spreadsheets leave around
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

    if (isXlsxName(file.name)) {
      // XLSX path — read as array buffer, walk first sheet so we can pull hyperlink
      // targets out of cells (sheet_to_json otherwise gives us only the display text
      // "Register Here", not the actual URL).
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

          // Read headers from the first row
          const headers = [];
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
            const h = cell ? String(cell.w ?? cell.v ?? "").trim() : "";
            headers.push(h || `Col${c}`);
          }

          // Walk data rows; for each cell, prefer the hyperlink target over the display text
          const rows = [];
          for (let r = range.s.r + 1; r <= range.e.r; r++) {
            const row = {};
            for (let c = range.s.c; c <= range.e.c; c++) {
              const cell = sheet[XLSX.utils.encode_cell({ r, c })];
              if (!cell) continue;
              const key = headers[c - range.s.c];
              // cell.l.Target is the hyperlink URL when present (SheetJS docs).
              // Otherwise fall back to the formatted text (w) or raw value (v).
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

    // CSV path
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        if (res.errors?.length) {
          console.warn("CSV parse warnings:", res.errors);
        }
        onParsed(res.data);
      },
      error: (err) => setError(err.message),
    });
  };

  const runImport = async () => {
    if (parsed.length === 0) return;
    if (!confirm(`Import ${parsed.length} events as DRAFTS? You can publish them after review.`)) return;
    setImporting(true);
    setDoneCount(0);

    // Insert in batches of 50 to keep payloads reasonable.
    const batchSize = 50;
    try {
      for (let i = 0; i < parsed.length; i += batchSize) {
        const slice = parsed.slice(i, i + batchSize).map((p) => p.ready);
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

  return (
    <section>
      <div className="rowBetween">
        <h2>Import events</h2>
      </div>

      <div className="adminCard">
        <p>
          Drop a <strong>CSV</strong> or <strong>Excel (.xlsx)</strong> file below. We read the first
          sheet, match column headers automatically, and ignore extras. If you're starting from a Google
          Sheet, <strong>File → Download → Comma Separated Values</strong> (or Microsoft Excel) both work.
        </p>
        <p className="muted">
          Every imported event starts as a <strong>draft</strong> (not published) so you can review before
          they appear on the public catalog. You can edit or delete any of them after import.
        </p>

        <label className="dropZone">
          <input
            type="file"
            accept=".csv,text/csv,.xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <span>Click to choose a CSV or Excel file</span>
        </label>

        {error && <p className="errMsg">{error}</p>}

        {parsed.length > 0 && (
          <>
            <h3>Preview ({parsed.length} rows)</h3>
            <div className="tableWrap">
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
                      <td>{p.ready.title}</td>
                      <td>{p.ready.event_date ? new Date(p.ready.event_date).toLocaleDateString() : "—"}</td>
                      <td>{p.ready.vendor || "—"}</td>
                      <td>{p.ready.format || "—"}</td>
                      <td>{p.ready.ce_hours ?? "—"}</td>
                      <td>{p.ready.mb2_exclusive ? "★" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 50 && <p className="muted">…plus {parsed.length - 50} more rows.</p>}
            </div>

            <div className="formActions">
              <button className="ghostBtn" onClick={() => setParsed([])} disabled={importing}>Clear</button>
              <button className="primaryBtn" onClick={runImport} disabled={importing}>
                {importing ? `Importing ${doneCount}/${parsed.length}…` : `Import ${parsed.length} events as drafts`}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
