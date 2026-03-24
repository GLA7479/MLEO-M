// components/AuthEmailPassword.js
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabaseMP } from "../lib/supabaseClients";
import { playAsGuest } from "../lib/authGuest";

const TITLE_ID = "auth-email-dialog-title";

export default function AuthEmailPassword({ onClose, onSuccess }) {
  const [mode, setMode] = useState("signin"); // signin | signup | reset
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupStep, setSignupStep] = useState("form"); // form | otp
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState("");
  const [remember, setRemember] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage?.getItem("mleo_remember_me");
    return stored !== "false";
  });
  const router = useRouter();
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    setMsg("");
    setPassword("");
    setSignupStep("form");
    setOtp("");
    setUsername("");
    setConfirmPassword("");
  }, [mode]);

  useEffect(() => {
    previousFocusRef.current = typeof document !== "undefined" ? document.activeElement : null;
    const t = requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    return () => {
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function" && document.contains(prev)) {
        try {
          prev.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  async function doSignup() {
    if (signupStep === "form") {
      if (!username) {
        setMsg("Choose a username.");
        return;
      }
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        setMsg("Username must be 3-20 characters (letters, numbers, underscore).");
        return;
      }
      if (!email || !password || password.length < 6) {
        setMsg("Please enter email and password (min 6 characters).");
        return;
      }
      if (password !== confirmPassword) {
        setMsg("Passwords do not match.");
        return;
      }
      setLoading(true);
      setMsg("");
      const { error } = await supabaseMP.auth.signUp({ email, password });
      setLoading(false);
      if (error) return setMsg(error.message);
      setSignupStep("otp");
      setMsg("A verification code was sent to your email. Enter it to finish creating your account.");
      return;
    }

    if (!otp || otp.trim().length < 4) {
      setMsg("Enter the verification code you received.");
      return;
    }

    setVerifying(true);
    setMsg("");
    const { error } = await supabaseMP.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: "signup",
    });
    setVerifying(false);
    if (error) return setMsg(error.message);

    const { data: existing } = await supabaseMP
      .from("user_profiles")
      .select("user_id")
      .eq("username", username)
      .maybeSingle();

    if (existing) {
      setMsg("Username already taken. Choose another.");
      setSignupStep("form");
      return;
    }

    const { error: profileError } = await supabaseMP
      .from("user_profiles")
      .insert({ username });

    if (profileError) {
      setMsg(profileError.message);
      return;
    }

    const { data } = await supabaseMP.auth.getSession();
    if (data?.session) {
      onSuccess?.();
    } else {
      setMsg("Email verified. You can now sign in with your password.");
      setMode("signin");
    }
  }

  async function doSignin() {
    try {
      window.localStorage?.setItem("mleo_remember_me", remember ? "true" : "false");
    } catch {}
    setLoading(true);
    setMsg("");
    const { error } = await supabaseMP.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setMsg(error.message);
    onSuccess?.();
  }

  async function doReset() {
    setLoading(true);
    setMsg("");
    const base =
      process.env.NEXT_PUBLIC_AUTH_REDIRECT_BASE ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const { error } = await supabaseMP.auth.resetPasswordForEmail(email, {
      redirectTo: `${base}/auth/reset`,
    });
    setLoading(false);
    if (error) return setMsg(error.message);
    setMsg("Password reset email sent.");
  }

  const titleText =
    mode === "signin"
      ? "Sign in"
      : mode === "signup"
        ? signupStep === "form"
          ? "Create account"
          : "Verify email"
        : "Reset password";

  return (
    <div className="fixed inset-0 z-[1000] overflow-y-auto overflow-x-hidden bg-black/70 backdrop-blur">
      <div className="flex min-h-full items-start justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={TITLE_ID}
          tabIndex={-1}
          className="my-4 flex w-[92%] max-h-[min(90dvh,calc(100dvh-1.5rem))] max-w-md flex-col overflow-hidden rounded-2xl border border-black/10 bg-white text-gray-900 shadow-2xl outline-none"
        >
          <div className="flex shrink-0 items-center justify-between rounded-t-2xl border-b border-black/10 p-4">
            <h2 id={TITLE_ID} className="font-extrabold">
              {titleText}
            </h2>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded bg-black/5 px-2 py-1 hover:bg-black/10"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5">
            <label className="block text-sm font-medium">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                autoComplete="email"
              />
            </label>

            {mode === "signup" && signupStep === "form" ? (
              <>
                <label className="block text-sm font-medium">
                  Username
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.trim())}
                    className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    autoComplete="username"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    autoComplete="new-password"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Confirm password
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    autoComplete="new-password"
                  />
                </label>
              </>
            ) : (
              mode !== "reset" && (
                <label className="block text-sm font-medium">
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    autoComplete="current-password"
                  />
                </label>
              )
            )}

            {mode === "signup" && signupStep === "otp" && (
              <label className="block text-sm font-medium">
                Verification code
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/[^\d]/g, "").slice(0, 8))
                  }
                  placeholder="Enter the code you received"
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  autoComplete="one-time-code"
                />
              </label>
            )}

            {msg ? (
              <div className="text-sm text-gray-600" role="status" aria-live="polite">
                {msg}
              </div>
            ) : null}

            {mode === "signin" && (
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Stay signed in on this device
              </label>
            )}

            {mode === "signup" && (
              <button
                type="button"
                onClick={doSignup}
                disabled={loading || verifying}
                className="w-full rounded-xl bg-yellow-400 px-4 py-3 font-extrabold text-black hover:bg-yellow-300 disabled:opacity-60"
              >
                {signupStep === "form"
                  ? loading
                    ? "Sending code…"
                    : "Create account"
                  : verifying
                    ? "Verifying…"
                    : "Verify code"}
              </button>
            )}
            {mode === "signin" && (
              <button
                type="button"
                onClick={doSignin}
                disabled={loading}
                className="w-full rounded-xl bg-yellow-400 px-4 py-3 font-extrabold text-black hover:bg-yellow-300 disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                try {
                  await playAsGuest();
                  setMsg("");
                  onClose?.();
                  router.push("/mining");
                } catch (e) {
                  setMsg(e.message || "Could not start guest session.");
                }
              }}
              className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm font-semibold text-gray-800 transition hover:bg-black/5"
            >
              Continue as Guest
            </button>

            <div className="flex flex-wrap justify-between gap-2 pt-2 text-xs text-gray-600">
              {mode !== "signin" && (
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="underline hover:text-yellow-600"
                >
                  Have an account? Sign in
                </button>
              )}
              {mode !== "signup" && (
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="underline hover:text-yellow-600"
                >
                  Create account
                </button>
              )}
              {mode !== "reset" && (
                <button
                  type="button"
                  onClick={() => setMode("reset")}
                  className="underline hover:text-yellow-600"
                >
                  Forgot password?
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
