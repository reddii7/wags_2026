const SCRIPT = `(function () {
  try {
    var current = new URL(location.href);
    var stamp = Number(current.searchParams.get("boot") || 0);
    if (stamp && Date.now() - stamp < 15000) return;
    var u = new URL("/", location.origin);
    u.searchParams.set("boot", String(Date.now()));
    location.href = u.toString();
  } catch (e) {}
})();
`;

export async function handler(event) {
  const path = String(event.path || "");
  if (path.endsWith(".css")) {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/css; charset=UTF-8",
        "Cache-Control": "no-store",
      },
      body: "/* saved home screen stylesheet stand-in */\n",
    };
  }
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/javascript; charset=UTF-8",
      "Cache-Control": "no-store",
    },
    body: SCRIPT,
  };
}
