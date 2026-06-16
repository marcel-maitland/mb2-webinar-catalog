import { useEffect, useState } from "react";
import "./admin.css";

/**
 * Public landing page.
 *
 * User enters email → we look it up server-side → if it's on a client's
 * approved list, we email them their portal URL. The URL itself is the
 * credential — they bookmark it from the email, can revisit any time.
 *
 * We always show the same "check your inbox" message regardless of whether
 * the email was actually found, so attackers can't enumerate approved emails.
 */
export default function Login() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill email from ?email=… if present (legacy invite links).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pre = params.get("email");
    if (pre && /\S+@\S+\.\S+/.test(pre)) {
      setEmail(pre);
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/.netlify/functions/request-portal-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Something went wrong. Try again.");
      }
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin">
      <div className="adminCard" style={{ maxWidth: 440, margin: "80px auto" }}>
        <h2>Sign in to Dentlogics</h2>

        {sent ? (
          <>
            <p>
              ✓ If <strong>{email}</strong> is an approved user, you'll receive an email shortly
              with a secure link to your dashboard. Check your inbox (and spam folder).
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
              The link opens your dashboard directly. Bookmark it from your email so you can
              return any time.
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
              Wrong email?{" "}
              <button
                type="button"
                className="linkBtn"
                onClick={() => { setSent(false); setEmail(""); }}
              >
                Try a different one
              </button>
            </p>
          </>
        ) : (
          <>
            <p className="muted">
              Enter your email and we'll send you your dashboard link.
            </p>

            <form onSubmit={submit}>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@dentlogics.com"
                  autoComplete="email"
                  autoFocus
                />
              </label>
              {error && <p className="errMsg">{error}</p>}
              <button className="primaryBtn" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Email me my link"}
              </button>
            </form>

            <p className="muted" style={{ marginTop: 18, fontSize: 12 }}>
              Don't have access yet? Email{" "}
              <a href="mailto:support@dentlogics.com">support@dentlogics.com</a>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
