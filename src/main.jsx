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
        {/* Public catalog.
            "/" — default client (MB2). Existing TI iframe embeds keep working.
            "/c/:slug" — any client's catalog by their slug. */}
        <Route path="/" element={<App />} />
        <Route path="/c/:slug" element={<App />} />

        {/* Admin panel — auth-gated inside AdminApp. */}
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
