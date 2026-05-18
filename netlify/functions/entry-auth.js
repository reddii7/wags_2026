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

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const passwords = configuredPasswords();
  if (!passwords.length) {
    return json(500, { error: "Entry password is not configured" });
  }

  let password = "";
  try {
    password = JSON.parse(event.body || "{}").password || "";
  } catch {
    return json(400, { error: "Invalid request" });
  }

  if (!passwords.includes(String(password))) {
    return json(401, { error: "Incorrect password" });
  }

  return json(200, { ok: true });
}
