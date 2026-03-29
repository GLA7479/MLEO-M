const STATUS_UI = {
  idle: {
    title: "Ready to start",
    message: "Choose your action to begin a session.",
    tone: "border-white/15 bg-white/5 text-zinc-100",
  },
  loading: {
    title: "Loading",
    message: "Preparing session data...",
    tone: "border-blue-400/30 bg-blue-500/10 text-blue-100",
  },
  pending_migration: {
    title: "Server setup pending",
    message: "This game endpoint is not fully migrated yet. Try again later.",
    tone: "border-amber-400/35 bg-amber-500/10 text-amber-100",
  },
  unavailable: {
    title: "Temporarily unavailable",
    message: "This game is not available right now.",
    tone: "border-red-400/35 bg-red-500/10 text-red-100",
  },
  ready: {
    title: "Session service ready",
    message: "You can continue when action controls are enabled.",
    tone: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  },
  action_disabled: {
    title: "Action unavailable",
    message: "Primary action is disabled until requirements are met.",
    tone: "border-zinc-400/30 bg-zinc-500/10 text-zinc-100",
  },
};

export default function SoloV2StatusPanel({ status = "idle", details = "" }) {
  const current = STATUS_UI[status] || STATUS_UI.idle;

  return (
    <section className={`rounded-xl border px-3 py-3 text-center lg:px-2.5 lg:py-2 ${current.tone}`}>
      <h2 className="text-sm font-bold lg:text-xs">{current.title}</h2>
      <p className="mt-1 text-xs opacity-90 lg:mt-0.5 lg:text-[11px]">{current.message}</p>
      {details ? <p className="mt-1 text-[11px] opacity-80">{details}</p> : null}
    </section>
  );
}
