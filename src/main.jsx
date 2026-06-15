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
        {/* Root is the admin login. Once signed in, AdminApp shows the dashboard.
            Note: the *deeper* admin pages still live under /admin/* (legacy),
            and any internal nav routes there. */}
        <Route path="/" element={<AdminApp />} />
        <Route path="/admin/*" element={<AdminApp />} />

        {/* Public catalog by client slug.
            "/:slug"   — primary, e.g. /mb2
            "/c/:slug" — legacy alias, kept so old links don't break. */}
        <Route path="/c/:slug" element={<App />} />
        <Route path="/:slug" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
