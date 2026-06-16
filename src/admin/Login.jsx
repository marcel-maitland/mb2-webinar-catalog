import { useEffect, useState } from "react";
import "./admin.css";
import "./login.css";

/**
 * Public landing page.
 *
 * User enters email → we look it up server-side → if it's on a client's
 * approved list, we email them their portal URL. The URL itself is the
 * credential — they bookmark it from the email, can revisit any time.
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
    <div className="signinPage">
      {/* LEFT — branded hero */}
      <aside className="signinHero">
        <div className="signinHeroLogo">
          <span className="signinHeroLogoMark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l4 8 8 2-6 6 1 8-7-4-7 4 1-8-6-6 8-2 4-8z"
                    fill="#fff" />
            </svg>
          </span>
          <span className="signinHeroLogoText">DENTLOGICS</span>
        </div>

        <div className="signinHeroBody">
          <h1 className="signinHeroTitle">
            Custom Events<br />Management Portal
          </h1>
          <p className="signinHeroSubtitle">
            One place for your team to manage every continuing education event,
            vendor webinar, and live training your practice runs.
          </p>

          <ul className="signinHeroFeatures">
            <li>Custom-branded events catalog</li>
            <li>Manage vendor webinars</li>
            <li>Manage live events</li>
          </ul>
        </div>

        <div className="signinHeroFooter">
          &copy; Dentlogics &middot; Continuing dental education
        </div>
      </aside>

      {/* RIGHT — form card */}
      <main className="signinFormSide">
        <div className="signinCard">
          {sent ? (
            <>
              <div className="signinEyebrow">CHECK YOUR INBOX</div>
              <h2 className="signinTitle">Link sent</h2>
              <p className="signinDesc">
                If <strong>{email}</strong> is an approved user, you'll receive an
                email shortly with a secure link to your dashboard. Check your
                inbox and spam folder.
              </p>
              <div className="signinSuccessBox">
                <div className="signinSuccessIcon">✓</div>
                <div className="signinSuccessText">
                  The link opens your dashboard directly. Bookmark it from your
                  email so you can return any time.
                </div>
              </div>
              <button
                type="button"
                className="signinLinkBtn"
                onClick={() => { setSent(false); setEmail(""); }}
              >
                ← Use a different email
              </button>
            </>
          ) : (
            <>
              <div className="signinEyebrow">CLIENT PORTAL</div>
              <h2 className="signinTitle">Welcome back</h2>
              <p className="signinDesc">
                Enter your email and we'll send you your dashboard link.
              </p>

              <form onSubmit={submit} noValidate>
                <div className="signinField">
                  <label className="signinLabel" htmlFor="signin-email">EMAIL</label>
                  <div className="signinInputWrap">
                    <span className="signinInputIcon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
                        <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <input
                      id="signin-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@dentlogics.com"
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </div>

                {error && <p className="signinError">{error}</p>}

                <button className="signinBtn" type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Email me my link →"}
                </button>
              </form>

              <p className="signinDisclaimer">
                Don't have access yet? Email{" "}
                <a href="mailto:support@dentlogics.com">support@dentlogics.com</a>.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
