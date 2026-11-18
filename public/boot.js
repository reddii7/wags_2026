(function () {
  try {
    var current = new URL(location.href);
    var stamp = Number(current.searchParams.get("boot") || 0);
    if (stamp && Date.now() - stamp < 15000) return;
    var u = new URL("/", location.origin);
    u.searchParams.set("boot", String(Date.now()));
    location.href = u.toString();
  } catch (e) {}
})();
