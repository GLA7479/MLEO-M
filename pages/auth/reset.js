import { useState } from "react";
import { supabaseMP } from "../../lib/supabaseClients";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!password || password.length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setMsg("");
    const { error } = await supabaseMP.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMsg(error.message);
    } else {
      window.location.href = "/mining";
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-white">
      <form
        className="w-[92%] max-w-md space-y-4 rounded-xl border border-white/10 bg-neutral-900 p-6 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <div>
          <h1 className="mb-1 text-2xl font-bold">Set a new password</h1>
          <p className="text-sm text-white/70">
            Enter a new password to secure your account.
          </p>
        </div>
        <label htmlFor="mleo-reset-password" className="sr-only">
          New password
        </label>
        <input
          id="mleo-reset-password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          autoComplete="new-password"
          className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-yellow-400 px-4 py-2 font-bold text-black hover:bg-yellow-300 disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save"}
        </button>
        {msg ? (
          <div
            className="text-sm text-red-400"
            role="alert"
            aria-live="assertive"
          >
            {msg}
          </div>
        ) : null}
      </form>
    </main>
  );
}
