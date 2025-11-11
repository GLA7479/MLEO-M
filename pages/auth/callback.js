// pages/auth/callback.js
import { useEffect } from "react";
import { useRouter } from "next/router";
import { supabaseMP } from "../../lib/supabaseClients";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    let canceled = false;

    (async () => {
      const hash =
        typeof window !== "undefined" ? window.location.hash.slice(1) : "";
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      try {
        if (access_token && refresh_token) {
          await supabaseMP.auth.setSession({ access_token, refresh_token });
          if (typeof window !== "undefined") {
            window.history.replaceState({}, document.title, "/auth/callback");
          }
        }

        const { data } = await supabaseMP.auth.getSession();
        if (canceled) return;
        if (data?.session) {
          router.replace("/mining");
        } else {
          router.replace("/");
        }
      } catch (err) {
        console.warn("[auth/callback] session handling failed", err);
        if (!canceled) router.replace("/");
      }
    })();

    return () => {
      canceled = true;
    };
  }, [router]);

  return (
    <main
      style={{
        color: "#fff",
        background: "#0b0b0d",
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
      }}
    >
      <p>Signing you in…</p>
    </main>
  );
}

