import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

export default function EventsList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | published | drafts | mb2

  const load = async () => {
    setLoading(true);
    setError("");
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("event_date", { ascending: true });
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const togglePublish = async (row) => {
    const next = !row.is_published;
    // optimistic
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_published: next } : r)));
    const { error } = await supabase
      .from("events")
      .update({ is_published: next })
      .eq("id", row.id);
    if (error) {
      // revert
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_published: !next } : r)));
      alert("Failed: " + error.message);
    }
  };

  const toggleMb2 = async (row) => {
    const next = !row.mb2_exclusive;
    // optimistic
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, mb2_exclusive: next } : r)));
    const { error } = await supabase
      .from("events")
      .update({ mb2_exclusive: next })
      .eq("id", row.id);
    if (error) {
      // revert
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, mb2_exclusive: !next } : r)));
      alert("Failed: " + error.message);
    }
  };

  const remove = async (row) => {
    if (!confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("events").delete().eq("id", row.id);
    if (error) return alert("Failed: " + error.message);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filter === "published") return r.is_published;
        if (filter === "drafts") return !r.is_published;
        if (filter === "mb2") return r.mb2_exclusive;
        return true;
      })
      .filter((r) => {
        if (!q) return true;
        return `${r.title} ${r.vendor ?? ""} ${r.category ?? ""}`.toLowerCase().includes(q);
      });
  }, [rows, query, filter]);

  return (
    <section>
      <div className="rowBetween">
        <h2>Events</h2>
        <Link className="primaryBtn" to="/admin/events/new">+ New event</Link>
      </div>

      <div className="filtersBar">
        <input
          className="search"
          placeholder="Search by title, vendor, category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All ({rows.length})</option>
          <option value="published">Published ({rows.filter((r) => r.is_published).length})</option>
          <option value="drafts">Drafts ({rows.filter((r) => !r.is_published).length})</option>
          <option value="mb2">MB2 Exclusive ({rows.filter((r) => r.mb2_exclusive).length})</option>
        </select>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="errMsg">{error}</p>}

      {!loading && !error && (
        <div className="tableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th></th>
                <th>Title</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Format</th>
                <th>MB2</th>
                <th>Publish</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.thumb_url ? (
                      <img className="tinyThumb" src={r.thumb_url} alt="" />
                    ) : (
                      <div className="tinyThumb tinyThumbEmpty" />
                    )}
                  </td>
                  <td>
                    <Link to={`/admin/events/${r.id}`}>{r.title}</Link>
                  </td>
                  <td>{r.event_date ? new Date(r.event_date).toLocaleDateString() : "—"}</td>
                  <td>{r.vendor || "—"}</td>
                  <td>{r.format || "—"}</td>
                  <td>
                    <button
                      type="button"
                      className={`mb2Star ${r.mb2_exclusive ? "mb2StarOn" : ""}`}
                      onClick={() => toggleMb2(r)}
                      title={r.mb2_exclusive ? "Click to remove MB2 Exclusive flag" : "Click to mark as MB2 Exclusive"}
                      aria-label="Toggle MB2 Exclusive"
                    >
                      ★
                    </button>
                  </td>
                  <td>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={!!r.is_published}
                        onChange={() => togglePublish(r)}
                      />
                      <span className="switchSlider" />
                    </label>
                  </td>
                  <td>
                    <button className="ghostBtn danger" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={8} className="muted">No events match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
