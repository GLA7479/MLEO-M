import Layout from "./Layout";
import Link from "next/link";
import { useIOSViewportFix } from "../hooks/useIOSViewportFix";

export default function LocalGameShell({
  title,
  subtitle,
  eyebrow,
  children,
  backgroundClass = "bg-gradient-to-b from-[#05070f] via-[#0b0f1c] to-[#05070f]",
  decorative = true,
}) {
  useIOSViewportFix();

  return (
    <Layout title={`${title} — Local Arcade`}>
      <main
        className={`relative min-h-[var(--app-100vh,100vh)] ${backgroundClass} text-white`}
      >
        {decorative && (
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
          </div>
        )}

        <div
          className="relative z-10 mx-auto w-full max-w-5xl px-4 py-6 space-y-6"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
        >
          <div className="flex items-center justify-between">
            <Link
              href="/local-arcade"
              className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 border border-white/20 text-sm font-semibold tracking-widest"
            >
              BACK
            </Link>
            <span className="text-xs uppercase tracking-[0.3em] text-white/60">
              Local Mode
            </span>
          </div>

          <header className="text-center space-y-2">
            {eyebrow && (
              <p className="text-xs uppercase tracking-[0.45em] text-white/60">
                {eyebrow}
              </p>
            )}
            <h1 className="text-4xl font-black">{title}</h1>
            {subtitle && <p className="text-white/75">{subtitle}</p>}
          </header>

          <div className="space-y-6 pb-8">{children}</div>
        </div>
      </main>
    </Layout>
  );
}

