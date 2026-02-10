import { useEffect, useMemo, useState } from "react";
import "./App.css";

const DATA_URL = "https://script.google.com/macros/s/AKfycbznqVccaxs37Z3GZmDbmY4HG0CBDMzOmhT7ZhA9aXWnV3dMqHVPchRHDxFKuEb8w0w/exec";

function normalizeListField(v) {
  if (v == null) return [];
  return String(v)
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function formatDate(dateStr, timeStr) {
  const combined = `${dateStr} ${timeStr}`;
  const d = new Date(combined);
  if (isNaN(d)) return combined;
  return d.toLocaleString();
}

export default function App() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedCE, setSelectedCE] = useState(new Set());
  const [selectedPresenter, setSelectedPresenter] = useState(new Set());
  const [selectedCategory, setSelectedCategory] = useState(new Set());

  useEffect(() => {
    fetch(DATA_URL)
      .then(r => r.json())
      .then(data => {
        const parsed = data.items.map(row => ({
          id: row.id,
          title: row["Name of Event"],
          presenter: row["Presenter / Vendor (Tag)"],
          description: row["Description"],
          ce: row["Hours (Tag)"],
          categories: normalizeListField(row["Category Tags"]),
          date: row["Date of the Event"],
          time: row["Time of the event"],
          thumb: row["Thumbnail Link"],
          link: row["Registration Link"],
          length: row["Length"] || ""
        }));
        setItems(parsed);
      });
  }, []);

  const presenters = [...new Set(items.map(i => i.presenter).filter(Boolean))];
  const categories = [...new Set(items.flatMap(i => i.categories))];
  const ceOptions = [...new Set(items.map(i => i.ce).filter(Boolean))];

  const filtered = items.filter(i => {
    const matchesSearch = (i.title + i.description).toLowerCase().includes(query.toLowerCase());
    const matchesCE = selectedCE.size === 0 || selectedCE.has(i.ce);
    const matchesPresenter = selectedPresenter.size === 0 || selectedPresenter.has(i.presenter);
    const matchesCategory = selectedCategory.size === 0 || i.categories.some(c => selectedCategory.has(c));
    return matchesSearch && matchesCE && matchesPresenter && matchesCategory;
  });

  const toggle = (set, value, setter) => {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    setter(next);
  };

  return (
    <div className="page">
      <header className="topbar">
        <h1>MB2 Webinar Catalog</h1>
        <input
          className="search"
          placeholder="Search webinars"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </header>

      <div className="layout">
        <aside className="filters">
          <div className="filterSection">
            <h3>CE Hours</h3>
            {ceOptions.map(opt => (
              <label key={opt}><input type="checkbox" onChange={() => toggle(selectedCE, opt, setSelectedCE)} /> {opt}</label>
            ))}
          </div>

          <div className="filterSection">
            <h3>Presenter</h3>
            {presenters.map(opt => (
              <label key={opt}><input type="checkbox" onChange={() => toggle(selectedPresenter, opt, setSelectedPresenter)} /> {opt}</label>
            ))}
          </div>

          <div className="filterSection">
            <h3>Category</h3>
            {categories.map(opt => (
              <label key={opt}><input type="checkbox" onChange={() => toggle(selectedCategory, opt, setSelectedCategory)} /> {opt}</label>
            ))}
          </div>
        </aside>

        <main className="grid">
          {filtered.map(w => (
            <a className="card" key={w.id} href={w.link} target="_blank">
              <img src={w.thumb} className="thumb" />
              <div className="cardBody">
                <h2>{w.title}</h2>
                <p className="meta">{w.presenter}</p>
                <p>{w.description}</p>
                <div className="footer">
                  <span>{formatDate(w.date, w.time)}</span>
                  <span>{w.ce} CE</span>
                </div>
              </div>
            </a>
          ))}
        </main>
      </div>
    </div>
  );
}
