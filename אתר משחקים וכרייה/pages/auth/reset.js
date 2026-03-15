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
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="w-[92%] max-w-md bg-neutral-900 p-6 rounded-xl border border-white/10 shadow-lg space-y-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Set a new password</h1>
          <p className="text-sm text-white/70">
            Enter a new password to secure your account.
          </p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          className="w-full border border-white/10 rounded-lg px-3 py-2 bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />
        <button
          onClick={submit}
          disabled={loading}
          className="w-full px-4 py-2 bg-yellow-400 text-black rounded-xl font-bold hover:bg-yellow-300 disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save"}
        </button>
        {msg && <div className="text-sm text-red-400">{msg}</div>}
      </div>
    </main>
  );
}

