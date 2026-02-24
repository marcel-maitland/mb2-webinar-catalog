/* Collapsible filters */
.filterDetails{
  border:1px solid var(--border);
  border-radius:12px;
  background:#fff;
  margin:0 0 12px;
  overflow:hidden;
}

.filterSummary{
  list-style:none;
  cursor:pointer;
  padding:10px 12px;
  font-weight:800;
  color:var(--muted2);
  display:flex;
  align-items:center;
  justify-content:space-between;
}

.filterSummary::-webkit-details-marker{ display:none; }

.filterSummary::after{
  content:"▾";
  font-size:12px;
  color:var(--muted);
  transform: translateY(-1px);
}

.filterDetails[open] .filterSummary::after{
  content:"▴";
}

.filterBody{
  padding:10px 12px 12px;
}

/* In-person info box */
.inPersonBox{
  margin:12px 0 0;
  background:#f8fafc;
  border:1px solid var(--border);
  border-radius:14px;
  padding:12px;
}

.inPersonBoxGrid{
  display:flex;
  flex-direction:column;
  gap:10px;
}

.inPersonRow{
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:flex-start;
}

.inPersonKey{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:12px;
  font-weight:800;
  color:var(--muted);
  white-space:nowrap;
}

.inPersonIcon{
  color:#475569;
  display:inline-flex;
}

.inPersonVal{
  font-size:13px;
  font-weight:700;
  color:#0f172a;
  text-align:right;
  flex:1;
}

.inPersonActions{
  margin-top:12px;
  display:flex;
  justify-content:flex-end;
}
