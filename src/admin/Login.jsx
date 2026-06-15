import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import "./admin.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invited, setInvited] = useState(false);

  // Pre-fill email from ?email=… so invite links land with the right address.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pre = params.get("email");
    if (pre && /\S+@\S+\.\S+/.test(pre)) {
      setEmail(pre);
      setInvited(true);
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      // Pre-flight: only send a magic link if this email has actually been
      // invited (exists in admins or pending_invites). Prevents random people
      // from triggering sign-in emails by typing arbitrary addresses.
      const { data: hasAccess, error: checkErr } = await supabase.rpc(
        "email_has_admin_access",
        { p_email: email }
      );
      if (checkErr) throw checkErr;
      if (!hasAccess) {
        setError(
          "This email doesn't have admin access. Double-check the spelling, or contact support@dentlogics.com if you think you should have access."
        );
        setBusy(false);
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
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
      <div className="adminCard" style={{ maxWidth: 440, margin: "80px auto" }}>
        <h2>Admin sign-in</h2>
        {invited && !sent ? (
          <p className="muted">
            You've been invited. Confirm your email below and we'll send you a one-time link.
          </p>
        ) : (
          <p className="muted">We'll email you a one-time link. No password required.</p>
        )}

        {sent ? (
          <p>
            ✓ Check <strong>{email}</strong> and click the link to finish signing in.
            {invited && (
              <span className="muted" style={{ display: "block", marginTop: 10, fontSize: 13 }}>
                You'll be added to your team automatically as soon as you sign in.
              </span>
            )}
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
