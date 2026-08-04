import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import "./admin.css";
import "./on-demand-admin.css";

/* ============================================================
   Category manager for on-demand courses.

   Categories live in the `on_demand_categories` table (see
   supabase/on_demand_categories.sql) so they persist as reusable
   options. This module exports:

   - FALLBACK_CATEGORIES: the original hardcoded presets, used only
     if the table doesn't exist yet (migration not run).
   - fetchCategoryNames(): sorted string[] of saved category names.
   - saveCategoryName(name): persists a new category (no-op if it
     already exists). Used by "+ Add custom category" in the form.
   - <CategoryManagerModal/>: add / rename / delete / reorder UI.
     Rename and delete propagate to every course that uses the tag.
     `onApplied(event)` fires so an open form can update its local
     state: {type:'rename', from, to} | {type:'delete', name} |
     {type:'add', name}.
   ============================================================ */

export const FALLBACK_CATEGORIES = [
  "Regulatory Compliance and Safety",
  "Clinical Excellence and Medical Knowledge",
  "Front Office",
  "Leadership and Practice Management",
  "Professional Development",
];

export async function fetchCategoryNames() {
  const { data, error } = await supabase
    .from("on_demand_categories")
    .select("name, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data) return [...FALLBACK_CATEGORIES];
  if (data.length === 0) return [...FALLBACK_CATEGORIES];
  return data.map((r) => r.name);
}

export async function saveCategoryName(name) {
  return saveTagName("on_demand_categories", name);
}

/* ---------- shared global roles (catalog_roles table) ----------
   One global list of role options shared by live events and
   on-demand courses. See supabase/shared_roles_categories.sql. */

export async function fetchRoleNames() {
  const { data, error } = await supabase
    .from("catalog_roles")
    .select("name, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => r.name);
}

export async function saveRoleName(name) {
  return saveTagName("catalog_roles", name);
}

async function saveTagName(table, name) {
  const v = (name || "").trim();
  if (!v) return;
  // Case-insensitive duplicate check, then insert at the end.
  const { data: existing } = await supabase
    .from(table)
    .select("id, name")
    .ilike("name", v)
    .limit(1);
  if (existing && existing.length > 0) return;
  const { data: maxRow } = await supabase
    .from(table)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = (maxRow?.[0]?.sort_order ?? 90) + 10;
  await supabase.from(table).insert({ name: v, sort_order: nextOrder });
}

/* ---------- propagation helpers ---------- */

async function coursesUsing(name) {
  const { data, error } = await supabase
    .from("on_demand_courses")
    .select("id, categories")
    .contains("categories", [name]);
  if (error) throw error;
  return data || [];
}

async function renameOnCourses(from, to) {
  const rows = await coursesUsing(from);
  for (const row of rows) {
    const next = [
      ...new Set(
        (row.categories || []).map((c) => (c === from ? to : c))
      ),
    ];
    const { error } = await supabase
      .from("on_demand_courses")
      .update({ categories: next })
      .eq("id", row.id);
    if (error) throw error;
  }
  return rows.length;
}

async function removeFromCourses(name) {
  const rows = await coursesUsing(name);
  for (const row of rows) {
    const next = (row.categories || []).filter((c) => c !== name);
    const { error } = await supabase
      .from("on_demand_courses")
      .update({ categories: next })
      .eq("id", row.id);
    if (error) throw error;
  }
  return rows.length;
}

/* ---------- modal ---------- */

export default function CategoryManagerModal({ open, onClose, onApplied }) {
  const [rows, setRows] = useState([]);       // {id, name, sort_order}
  const [counts, setCounts] = useState({});   // name -> course count
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const [{ data: cats, error: cErr }, { data: courses }] = await Promise.all([
      supabase
        .from("on_demand_categories")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase.from("on_demand_courses").select("categories"),
    ]);
    if (cErr) {
      setError(
        cErr.message.includes("does not exist") || cErr.code === "42P01"
          ? "The categories table hasn't been created yet. Run supabase/on_demand_categories.sql in the Supabase SQL editor first."
          : cErr.message
      );
      setRows([]);
    } else {
      setRows(cats || []);
      const tally = {};
      for (const c of courses || []) {
        for (const cat of c.categories || []) {
          tally[cat] = (tally[cat] || 0) + 1;
        }
      }
      setCounts(tally);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      setNewName("");
      setEditingId(null);
      load();
    }
  }, [open]);

  if (!open) return null;

  const notify = (event) => { if (typeof onApplied === "function") onApplied(event); };

  const add = async () => {
    const v = newName.trim();
    if (!v) return;
    if (rows.some((r) => r.name.toLowerCase() === v.toLowerCase())) {
      setError(`"${v}" already exists.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const nextOrder = (rows[rows.length - 1]?.sort_order ?? 90) + 10;
      const { data, error } = await supabase
        .from("on_demand_categories")
        .insert({ name: v, sort_order: nextOrder })
        .select()
        .single();
      if (error) throw error;
      setRows((prev) => [...prev, data]);
      setNewName("");
      notify({ type: "add", name: v });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditText(row.name);
    setError("");
  };

  const commitEdit = async (row) => {
    const to = editText.trim();
    const from = row.name;
    if (!to || to === from) { setEditingId(null); return; }
    if (rows.some((r) => r.id !== row.id && r.name.toLowerCase() === to.toLowerCase())) {
      setError(`"${to}" already exists.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase
        .from("on_demand_categories")
        .update({ name: to })
        .eq("id", row.id);
      if (error) throw error;
      const touched = await renameOnCourses(from, to);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, name: to } : r)));
      setCounts((prev) => {
        const next = { ...prev };
        if (from in next) { next[to] = next[from]; delete next[from]; }
        return next;
      });
      setEditingId(null);
      notify({ type: "rename", from, to, touched });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    const used = counts[row.name] || 0;
    const msg = used > 0
      ? `Delete "${row.name}"?\n\nIt will also be removed from ${used} course${used === 1 ? "" : "s"} currently tagged with it. This cannot be undone.`
      : `Delete "${row.name}"? This cannot be undone.`;
    if (!confirm(msg)) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase
        .from("on_demand_categories")
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      await removeFromCourses(row.name);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setCounts((prev) => {
        const next = { ...prev };
        delete next[row.name];
        return next;
      });
      notify({ type: "delete", name: row.name });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const move = async (index, dir) => {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[index], next[j]] = [next[j], next[index]];
    // Reassign clean sort orders and persist.
    const renumbered = next.map((r, i) => ({ ...r, sort_order: i * 10 }));
    setRows(renumbered);
    setBusy(true);
    try {
      for (const r of renumbered) {
        const { error } = await supabase
          .from("on_demand_categories")
          .update({ sort_order: r.sort_order })
          .eq("id", r.id);
        if (error) throw error;
      }
      notify({ type: "reorder" });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modal odCatMgrModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h3>Manage categories</h3>
          <button type="button" className="modalClose" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modalBody">
          <p className="muted odCatMgrIntro">
            These are the category options offered on every course. Renaming or
            deleting a category updates all courses that use it.
          </p>

          {error && <p className="errMsg odCatMgrErr">{error}</p>}

          {loading ? (
            <div className="odLoading"><div className="spinner" /> Loading…</div>
          ) : (
            <ul className="odCatMgrList">
              {rows.map((row, i) => (
                <li key={row.id} className="odCatMgrRow">
                  <div className="odCatMgrReorder">
                    <button
                      type="button"
                      className="odCatMgrArrow"
                      onClick={() => move(i, -1)}
                      disabled={busy || i === 0}
                      title="Move up"
                      aria-label={`Move ${row.name} up`}
                    >▲</button>
                    <button
                      type="button"
                      className="odCatMgrArrow"
                      onClick={() => move(i, 1)}
                      disabled={busy || i === rows.length - 1}
                      title="Move down"
                      aria-label={`Move ${row.name} down`}
                    >▼</button>
                  </div>

                  {editingId === row.id ? (
                    <div className="odCatMgrEditWrap">
                      <input
                        className="odCatMgrEditInput"
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); commitEdit(row); }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button type="button" className="primaryBtn odCatMgrSmallBtn" disabled={busy} onClick={() => commitEdit(row)}>
                        Save
                      </button>
                      <button type="button" className="ghostBtn odCatMgrSmallBtn" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="odCatMgrName">{row.name}</span>
                      <span className="odCatMgrCount muted">
                        {(counts[row.name] || 0)} course{(counts[row.name] || 0) === 1 ? "" : "s"}
                      </span>
                      <div className="odCatMgrActions">
                        <button
                          type="button"
                          className="odGridCardIconBtn"
                          onClick={() => startEdit(row)}
                          disabled={busy}
                          title="Rename"
                          aria-label={`Rename ${row.name}`}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M4 20l4-1 10-10-3-3L5 16l-1 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="odGridCardIconBtn danger"
                          onClick={() => remove(row)}
                          disabled={busy}
                          title="Delete"
                          aria-label={`Delete ${row.name}`}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M6 7h12M9 7V4h6v3m-7 0v13a1 1 0 001 1h6a1 1 0 001-1V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
              {rows.length === 0 && !error && (
                <li className="odCatMgrEmpty muted">No categories yet — add your first below.</li>
              )}
            </ul>
          )}

          <div className="odCatMgrAddRow">
            <input
              className="odCatMgrEditInput"
              type="text"
              placeholder="New category name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              disabled={busy || loading}
            />
            <button type="button" className="primaryBtn" onClick={add} disabled={busy || loading || !newName.trim()}>
              + Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
