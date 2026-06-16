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
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Your ${clientName} Dentlogics dashboard</title>
  <style>
    @media only screen and (max-width:600px) {
      .container { width:100% !important; padding:16px !important; }
      .card { padding:28px 24px !important; }
      .h1 { font-size:22px !important; }
      .btn-link { display:block !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#F4F6F8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; color:#0F172A;">

  <!-- Preheader (preview text in inbox list, hidden in body) -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#F4F6F8;">
    Your ${clientName} dashboard link is ready. Click to open, bookmark for later.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4F6F8;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" class="container" style="width:560px; max-width:560px;">

        <!-- Brand wordmark -->
        <tr><td align="center" style="padding:0 0 28px 0;">
          <div style="font-size:22px; font-weight:700; letter-spacing:-0.6px; color:#0F172A;">Dentlogics</div>
        </td></tr>

        <!-- Main card -->
        <tr><td class="card" style="background:#FFFFFF; border-radius:16px; padding:44px 40px; box-shadow:0 1px 3px rgba(15,23,42,0.04),0 1px 2px rgba(15,23,42,0.06);">

          <!-- Eyebrow + title -->
          <div style="font-size:12px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:#0F766E; margin:0 0 10px 0;">Your dashboard is ready</div>
          <h1 class="h1" style="font-size:26px; font-weight:700; line-height:1.2; color:#0F172A; margin:0 0 16px 0;">${clientName}</h1>

          <p style="font-size:15px; line-height:1.65; color:#475569; margin:0 0 28px 0;">
            Click below to open your dashboard. <strong style="color:#334155;">Bookmark this email</strong> so you can return any time — your link works on any device, any time, no sign-in needed.
          </p>

          <!-- CTA button (own row, full-width on mobile) -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr><td>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr><td bgcolor="#0F766E" style="border-radius:10px; box-shadow:0 1px 2px rgba(15,118,110,0.25);">
                  <a class="btn-link" href="${portalUrl}" target="_blank" style="display:inline-block; padding:14px 30px; font-size:15px; font-weight:600; color:#FFFFFF; text-decoration:none; border-radius:10px; mso-padding-alt:0;">
                    Open ${clientName} dashboard&nbsp;&rarr;
                  </a>
                </td></tr>
              </table>
            </td></tr>
          </table>

          <!-- Spacer -->
          <div style="height:32px; line-height:32px; font-size:32px;">&nbsp;</div>

          <!-- URL fallback in a soft chip-style box -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr><td style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:14px 16px;">
              <div style="font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:#94A3B8; margin:0 0 6px 0;">Or copy this URL</div>
              <div style="font-family:ui-monospace,'SF Mono',Menlo,Monaco,Consolas,monospace; font-size:12px; line-height:1.5; color:#475569; word-break:break-all;">
                <a href="${portalUrl}" target="_blank" style="color:#0F766E; text-decoration:none;">${portalUrl}</a>
              </div>
            </td></tr>
          </table>

          <!-- Divider -->
          <div style="height:28px; line-height:28px; font-size:28px;">&nbsp;</div>
          <div style="border-top:1px solid #E2E8F0; height:1px; font-size:1px; line-height:1px;">&nbsp;</div>
          <div style="height:20px; line-height:20px; font-size:20px;">&nbsp;</div>

          <!-- Security callout -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td valign="top" width="32" style="padding-top:2px;">
                <div style="width:24px; height:24px; border-radius:50%; background:#FEF3C7; text-align:center; line-height:24px; font-size:13px;">&#128274;</div>
              </td>
              <td style="padding-left:10px;">
                <div style="font-size:13px; font-weight:600; color:#475569; margin:0 0 4px 0;">Keep this URL private</div>
                <div style="font-size:13px; line-height:1.6; color:#64748B;">
                  Anyone with the link can open your ${clientName} dashboard. Don't forward it to people who shouldn't have access. Need a new link? Email <a href="mailto:support@dentlogics.com" style="color:#0F766E; text-decoration:underline;">support@dentlogics.com</a>.
                </div>
              </td>
            </tr>
          </table>

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:28px 8px 0 8px; font-size:12px; line-height:1.6; color:#94A3B8;">
          Questions? Email <a href="mailto:support@dentlogics.com" style="color:#0F766E; text-decoration:none;">support@dentlogics.com</a>
          <br /><br />
          &copy; Dentlogics &middot; Continuing dental education
        </td></tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;

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
    console.log("[portal-link] lookup for email:", email);

    // Two-step lookup so we don't rely on Supabase auto-join (foreign-key
    // resolution) which has been flaky in our schema.

    // Step 1 — search client_admins for an active member.
    let clientId = null;
    let source = null;

    {
      const { data, error } = await supabase
        .from("client_admins")
        .select("client_id")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (error) console.error("[portal-link] client_admins err:", error);
      else console.log("[portal-link] client_admins row:", data);
      if (data?.client_id) {
        clientId = data.client_id;
        source = "client_admins";
      }
    }

    // Step 2 — fall back to pending_invites if no active membership.
    if (!clientId) {
      const { data, error } = await supabase
        .from("pending_invites")
        .select("client_id")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (error) console.error("[portal-link] pending_invites err:", error);
      else console.log("[portal-link] pending_invites row:", data);
      if (data?.client_id) {
        clientId = data.client_id;
        source = "pending_invites";
      }
    }

    // Step 3 — load the client row.
    let matchedClient = null;
    if (clientId) {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, portal_token")
        .eq("id", clientId)
        .maybeSingle();
      if (error) console.error("[portal-link] clients err:", error);
      else console.log("[portal-link] client row:", data);
      if (data?.portal_token) matchedClient = data;
    }

    console.log(
      "[portal-link] resolution:",
      matchedClient
        ? { source, client: matchedClient.name, hasToken: true }
        : { source, matched: false }
    );

    if (matchedClient) {
      const portalUrl = `${SITE_URL}/portal/${matchedClient.portal_token}`;
      console.log("[portal-link] sending email to:", email);
      const result = await sendEmail({
        to: email,
        subject: `Your ${matchedClient.name} Dentlogics dashboard`,
        html: renderEmail({
          clientName: matchedClient.name,
          portalUrl,
        }),
      });
      console.log("[portal-link] sendEmail result:", result);
    }
    // (else: we silently do nothing to avoid leaking which emails are approved)

    return json(200, { sent: true });
  } catch (err) {
    console.error("[portal-link] error:", err);
    // Still return "sent: true" externally so we don't reveal failure to attackers.
    // The real error is in Netlify Functions → Logs.
    return json(200, { sent: true });
  }
};
