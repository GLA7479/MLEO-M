import { supabaseMP as supabase } from "./supabaseClients";

const REMEMBER_KEY = "mleo_remember_me";

function persistSessionPreference() {
  try {
    if (!window.localStorage.getItem(REMEMBER_KEY)) {
      window.localStorage.setItem(REMEMBER_KEY, "true");
    }
  } catch {}
}

export async function playAsGuest() {
  persistSessionPreference();

  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }

  const { data, error } = await supabase.rpc("ensure_profile", { p_username: null });
  if (error) throw error;

  const profile = Array.isArray(data) ? data[0] : data;
  const { data: { user } = {} } = await supabase.auth.getUser();

  if (user) {
    try {
      localStorage.setItem("mleo_user_id", user.id);
      localStorage.setItem("mleo_username", profile?.username || "Guest");
      localStorage.setItem("mleo_is_guest", profile?.is_guest ? "1" : "0");
    } catch {}
  }

  return { user, username: profile?.username || "Guest", isGuest: !!profile?.is_guest };
}

