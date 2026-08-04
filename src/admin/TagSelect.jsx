import { useEffect, useMemo, useRef, useState } from "react";
import "./admin.css";
import "./on-demand-admin.css";

/* ============================================================
   TagSelect — a multi-select dropdown for taxonomy fields
   (Roles, Categories). Shows a dropdown of prepopulated options
   with checkboxes; selected values render as chips in the
   control. Optionally allows adding a brand-new option from
   inside the dropdown (persisted via onAddNew).

   Props:
   - options: string[]           all saved options
   - value: string[]             currently selected
   - onChange(next: string[])    selection changed
   - placeholder: string         shown when nothing selected
   - addLabel: string            e.g. "role" / "category" — enables
                                 the "+ Add new…" row when set
   - onAddNew(name) => void      persist a new option (optional)
   ============================================================ */
export default function TagSelect({
  options = [],
  value = [],
  onChange,
  placeholder = "Select…",
  addLabel = "",
  onAddNew,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const wrapRef = useRef(null);

  const selected = Array.isArray(value) ? value : [];

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setAdding(false);
        setSearch("");
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") { setOpen(false); setAdding(false); }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Union of saved options + any stray selected values so old tags render.
  const allOptions = useMemo(() => {
    const seen = new Set(options.map((o) => o.toLowerCase()));
    const strays = selected.filter((v) => !seen.has(v.toLowerCase()));
    return [...options, ...strays];
  }, [options, selected]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((o) => o.toLowerCase().includes(q));
  }, [allOptions, search]);

  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter((v) => v !== opt));
    else onChange([...selected, opt]);
  };

  const removeChip = (opt, e) => {
    e.stopPropagation();
    onChange(selected.filter((v) => v !== opt));
  };

  const commitNew = () => {
    const v = newText.trim();
    if (!v) { setAdding(false); setNewText(""); return; }
    if (!selected.some((s) => s.toLowerCase() === v.toLowerCase())) {
      onChange([...selected, v]);
    }
    if (typeof onAddNew === "function") onAddNew(v);
    setNewText("");
    setAdding(false);
  };

  return (
    <div className="odTagSelect" ref={wrapRef}>
      {/* Control — looks like an input, opens the dropdown */}
      <button
        type="button"
        className={`odTagSelectControl ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="odTagSelectChips">
          {selected.length === 0 ? (
            <span className="odTagSelectPlaceholder">{placeholder}</span>
          ) : (
            selected.map((v) => (
              <span key={v} className="odTagSelectChip">
                {v}
                <span
                  className="odTagSelectChipX"
                  role="button"
                  aria-label={`Remove ${v}`}
                  onClick={(e) => removeChip(v, e)}
                >×</span>
              </span>
            ))
          )}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="odTagSelectChev">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="odTagSelectMenu" role="listbox">
          {allOptions.length > 8 && (
            <div className="odTagSelectSearchWrap">
              <input
                type="text"
                className="odTagSelectSearch"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="odTagSelectList">
            {visible.length === 0 ? (
              <div className="odTagSelectEmpty muted">No matches</div>
            ) : (
              visible.map((opt) => {
                const isSel = selected.includes(opt);
                return (
                  <label key={opt} className={`odTagSelectItem ${isSel ? "selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(opt)}
                    />
                    <span className="odTagSelectItemLabel">{opt}</span>
                    {isSel && <span className="odTagSelectItemCheck" aria-hidden="true">✓</span>}
                  </label>
                );
              })
            )}
          </div>

          {addLabel && (
            <div className="odTagSelectFooter">
              {adding ? (
                <div className="odTagSelectAddRow">
                  <input
                    type="text"
                    className="odTagSelectSearch"
                    autoFocus
                    placeholder={`New ${addLabel} name`}
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitNew(); }
                      if (e.key === "Escape") { setAdding(false); setNewText(""); }
                    }}
                  />
                  <button type="button" className="primaryBtn odTagSelectAddBtn" onClick={commitNew}>Add</button>
                </div>
              ) : (
                <button
                  type="button"
                  className="odTagSelectAddNew"
                  onClick={() => setAdding(true)}
                >
                  + Add new {addLabel}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
