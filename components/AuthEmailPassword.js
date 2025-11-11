// components/AuthEmailPassword.js
import { useEffect, useState } from "react";
import { supabaseMP } from "../lib/supabaseClients";

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

  useEffect(() => {
    setMsg("");
    setPassword("");
    setSignupStep("form");
    setOtp("");
    setUsername("");
    setConfirmPassword("");
  }, [mode]);

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

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur">
      <div className="mx-auto mt-[10vh] w-[92%] max-w-md bg-white text-gray-900 rounded-2xl border border-black/10 shadow-2xl">
        <div className="p-4 border-b border-black/10 flex items-center justify-between rounded-t-2xl">
          <div className="font-extrabold">
            {mode === "signin"
              ? "Sign in"
              : mode === "signup"
              ? signupStep === "form"
                ? "Create account"
                : "Verify email"
              : "Reset password"}
          </div>
          <button onClick={() => onClose?.()} className="px-2 py-1 rounded bg-black/5 hover:bg-black/10">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-3">
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              className="mt-1 w-full border border-black/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
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
                  className="mt-1 w-full border border-black/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              </label>
              <label className="block text-sm font-medium">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full border border-black/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              </label>
              <label className="block text-sm font-medium">
                Confirm password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full border border-black/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
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
                  className="mt-1 w-full border border-black/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
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
                className="mt-1 w-full border border-black/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            </label>
          )}

          {msg && <div className="text-sm text-gray-600">{msg}</div>}

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
              onClick={doSignup}
              disabled={loading || verifying}
              className="w-full px-4 py-3 rounded-xl bg-yellow-400 text-black font-extrabold hover:bg-yellow-300 disabled:opacity-60"
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
              onClick={doSignin}
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl bg-yellow-400 text-black font-extrabold hover:bg-yellow-300 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          )}
          {mode === "reset" && (
            <button
              onClick={doReset}
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl bg-yellow-400 text-black font-extrabold hover:bg-yellow-300 disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          )}

          <div className="text-xs text-gray-600 pt-2 flex flex-wrap gap-2 justify-between">
            {mode !== "signin" && (
              <button onClick={() => setMode("signin")} className="underline hover:text-yellow-600">
                Have an account? Sign in
              </button>
            )}
            {mode !== "signup" && (
              <button onClick={() => setMode("signup")} className="underline hover:text-yellow-600">
                Create account
              </button>
            )}
            {mode !== "reset" && (
              <button onClick={() => setMode("reset")} className="underline hover:text-yellow-600">
                Forgot password?
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

