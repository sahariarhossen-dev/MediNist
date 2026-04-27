import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const tokenRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token") ?? "";
      if (!tokenRegex.test(token)) {
        return json({ error: "Invalid token" }, 400);
      }
      const { data, error } = await admin.rpc("get_invitation_by_token", { _token: token });
      if (error) return json({ error: error.message }, 500);
      const invite = Array.isArray(data) ? data[0] : data;
      if (!invite) return json({ error: "Invitation not found" }, 404);
      return json({
        email: invite.email,
        role: invite.role,
        pharmacyName: invite.pharmacy_name,
        status: invite.status,
        expiresAt: invite.expires_at,
        isExpired: invite.is_expired,
      });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!tokenRegex.test(token)) return json({ error: "Invalid token" }, 400);
    if (fullName.length < 2 || fullName.length > 100) {
      return json({ error: "Full name must be 2-100 characters" }, 400);
    }
    if (password.length < 6 || password.length > 128) {
      return json({ error: "Password must be 6-128 characters" }, 400);
    }

    // 1. Look up + validate invitation
    console.log("[accept-invitation] Looking up token:", token.substring(0, 8) + "...");
    const { data: inviteRows, error: lookupErr } = await admin.rpc("get_invitation_by_token", { _token: token });
    if (lookupErr) {
      console.error("[accept-invitation] Lookup error:", lookupErr.message);
      return json({ error: lookupErr.message }, 500);
    }
    const invite = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;
    if (!invite) {
      console.error("[accept-invitation] Invitation not found");
      return json({ error: "Invitation not found" }, 404);
    }
    if (invite.status !== "pending") {
      console.error("[accept-invitation] Status not pending:", invite.status);
      return json({ error: `Invitation is ${invite.status}` }, 410);
    }
    if (invite.is_expired) {
      console.error("[accept-invitation] Invitation expired");
      return json({ error: "Invitation has expired" }, 410);
    }

    const email = (invite.email as string).toLowerCase();
    console.log("[accept-invitation] Valid invite for:", email, "role:", invite.role);

    // 2. Create auth user (or detect already exists)
    let userId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createErr) {
      console.error("[accept-invitation] createUser error:", createErr.message);
      const msg = createErr.message?.toLowerCase() ?? "";
      const looksExisting =
        msg.includes("already") || msg.includes("registered") || msg.includes("exists");
      if (!looksExisting) {
        return json({ error: "Failed to create account: " + createErr.message }, 400);
      }
      // Account exists from a previous failed attempt — try to recover by signing in.
      console.log("[accept-invitation] User already exists, attempting recovery sign-in");
      const { data: existingSignIn, error: existingSignInErr } =
        await admin.auth.signInWithPassword({ email, password });
      if (existingSignInErr || !existingSignIn.user) {
        return json(
          {
            error:
              "An account with this email already exists. Sign in with your existing password, or ask your admin to remove the account so you can re-register.",
          },
          409
        );
      }
      userId = existingSignIn.user.id;
      console.log("[accept-invitation] Recovered existing user:", userId);
    } else {
      userId = created.user?.id ?? null;
      if (!userId) return json({ error: "Failed to create account" }, 500);
      console.log("[accept-invitation] Created auth user:", userId);
    }

    // 3. Set full_name on profile (created by handle_new_user trigger)
    const { error: nameErr } = await admin.from("profiles").update({ full_name: fullName }).eq("id", userId);
    if (nameErr) console.error("[accept-invitation] Profile name update warning:", nameErr.message);

    // 4. Sign in to get session
    const { data: signIn, error: signInErr } = await admin.auth.signInWithPassword({ email, password });
    if (signInErr || !signIn.session) {
      console.error("[accept-invitation] Sign-in failed:", signInErr?.message);
      return json({ error: "Account created but sign-in failed. Please log in manually." }, 500);
    }
    console.log("[accept-invitation] Signed in, calling accept_staff_invitation RPC");

    // 5. Run accept_staff_invitation as the new user (so auth.uid() works)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
    });
    const { data: acceptRows, error: acceptErr } = await userClient.rpc("accept_staff_invitation", { _token: token });
    if (acceptErr) {
      console.error("[accept-invitation] RPC error:", acceptErr.message, "details:", JSON.stringify(acceptErr));
      return json(
        {
          error: "Failed to link account to pharmacy: " + acceptErr.message,
          code: (acceptErr as { code?: string }).code ?? null,
        },
        500
      );
    }
    const accepted = Array.isArray(acceptRows) ? acceptRows[0] : acceptRows;
    console.log("[accept-invitation] Success! Linked to pharmacy:", accepted?.pharmacy_name);

    return json({
      success: true,
      session: signIn.session,
      user: signIn.user,
      pharmacy: {
        id: accepted?.pharmacy_id,
        name: accepted?.pharmacy_name,
        role: accepted?.role,
      },
    });
  } catch (err) {
    console.error("accept-invitation error:", (err as Error).message);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});