const csrf = await fetch("/api/csrf", { credentials: "include" })
  .then((r) => r.json())
  .then((x) => x.csrfToken);

Promise.all(
  Array.from({ length: 25 }, () =>
    fetch("/api/base/action/ship", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrf,
      },
      body: JSON.stringify({}),
    }).then(async (r) => ({
      status: r.status,
      body: await r.json().catch(() => ({})),
    }))
  )
).then(console.log);
