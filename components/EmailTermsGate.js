// components/EmailTermsGate.js
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseMP } from "../lib/supabaseClients";

/**
 * TERMS_KEY:
 * Keep the same versioned key pattern already used in the game code so
 * we don't break existing installs. Falls back to "mleo_terms".
 */
const TERMS_KEY =
  (typeof window !== "undefined" &&
    Object.keys(localStorage || {}).find((k) =>
      k.startsWith("mleoMiners_termsAccepted_")
    )) ||
  "mleo_terms";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const RESEND_COOLDOWN_SEC = 30;

/** DEV AUTH BYPASS (client-side only):
 * Active when:
 *   - URL has ?devAuth=1  OR
 *   - location.hostname is "localhost" or endsWith ".local"
 * Behavior:
 *   - Typing a valid email auto-continues to onPassed()
 *   - Clicking "Send link/code" also skips directly
 *   - Terms are auto-accepted (localStorage TERMS_KEY = "yes")
 */
const DEV_AUTH_BYPASS =
  process.env.NEXT_PUBLIC_GATE_DEV_BYPASS === "1";

export default function EmailTermsGate({ onPassed, onClose }) {
  const [step, setStep] = useState("check"); // check | email | wait | terms
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [termsChecked, setTermsChecked] = useState(false);

  const dir =
    (typeof document !== "undefined" &&
      (document.documentElement.getAttribute("dir") || "ltr")) || "ltr";

  // Autofocus helpers
  const emailRef = useRef(null);
  const otpRef = useRef(null);

  // === BYPASS helper ===
  const devAutoPass = () => {
    try { localStorage.setItem(TERMS_KEY, "yes"); } catch {}
    onPassed?.();
  };

  useEffect(() => {
    if (step === "email" && emailRef.current) emailRef.current.focus();
    if ((step === "wait" || step === "email") && otpRef.current) otpRef.current.focus();
  }, [step]);

  // Initial status check: verified? accepted terms? then pass-through
  useEffect(() => {
    let live = true;
    (async () => {
      // If bypass is active → go straight to email step
      if (DEV_AUTH_BYPASS) {
        setStep("email");
        return;
      }
      try {
        const hasTerms =
          typeof window !== "undefined" &&
          localStorage.getItem(TERMS_KEY) === "yes";
        const { data } = await supabaseMP.auth.getSession();
        if (!live) return;

        if (data?.session && hasTerms) {
          onPassed?.();
        } else if (!data?.session) {
          setStep("email");
        } else {
          setStep("terms");
        }
      } catch {
        if (!live) return;
        setStep("email");
      }
    })();
    return () => {
      live = false;
    };
  }, [onPassed]);

  // Resend timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Provider detection for "Open inbox"
  function inboxUrlFor(emailStr) {
    const domain = (emailStr || "").split("@")[1]?.toLowerCase() || "";
    if (domain.includes("gmail.")) return "https://mail.google.com/mail/u/0/#inbox";
    if (domain.includes("outlook.") || domain.includes("hotmail.") || domain.includes("live."))
      return "https://outlook.live.com/mail/0/inbox";
    if (domain.includes("yahoo.")) return "https://mail.yahoo.com/";
    if (domain.includes("icloud.") || domain.includes("me.com") || domain.includes("mac.com"))
      return "https://www.icloud.com/mail";
    // IL popular (keep if needed for your audience)
    if (domain.includes("walla.")) return "https://mail.walla.co.il/";
    if (domain.includes("013.net") || domain.includes("netvision")) return "https://webmail.netvision.net.il/";
    // Default: Gmail web
    return "https://mail.google.com/mail/u/0/#inbox";
  }

  // Try opening Gmail app, then fall back to web
  function openGmailAppOrWeb(emailStr) {
    const web = inboxUrlFor(emailStr);
    const app = "googlegmail://";
    const t = setTimeout(() => window.open(web, "_blank", "noopener,noreferrer"), 400);
    try {
      window.location.href = app;
    } catch {
      clearTimeout(t);
      window.open(web, "_blank", "noopener,noreferrer");
    }
  }

  const canSend = useMemo(() => EMAIL_RE.test(email), [email]);
  const canVerify = useMemo(() => /^\d{6}$/.test(otp), [otp]);

  // === BYPASS: auto-continue as soon as the user types a valid email ===
  useEffect(() => {
    if (DEV_AUTH_BYPASS && EMAIL_RE.test(email)) {
      devAutoPass();
    }
  }, [email]);

  async function sendLink() {
    setErr("");

    // BYPASS: skip network, mark terms accepted, proceed
    if (DEV_AUTH_BYPASS) {
      devAutoPass();
      return;
    }

    if (!canSend) {
      setErr("Please enter a valid email.");
      return;
    }
    setSending(true);
    try {
      const redirect =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined;
      const { error } = await supabaseMP.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirect,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setStep("wait");
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (e) {
      setErr(e?.message || "Couldn't send the email. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp() {
    setErr("");

    // BYPASS: shouldn't be needed, but keep symmetry
    if (DEV_AUTH_BYPASS) {
      devAutoPass();
      return;
    }

    if (!canVerify) {
      setErr("Enter the 6-digit code you received.");
      return;
    }
    setVerifying(true);
    try {
      const { error } = await supabaseMP.auth.verifyOtp({
        email,
        token: otp,
        type: "email",
      });
      if (error) throw error;
      setStep("terms");
      setErr("");
    } catch (e) {
      setErr(e?.message || "Verification failed, please try again.");
    } finally {
      setVerifying(false);
    }
  }

  function acceptTerms() {
    if (!termsChecked) {
      setErr("You must accept the Terms to continue.");
      return;
    }
    try {
      localStorage.setItem(TERMS_KEY, "yes");
    } catch {}
    onPassed?.();
  }

  // Tiny UI helper
  function Pill({ children }) {
    return (
      <span className="inline-block px-2 py-0.5 rounded bg-black/10 text-xs font-semibold">
        {children}
      </span>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur"
      role="dialog"
      aria-modal="true"
      dir={dir}
      style={{
        paddingTop:
          "calc(env(safe-area-inset-top, 0px) + min(8vh, 64px))",
        paddingBottom:
          "calc(env(safe-area-inset-bottom, 0px) + min(4vh, 32px))",
      }}
    >
      <div className="mx-auto w-[92%] max-w-md bg-white text-gray-900 rounded-2xl border border-black/10 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur p-4 border-b border-black/10 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/images/leo-coin-gold.png"
              alt="MLEO"
              className="w-8 h-8 rounded-full object-contain"
            />
            <div className="font-extrabold">Secure Sign-In</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500">
              <Pill>Magic Link</Pill> <Pill>OTP</Pill>
              {DEV_AUTH_BYPASS && <Pill>DEV BYPASS</Pill>}
            </div>
            {/* Close button (dismiss without registering) */}
            <button
              onClick={() => onClose?.()}
              className="ml-2 px-2.5 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-sm"
              title="Close"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* EMAIL + OTP */}
          {(step === "email" || step === "wait") && (
            <>
              <div>
                <div className="text-lg font-bold mb-1">Verify your email</div>
                <div className="text-sm text-gray-600">
                  Enter your email to get a magic link and a one-time code. Either method works.
                </div>
              </div>

              {/* Email */}
              <label className="block text-sm font-medium">
                Email address
                <input
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={DEV_AUTH_BYPASS ? "you@example.com (dev bypass: auto-continue)" : "you@example.com"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  className="mt-1 w-full border border-black/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              </label>

              <div className={`flex ${dir === "rtl" ? "flex-col sm:flex-row-reverse" : "flex-col sm:flex-row"} gap-2`}>
                <button
                  onClick={sendLink}
                  disabled={!DEV_AUTH_BYPASS && (sending || !EMAIL_RE.test(email) || cooldown > 0)}
                  className="flex-1 px-4 py-3 rounded-xl bg-yellow-400 text-black font-bold hover:bg-yellow-300 disabled:opacity-60 disabled:hover:bg-yellow-400 transition"
                >
                  {DEV_AUTH_BYPASS
                    ? "Continue (dev)"
                    : sending
                    ? "Sending…"
                    : cooldown > 0
                    ? `Resend (${cooldown}s)`
                    : "Send link/code"}
                </button>

                <button
                  onClick={() => openGmailAppOrWeb(email)}
                  className="px-4 py-3 rounded-xl bg-black text-white font-semibold hover:bg-black/90 transition"
                >
                  Open inbox
                </button>
              </div>

              {/* OTP */}
              {!DEV_AUTH_BYPASS && (
                <label className="block text-sm font-medium">
                  One-time code (if received)
                  <div className="flex gap-2 mt-1">
                    <input
                      ref={otpRef}
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="123456"
                      maxLength={6}
                      value={otp}
                      onChange={(e) =>
                        setOtp(e.target.value.replace(/[^\d]/g, "").slice(0, 6))
                      }
                      className="flex-1 border border-black/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    />
                    <button
                      onClick={verifyOtp}
                      disabled={!EMAIL_RE.test(email) || verifying || !canVerify}
                      className="px-4 py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 disabled:opacity-60 transition"
                    >
                      {verifying ? "Checking…" : "Verify"}
                    </button>
                  </div>
                </label>
              )}

              {err && (
                <div className="text-sm text-red-600" aria-live="polite">
                  {err}
                </div>
              )}

              {!DEV_AUTH_BYPASS && (
                <div className="text-xs text-gray-500">
                  Tip: If you don’t see the email, check your <span className="font-semibold">Spam</span> folder.
                </div>
              )}
            </>
          )}

          {/* TERMS (skipped in bypass because we autostore "yes") */}
          {step === "terms" && !DEV_AUTH_BYPASS && (
            <>
              <div>
                <div className="text-lg font-bold mb-1">Terms & Privacy</div>
                <div className="text-sm text-gray-600">
                  To continue, please accept the terms. You may update the version in the future if text changes.
                </div>
              </div>

              <div className="h-40 overflow-auto border border-black/10 rounded-xl p-3 text-sm leading-6">
                <p className="mb-2">
                  By clicking “I accept & continue”, you agree to MLEO’s Terms of Use and Privacy Policy, including:
                </p>
                <ul className="list-disc ps-5 space-y-1">
                  <li>Gameplay may accrue an MLEO balance for entertainment purposes only.</li>
                  <li>Conversion rates/daily ranges may change or pause.</li>
                  <li>No guaranteed monetary value; not financial advice. Fairness controls and availability changes may apply.</li>
                  <li>Privacy: minimal data required for authentication and security, subject to law.</li>
                </ul>
                <p className="mt-2 text-xs text-gray-500">
                  Current localStorage key: <code>{TERMS_KEY}</code>
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={termsChecked}
                  onChange={(e) => setTermsChecked(e.target.checked)}
                  className="w-4 h-4"
                />
                I have read and accept the Terms
              </label>

              {err && (
                <div className="text-sm text-red-600" aria-live="polite">
                  {err}
                </div>
              )}

              <button
                onClick={acceptTerms}
                className="w-full mt-2 px-4 py-3 rounded-xl bg-yellow-400 text-black font-extrabold hover:bg-yellow-300 transition"
              >
                I accept & continue
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-black/10 text-xs text-gray-500 rounded-b-2xl flex items-center justify-between">
          <div>
            Secure • Passwordless • Mobile-friendly
            {DEV_AUTH_BYPASS && " • DEV BYPASS ACTIVE"}
          </div>
          <button
            onClick={() => onClose?.()}
            className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10"
            title="Close"
            aria-label="Close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
