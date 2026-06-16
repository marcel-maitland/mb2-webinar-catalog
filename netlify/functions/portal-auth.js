// Portal auth — exchange a long-lived portal token for a one-time
// Supabase magic-link token_hash that the frontend uses to verifyOtp.
//
// Flow:
//   1. Frontend POSTs { token } to this function
//   2. We look up the token in admins (super admin URL) or clients (per-client URL)
//   3. For client URLs, we auto-create a portal user (one per client) on first use
//   4. We use Supabase Admin API to mint a magic link
//   5. We return the hashed_token to the frontend
//   6. Frontend calls supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
//   7. Session is created in the browser
//
// Required Netlify environment variables:
//   - SUPABASE_URL                   (same as VITE_SUPABASE_URL)
//   - SUPABASE_SERVICE_ROLE_KEY      (the secret service role key — NOT the anon key)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method not allowed" });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(500, {
      error: "Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  let token;
  try {
    const body = JSON.parse(event.body || "{}");
    token = (body.token || "").trim();
  } catch {
    return json(400, { error: "invalid body" });
  }

  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return json(404, { error: "invalid token format" });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1) Is this a super admin portal token?
    const { data: superAdmin, error: aErr } = await supabase
      .from("admins")
      .select("user_id, email")
      .eq("portal_token", token)
      .eq("is_super_admin", true)
      .maybeSingle();
    if (aErr) throw aErr;

    let userEmail = null;
    let kind = null;

    if (superAdmin) {
      userEmail = superAdmin.email;
      kind = "super_admin";

      await supabase
        .from("admins")
        .update({ portal_last_used_at: new Date().toISOString() })
        .eq("user_id", superAdmin.user_id);
    } else {
      // 2) Otherwise, is this a client portal token?
      const { data: client, error: cErr } = await supabase
        .from("clients")
        .select("id, slug, name, portal_user_id")
        .eq("portal_token", token)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!client) return json(404, { error: "invalid or revoked portal link" });

      kind = "client";

      // 3) Ensure portal user exists for this client.
      //    Run this every visit so a broken first-visit state self-heals.
      const portalEmail = `portal-${client.slug}@portal.dentlogics.com`;
      let portalUserId = client.portal_user_id;

      if (!portalUserId) {
        const createRes = await supabase.auth.admin.createUser({
          email: portalEmail,
          email_confirm: true,
          user_metadata: {
            kind: "portal",
            client_slug: client.slug,
            client_name: client.name,
          },
        });
        portalUserId = createRes.data?.user?.id;

        // If create failed (already exists), find the existing user.
        if (!portalUserId) {
          const { data: listed } = await supabase.auth.admin.listUsers();
          const existing = (listed?.users || []).find(
            (u) => (u.email || "").toLowerCase() === portalEmail.toLowerCase()
          );
          portalUserId = existing?.id;
        }
        if (!portalUserId) throw new Error("Could not provision portal user");
      }

      // 3a) Always ensure admins row exists. Insert-if-not-exists pattern,
      //     using maybeSingle + insert because not all schemas have a unique
      //     constraint on user_id that upsert can rely on.
      const { data: existingAdmin } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", portalUserId)
        .maybeSingle();
      if (!existingAdmin) {
        const { error: insErr } = await supabase
          .from("admins")
          .insert({
            user_id: portalUserId,
            email: portalEmail,
            is_super_admin: false,
          });
        if (insErr) console.error("admins insert failed:", insErr);
      }

      // 3b) Always ensure client_admins row exists for this client.
      const { data: existingMembership } = await supabase
        .from("client_admins")
        .select("user_id")
        .eq("user_id", portalUserId)
        .eq("client_id", client.id)
        .maybeSingle();
      if (!existingMembership) {
        const { error: caErr } = await supabase
          .from("client_admins")
          .insert({
            user_id: portalUserId,
            client_id: client.id,
            email: portalEmail,
          });
        if (caErr) {
          // Retry without the email column in case the schema doesn't have it.
          const { error: caErr2 } = await supabase
            .from("client_admins")
            .insert({
              user_id: portalUserId,
              client_id: client.id,
            });
          if (caErr2) {
            console.error("client_admins insert failed:", caErr2);
            throw new Error(
              "Could not grant portal user access to client: " + caErr2.message
            );
          }
        }
      }

      // 3c) Save portal_user_id back if it was missing.
      if (!client.portal_user_id) {
        await supabase
          .from("clients")
          .update({ portal_user_id: portalUserId })
          .eq("id", client.id);
      }

      userEmail = portalEmail;

      await supabase
        .from("clients")
        .update({ portal_last_used_at: new Date().toISOString() })
        .eq("id", client.id);
    }

    // 4) Mint a one-time magic link via admin API.
    const { data: linkData, error: linkErr } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: userEmail,
      });
    if (linkErr) throw linkErr;

    const hashed = linkData?.properties?.hashed_token;
    if (!hashed) throw new Error("Could not generate magic link");

    return json(200, {
      kind,
      token_hash: hashed,
    });
  } catch (err) {
    console.error("portal-auth error:", err);
    return json(500, { error: err.message || "Unknown error" });
  }
};
