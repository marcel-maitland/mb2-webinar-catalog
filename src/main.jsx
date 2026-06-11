import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import AdminApp from "./admin/AdminApp.jsx";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public catalog. Iframes from learn.dentlogics.com hit
            "/" or "/?exclusive=1" exactly like before. */}
        <Route path="/" element={<App />} />

        {/* Admin panel — auth-gated inside AdminApp. */}
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
