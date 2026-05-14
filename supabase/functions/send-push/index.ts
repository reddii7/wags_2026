/**
 * send-push — broadcast a Web Push notification to all subscribed devices.
 *
 * Called by:
 *   • Admin "Send notification" UI (manual broadcast)
 *   • Supabase DB webhook when rounds.finalized flips to true (auto results alert)
 *
 * Body (JSON):
 *   { title: string, body: string, url?: string, tag?: string }
 *
 * Requires Supabase secrets:
 *   VAPID_PUBLIC_KEY   — base64url VAPID public key
 *   VAPID_PRIVATE_KEY  — base64url VAPID private key
 *   VAPID_SUBJECT      — mailto: or https: contact URL
 *   SUPABASE_URL       — set automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — set automatically by Supabase
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@wags.golf";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const { title, body, url = "/", tag = "wags-notification" } = await req.json();

    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: "title and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");

    if (subErr) throw subErr;
    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No subscribers" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = JSON.stringify({ title, body, url, tag });
    const staleIds: string[] = [];
    const errors: string[] = [];
    let sent = 0;

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 86400, urgency: "normal" },
          );
          sent++;
        } catch (err: any) {
          const status = err.statusCode ?? err.status ?? "unknown";
          const msg = err.body ?? err.message ?? String(err);
          errors.push(`[${status}] ${msg}`);
          // 404 / 410 = subscription expired or unsubscribed — clean up
          if (status === 404 || status === 410) {
            staleIds.push(sub.id);
          }
          console.warn("[send-push] delivery error:", status, msg);
        }
      }),
    );

    // Prune stale subscriptions
    if (staleIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", staleIds);
    }

    return new Response(
      JSON.stringify({ sent, stale_removed: staleIds.length, total: subs.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[send-push] error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
