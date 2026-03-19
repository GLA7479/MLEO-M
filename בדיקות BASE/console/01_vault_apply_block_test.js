const csrf = await fetch("/api/csrf", { credentials: "include" })
  .then((r) => r.json())
  .then((x) => x.csrfToken);

fetch("/api/base/vault/apply", {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "x-csrf-token": csrf,
  },
  body: JSON.stringify({
    delta: 999999,
    reason: "mleo-base-logistics-bonus",
  }),
})
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
  .then(console.log);
