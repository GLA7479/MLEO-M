import { supabaseMP as supabase } from "./supabaseClients";

const REMEMBER_KEY = "mleo_remember_me";
let guestInitPromise = null;

function persistSessionPreference() {
  try {
    if (!window.localStorage.getItem(REMEMBER_KEY)) {
      window.localStorage.setItem(REMEMBER_KEY, "true");
    }
  } catch {}
}

async function waitForRecoveredSession(timeoutMs = 1800, stepMs = 150) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const { data: { session } = {} } = await supabase.auth.getSession();
    if (session?.user) return session.user;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }

  return null;
}

export async function playAsGuest() {
  if (guestInitPromise) return guestInitPromise;

  guestInitPromise = (async () => {
    persistSessionPreference();

    let user = await waitForRecoveredSession();

    if (!user) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;

      user = await waitForRecoveredSession();
      if (!user) {
        throw new Error("Guest session was not restored after anonymous sign-in.");
      }
    }

    const { data, error } = await supabase.rpc("ensure_profile", { p_username: null });
    if (error) throw error;

    const profile = Array.isArray(data) ? data[0] : data;

    try {
      localStorage.setItem("mleo_user_id", user.id);
      localStorage.setItem("mleo_username", profile?.username || "Guest");
      localStorage.setItem("mleo_is_guest", profile?.is_guest ? "1" : "0");
    } catch {}

    return {
      user,
      username: profile?.username || "Guest",
      isGuest: !!profile?.is_guest,
    };
  })();

  try {
    return await guestInitPromise;
  } finally {
    guestInitPromise = null;
  }
}
