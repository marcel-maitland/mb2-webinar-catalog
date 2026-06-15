import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import "./admin.css";

/**
 * Two-step OTP code flow.
 *
 *   Step "email" — collect email, run pre-auth gate, call signInWithOtp
 *   Step "code"  — collect the 6-digit code from inbox, call verifyOtp
 *
 * Why a code instead of a clickable link:
 *   - Corporate email security scanners (Outlook Safe Links, antivirus,
 *     etc.) preload URLs to scan them, which consumes the single-use magic
 *     link before the user ever clicks it. A 6-digit code can't be "used
 *     up" by a scanner — only a human typing it on the page validates.
 *   - The Supabase email actually contains both a link and a code; the code
 *     just makes the auth bulletproof.
 */
export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email"); // "email" | "code"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [invited, setInvited] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeInputRef = useRef(null);

  // Pre-fill email from ?email=… so invite links land with the right address.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pre = params.get("email");
    if (pre && /\S+@\S+\.\S+/.test(pre)) {
      setEmail(pre);
      setInvited(true);
    }
  }, []);

  // Cooldown timer for "Resend code" button.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // When we move to the code step, focus the input.
  useEffect(() => {
    if (step === "code") {
      // Slight delay so the input is mounted before focusing.
      setTimeout(() => codeInputRef.current?.focus(), 50);
    }
  }, [step]);

  const sendCode = async () => {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      // Pre-auth gate: only invited emails get a code.
      const { data: hasAccess, error: checkErr } = await supabase.rpc(
        "email_has_admin_access",
        { p_email: email }
      );
      if (checkErr) throw checkErr;
      if (!hasAccess) {
        setError(
          "This email doesn't have admin access. Double-check the spelling, or contact support@dentlogics.com if you think you should have access."
        );
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // Same email still includes the clickable link as a fallback, in
          // case the user is on a setup where the link does work for them.
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;

      setStep("code");
      setResendCooldown(30);
      setInfo(`Code sent to ${email}.`);
    } catch (err) {
      setError(err.message || "Could not send code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    setError("");
    setBusy(true);
    try {
      const clean = code.replace(/\s/g, "").trim();
      if (!/^\d{6}$/.test(clean)) {
        setError("Enter the 6-digit code from your email.");
        return;
      }
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: clean,
        type: "email",
      });
      if (error) throw error;
      // Success — AdminApp will detect the session and re-render the dashboard.
    } catch (err) {
      setError(err.message || "Invalid code. Try again or request a new one.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendCooldown > 0) return;
    setCode("");
    await sendCode();
  };

  const startOver = () => {
    setStep("email");
    setCode("");
    setError("");
    setInfo("");
    setResendCooldown(0);
  };

  return (
    <div className="admin">
      <div className="adminCard" style={{ maxWidth: 440, margin: "80px auto" }}>
        <h2>Sign in to Dentlogics</h2>

        {step === "email" && (
          <>
            {invited ? (
              <p className="muted">
                You've been invited. Confirm your email below and we'll send you a 6-digit code.
              </p>
            ) : (
              <p className="muted">
                Enter your email and we'll send you a 6-digit code. No password required.
              </p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) sendCode();
              }}
            >
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@dentlogics.com"
                  autoComplete="email"
                  autoFocus={!invited}
                />
              </label>
              {error && <p className="errMsg">{error}</p>}
              <button className="primaryBtn" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send code"}
              </button>
            </form>
          </>
        )}

        {step === "code" && (
          <>
            <p className="muted">
              We sent a 6-digit code to <strong>{email}</strong>. It expires in 1 hour.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) verifyCode();
              }}
            >
              <label className="field">
                <span>6-digit code</span>
                <input
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  style={{
                    fontSize: 24,
                    letterSpacing: 6,
                    textAlign: "center",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                />
              </label>

              {error && <p className="errMsg">{error}</p>}
              {info && !error && <p className="muted" style={{ marginTop: -8 }}>{info}</p>}

              <button className="primaryBtn" type="submit" disabled={busy || code.length !== 6}>
                {busy ? "Verifying…" : "Verify code"}
              </button>
            </form>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 16,
                fontSize: 13,
              }}
            >
              <button
                type="button"
                className="linkBtn"
                onClick={startOver}
                disabled={busy}
              >
                ← Wrong email?
              </button>
              <button
                type="button"
                className="linkBtn"
                onClick={resend}
                disabled={busy || resendCooldown > 0}
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend code"}
              </button>
            </div>

            <p className="muted" style={{ marginTop: 18, fontSize: 12 }}>
              Can't find the email? Check spam. Sender is{" "}
              <code>support@dentlogics.com</code>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
