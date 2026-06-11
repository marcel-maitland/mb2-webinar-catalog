import { useState } from "react";
import Papa from "papaparse";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { csvRowToEvent } from "../lib/normalize-csv.js";

export default function ImportCsv() {
  const navigate = useNavigate();
  const [parsed, setParsed] = useState([]);  // [{ raw, ready }]
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const handleFile = (file) => {
    if (!file) return;
    setError("");
    setParsed([]);
    setDoneCount(0);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        if (res.errors?.length) {
          console.warn("CSV parse warnings:", res.errors);
        }
        const rows = (res.data || []).filter((r) =>
          Object.values(r).some((v) => String(v ?? "").trim() !== "")
        );
        setParsed(rows.map((raw) => ({ raw, ready: csvRowToEvent(raw) })));
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
        <h2>Import events from CSV</h2>
      </div>

      <div className="adminCard">
        <p>
          Export your Google Sheet as <strong>File → Download → Comma Separated Values (.csv)</strong>{" "}
          and drop it below. We'll match column headers automatically — extra columns are ignored.
        </p>
        <p className="muted">
          Every imported event starts as a <strong>draft</strong> (not published) so you can review before
          they appear on the public catalog. You can edit or delete any of them after import.
        </p>

        <label className="dropZone">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <span>Click to choose a CSV file</span>
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
