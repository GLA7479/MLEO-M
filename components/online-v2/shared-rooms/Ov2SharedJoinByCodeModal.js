import { useState } from "react";

export default function Ov2SharedJoinByCodeModal({ open, onClose, onSubmit, busy }) {
  const [joinCode, setJoinCode] = useState("");
  const [password, setPassword] = useState("");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <div className="w-full max-w-sm rounded-xl border border-white/15 bg-zinc-950 p-3">
        <div className="mb-2 text-sm font-bold text-white">Join by code</div>
        <div className="space-y-2">
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Room code"
            className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white placeholder:text-zinc-500"
          />
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            type="password"
            placeholder="Password (if required)"
            className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white placeholder:text-zinc-500"
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/20 bg-white/10 py-2 text-xs font-semibold text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !joinCode.trim()}
            onClick={() => onSubmit({ join_code: joinCode, password_plaintext: password || null })}
            className="flex-1 rounded-lg border border-sky-500/40 bg-sky-900/40 py-2 text-xs font-bold text-sky-100 disabled:opacity-45"
          >
            {busy ? "Joining..." : "Join room"}
          </button>
        </div>
      </div>
    </div>
  );
}

