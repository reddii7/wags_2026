const FALLBACK_SUPABASE_URL = "https://iwzqzpzskawxrwhttufq.supabase.co";
const TABLE = "scorecard_player_cards";

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

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const missing = [
      !key ? "SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_SERVICE_ROLE_KEY" : null,
    ].filter(Boolean);
    throw new Error(`Supabase service credentials are not configured: missing ${missing.join(", ")}`);
  }
  return { url, key };
}

async function supabaseRest(path, { method = "GET", body, prefer } = {}) {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase REST request failed (${response.status})`);
  }
  return data;
}

export async function handler(event) {
  try {
    if (!requirePassword(event)) {
      return json(401, { error: "Entry password required" });
    }

    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      const query = new URLSearchParams({
        select: "*",
        season_id: `eq.${params.season_id || ""}`,
        played_date: `eq.${params.played_date || ""}`,
      });
      const cards = await supabaseRest(`${TABLE}?${query.toString()}`);
      return json(200, { cards: cards || [] });
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      await supabaseRest(`${TABLE}?on_conflict=season_id,played_date,member_id`, {
        method: "POST",
        body: payload,
        prefer: "resolution=merge-duplicates",
      });
      return json(200, { ok: true });
    }

    if (event.httpMethod === "DELETE") {
      const payload = JSON.parse(event.body || "{}");
      const query = new URLSearchParams({
        season_id: `eq.${payload.season_id || ""}`,
        played_date: `eq.${payload.played_date || ""}`,
        member_id: `eq.${payload.member_id || ""}`,
      });
      await supabaseRest(`${TABLE}?${query.toString()}`, { method: "DELETE" });
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error?.message || String(error) });
  }
}
