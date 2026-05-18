import { createClient } from "@supabase/supabase-js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function configuredPasswords() {
  return [
    process.env.ENTRY_PASSWORD,
    ...(process.env.ENTRY_PASSWORDS || "").split(","),
  ]
    .map((password) => String(password || "").trim())
    .filter(Boolean);
}

function requirePassword(event) {
  const suppliedPassword = event.headers["x-entry-password"] || "";
  const passwords = configuredPasswords();
  return passwords.length > 0 && passwords.includes(String(suppliedPassword));
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const missing = [
      !url ? "SUPABASE_URL or VITE_SUPABASE_URL" : null,
      !key ? "SUPABASE_SERVICE_ROLE_KEY" : null,
    ].filter(Boolean);
    throw new Error(`Supabase service credentials are not configured: missing ${missing.join(", ")}`);
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function handler(event) {
  try {
    if (!requirePassword(event)) {
      return json(401, { error: "Entry password required" });
    }

    const supabase = getSupabase();

    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      const { data, error } = await supabase
        .from("scorecard_player_cards")
        .select("*")
        .eq("season_id", params.season_id || "")
        .eq("played_date", params.played_date || "");
      if (error) throw error;
      return json(200, { cards: data || [] });
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const { error } = await supabase
        .from("scorecard_player_cards")
        .upsert(payload, { onConflict: "season_id,played_date,member_id" });
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (event.httpMethod === "DELETE") {
      const payload = JSON.parse(event.body || "{}");
      const { error } = await supabase
        .from("scorecard_player_cards")
        .delete()
        .eq("season_id", payload.season_id || "")
        .eq("played_date", payload.played_date || "")
        .eq("member_id", payload.member_id || "");
      if (error) throw error;
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error?.message || String(error) });
  }
}
