// Request-portal-link
//
// Public-facing endpoint that lets a user request their portal URL by entering
// an email. Flow:
//   1. User types email at the landing page
//   2. We look up the email across client_admins and pending_invites
//   3. If found, send them an email (via Resend) containing the portal URL
//      for whichever client they belong to
//   4. ALWAYS return { sent: true } so attackers can't enumerate which
//      emails are approved
//
// Required Netlify environment variables:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - RESEND_API_KEY        (paste your Resend API key starting with `re_`)
//   - PORTAL_FROM_EMAIL     (optional; defaults to "Dentlogics <support@dentlogics.com>")
//   - PORTAL_SITE_URL       (optional; defaults to "https://events.dentlogics.com")

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL =
  process.env.PORTAL_FROM_EMAIL || "Dentlogics <support@dentlogics.com>";
const SITE_URL =
  process.env.PORTAL_SITE_URL || "https://events.dentlogics.com";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// Inline branded HTML for the email body.
const renderEmail = ({ clientName, portalUrl }) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Your ${clientName} Dentlogics dashboard</title>
</head>
<body style="margin:0; padding:0; background:#F4F6F8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#0F172A;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4F6F8;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px; max-width:560px;">
      <tr><td align="center" style="padding:0 0 24px 0; font-size:20px; font-weight:700; letter-spacing:-0.4px; color:#0F172A;">Dentlogics</td></tr>
      <tr><td style="background:#FFFFFF; border-radius:14px; padding:40px; box-shadow:0 1px 3px rgba(15,23,42,0.04),0 1px 2px rgba(15,23,42,0.06);">
        <h1 style="font-size:24px; font-weight:700; line-height:1.25; color:#0F172A; margin:0 0 12px 0;">Your ${clientName} dashboard</h1>
        <p style="font-size:15px; line-height:1.6; color:#475569; margin:0 0 24px 0;">
          Click the button below to open your ${clientName} admin dashboard. Bookmark this email so you can return any time — your link works on any device.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left">
          <tr><td align="center" bgcolor="#0F766E" style="border-radius:10px;">
            <a href="${portalUrl}" target="_blank" style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:600; color:#FFFFFF; text-decoration:none; border-radius:10px;">Open ${clientName} dashboard →</a>
          </td></tr>
        </table>
        <div style="height:28px; line-height:28px; font-size:28px;">&nbsp;</div>
        <p style="font-size:13px; line-height:1.6; color:#64748B; margin:0 0 6px 0;">Or copy and paste this URL into your browser:</p>
        <p style="font-size:13px; line-height:1.6; color:#0F766E; word-break:break-all; margin:0;">
          <a href="${portalUrl}" target="_blank" style="color:#0F766E; text-decoration:underline;">${portalUrl}</a>
        </p>
        <div style="height:24px; line-height:24px; font-size:24px;">&nbsp;</div>
        <div style="border-top:1px solid #E2E8F0; height:1px; font-size:1px;">&nbsp;</div>
        <div style="height:20px; line-height:20px; font-size:20px;">&nbsp;</div>
        <p style="font-size:13px; line-height:1.6; color:#64748B; margin:0;">
          <strong style="color:#475569;">Keep this URL private.</strong> Anyone with the link can open your ${clientName} dashboard. Don't forward it to people who shouldn't have access. If you ever need a new link, contact support@dentlogics.com.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:24px 8px 0 8px; font-size:12px; line-height:1.6; color:#94A3B8;">
        Questions? Email <a href="mailto:support@dentlogics.com" style="color:#0F766E; text-decoration:none;">support@dentlogics.com</a><br /><br />
        &copy; Dentlogics &middot; Continuing dental education
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

const sendEmail = async ({ to, subject, html }) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend error ${res.status}: ${txt}`);
  }
  return res.json();
};

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method not allowed" });
  if (!SUPABASE_URL || !SERVICE_ROLE || !RESEND_API_KEY) {
    return json(500, {
      error:
        "Server is missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or RESEND_API_KEY.",
    });
  }

  let email;
  try {
    const body = JSON.parse(event.body || "{}");
    email = (body.email || "").trim().toLowerCase();
  } catch {
    return json(400, { error: "invalid body" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "Please enter a valid email." });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Look up the email across active team members and pending invites.
    // We pick the first client we find — typically a user belongs to one.
    let matchedClient = null;

    const { data: caRow } = await supabase
      .from("client_admins")
      .select("client_id, clients ( id, name, portal_token )")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (caRow?.clients?.portal_token) matchedClient = caRow.clients;

    if (!matchedClient) {
      const { data: piRow } = await supabase
        .from("pending_invites")
        .select("client_id, clients ( id, name, portal_token )")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (piRow?.clients?.portal_token) matchedClient = piRow.clients;
    }

    if (matchedClient) {
      const portalUrl = `${SITE_URL}/portal/${matchedClient.portal_token}`;
      await sendEmail({
        to: email,
        subject: `Your ${matchedClient.name} Dentlogics dashboard`,
        html: renderEmail({
          clientName: matchedClient.name,
          portalUrl,
        }),
      });
    }
    // (else: we silently do nothing to avoid leaking which emails are approved)

    return json(200, { sent: true });
  } catch (err) {
    console.error("request-portal-link error:", err);
    // Still return "sent: true" externally so we don't reveal failure to attackers.
    // The real error is in Netlify Functions → Logs.
    return json(200, { sent: true });
  }
};
