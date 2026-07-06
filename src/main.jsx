import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import AdminApp from "./admin/AdminApp.jsx";
import PortalAuth from "./admin/PortalAuth.jsx";
import OnDemand from "./OnDemand.jsx";
import UnifiedCatalog from "./UnifiedCatalog.jsx";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Portal sign-in: the URL itself is the credential. */}
        <Route path="/portal/:token" element={<PortalAuth />} />

        {/* On-demand catalog (public, standalone) */}
        <Route path="/on-demand" element={<OnDemand />} />

        {/* UNIFIED CATALOG — tabs between On-Demand and Live Events.
            Designed for TI iframe embeds:
              /all         → default (MB2)
              /all/:slug   → specific client, e.g. /all/mb2 */}
        <Route path="/all" element={<UnifiedCatalog />} />
        <Route path="/all/:slug" element={<UnifiedCatalog />} />

        {/* Admin dashboard (auth-gated inside AdminApp). */}
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
