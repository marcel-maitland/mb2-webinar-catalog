import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import "./admin.css";

/**
 * Portal auth landing page.
 *
 * URL pattern: /portal/:token
 *
 * 1) POSTs the token to /.netlify/functions/portal-auth
 * 2) Receives a one-time hashed_token (Supabase magic link)
 * 3) Calls supabase.auth.verifyOtp to create a session in the browser
 * 4) Redirects to /admin (where AdminApp picks up the session)
 *
 * No "sign in" UI is shown — the URL itself is the credential.
 */
export default function PortalAuth() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function exchange() {
      try {
        const res = await fetch("/.netlify/functions/portal-auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          let payload = null;
          try { payload = await res.json(); } catch {}
          throw new Error(
            payload?.error ||
              "This portal link is invalid or has been revoked. Contact your administrator if you think this is a mistake."
          );
        }

        const { token_hash } = await res.json();
        if (!token_hash) {
          throw new Error("Server returned an empty token.");
        }

        // Clear any stale session before installing the new one.
        await supabase.auth.signOut().catch(() => {});

        const { error: vErr } = await supabase.auth.verifyOtp({
          token_hash,
          type: "magiclink",
        });
        if (vErr) throw vErr;

        if (!cancelled) navigate("/admin", { replace: true });
      } catch (e) {
        if (!cancelled) setError(e.message || "Could not open portal.");
      }
    }

    exchange();
    return () => { cancelled = true; };
  }, [token, navigate]);

  if (error) {
    return (
      <div className="admin">
        <div className="adminCard" style={{ maxWidth: 460, margin: "80px auto" }}>
          <h2>Couldn't open your portal</h2>
          <p className="muted" style={{ marginTop: 8 }}>{error}</p>
          <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
            Email <a href="mailto:support@dentlogics.com">support@dentlogics.com</a> if you need a new link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin">
      <div
        className="adminCard"
        style={{ maxWidth: 420, margin: "120px auto", textAlign: "center" }}
      >
        <div
          style={{
            width: 32, height: 32, borderRadius: "50%",
            border: "3px solid #E2E8F0", borderTopColor: "#0F766E",
            margin: "0 auto 18px",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <h2 style={{ marginBottom: 6 }}>Opening Dentlogics…</h2>
        <p className="muted" style={{ marginTop: 0 }}>Just a moment.</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
