import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import "./admin.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // After clicking the link, land on /admin
          emailRedirectTo: `${window.location.origin}/admin`,
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not send magic link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin">
      <div className="adminCard" style={{ maxWidth: 420, margin: "80px auto" }}>
        <h2>Admin sign-in</h2>
        <p className="muted">We'll email you a one-time link. No password required.</p>

        {sent ? (
          <p>
            ✓ Check <strong>{email}</strong> and click the link to finish signing in.
          </p>
        ) : (
          <form onSubmit={submit}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@dentlogics.com"
              />
            </label>
            {error && <p className="errMsg">{error}</p>}
            <button className="primaryBtn" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
