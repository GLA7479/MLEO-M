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

const DEV_AUTH_BYPASS =
  process.env.NEXT_PUBLIC_GATE_DEV_BYPASS === "1";

export default function EmailTermsGate({ onPassed, onClose }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [stage, setStage] = useState("check"); // check | auth | terms
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);

  const dir =
    (typeof document !== "undefined" &&
      (document.documentElement.getAttribute("dir") || "ltr")) || "ltr";

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const devAutoPass = () => {
    try {
      localStorage.setItem(TERMS_KEY, "yes");
    } catch {}
    onPassed?.();
  };

  useEffect(() => {
    if (stage === "auth" && emailRef.current) emailRef.current.focus();
  }, [stage]);

  useEffect(() => {
    let live = true;
    (async () => {
      if (DEV_AUTH_BYPASS) {
        setStage("auth");
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
        } else if (data?.session) {
          setStage("terms");
        } else {
          setStage("auth");
        }
      } catch {
        if (!live) return;
        setStage("auth");
      }
    })();
    return () => {
      live = false;
    };
  }, [onPassed]);

  const canLogin = useMemo(
    () => EMAIL_RE.test(email) && password.length >= 8,
    [email, password]
  );

  const canSignup = useMemo(
    () =>
      EMAIL_RE.test(email) &&
      password.length >= 8 &&
      password === confirmPassword,
    [email, password, confirmPassword]
  );

  async function handleLogin() {
    setErr("");

    if (DEV_AUTH_BYPASS) {
      devAutoPass();
      return;
    }

    if (!canLogin) {
      setErr("Please enter email and password (8+ characters).");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabaseMP.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      const { data } = await supabaseMP.auth.getSession();
      if (data?.session) {
        const hasTerms =
          typeof window !== "undefined" &&
          localStorage.getItem(TERMS_KEY) === "yes";
        if (hasTerms) onPassed?.();
        else setStage("terms");
      } else {
        setErr("Login failed. Please try again.");
      }
    } catch (e) {
      setErr(e?.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup() {
    setErr("");

    if (DEV_AUTH_BYPASS) {
      devAutoPass();
      return;
    }

    if (!canSignup) {
      setErr("Passwords must match and be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabaseMP.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: undefined },
      });
      if (error) throw error;
      setStage("terms");
      setErr("");
    } catch (e) {
      setErr(e?.message || "Signup failed, please try again.");
    } finally {
      setSubmitting(false);
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
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur p-4 border-b border-black/10 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/images/leo-coin-gold.png"
              alt="MLEO"
              className="w-8 h-8 rounded-full object-contain"
            />
            <div className="font-extrabold">MLEO Sign-In</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500">
              <Pill>Password</Pill>
              {DEV_AUTH_BYPASS && <Pill>DEV BYPASS</Pill>}
            </div>
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

        <div className="p-5 space-y-4">
          {stage === "auth" && (
            <>
              <div>
                <div className="text-lg font-bold mb-1">
                  {mode === "login" ? "Sign in to continue" : "Create your account"}
                </div>
                <div className="text-sm text-gray-600">
                  {mode === "login"
                    ? "Use your MLEO email and password."
                    : "Set a secure password to access MLEO from any device."}
                </div>
              </div>

              <label className="block text-sm font-medium">
                Email address
                <input
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  className="mt-1 w-full border border-black/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              </label>

              <label className="block text-sm font-medium">
                Password
                <input
                  ref={passwordRef}
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={mode === "login" ? "••••••••" : "At least 8 characters"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full border border-black/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              </label>

              {mode === "signup" && (
                <label className="block text-sm font-medium">
                  Confirm password
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 w-full border border-black/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  />
                </label>
              )}

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                  className="text-yellow-600 hover:underline"
                >
                  {mode === "login"
                    ? "New here? Create an account"
                    : "Have an account? Sign in"}
                </button>

                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!EMAIL_RE.test(email)) {
                        setErr("Enter your email to receive reset instructions.");
                        return;
                      }
                      const base =
                        process.env.NEXT_PUBLIC_AUTH_REDIRECT_BASE ||
                        (typeof window !== "undefined" ? window.location.origin : "");
                      supabaseMP.auth
                        .resetPasswordForEmail(email, {
                          redirectTo: `${base}/auth/reset`,
                        })
                        .then(({ error }) => {
                          if (error) setErr(error.message);
                          else setErr("Password reset email sent. Check your inbox.");
                        });
                    }}
                    className="text-gray-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              <button
                onClick={mode === "login" ? handleLogin : handleSignup}
                disabled={
                  submitting || (mode === "login" ? !canLogin : !canSignup)
                }
                className="w-full px-4 py-3 rounded-xl bg-yellow-400 text-black font-bold hover:bg-yellow-300 disabled:opacity-60 disabled:hover:bg-yellow-400 transition"
              >
                {submitting
                  ? mode === "login"
                    ? "Signing in…"
                    : "Creating account…"
                  : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              </button>

              {err && (
                <div className="text-sm text-red-600" aria-live="polite">
                  {err}
                </div>
              )}

              <div className="text-xs text-gray-500">
                Password must be at least 8 characters. Use a unique password to keep your account secure.
              </div>
            </>
          )}

          {stage === "terms" && !DEV_AUTH_BYPASS && (
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

        <div className="p-4 border-t border-black/10 text-xs text-gray-500 rounded-b-2xl flex items-center justify-between">
          <div>
            Secure • Email & password • Mobile-friendly
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
