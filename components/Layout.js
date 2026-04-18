// components/Layout.js
import Head from "next/head";
import { useEffect } from "react";
import { initVaultShim } from "../lib/vaultShim";
import { supabaseMP } from "../lib/supabaseClients";

export default function Layout({ children, title, lockShellScroll = false }) {
  useEffect(() => {
    initVaultShim();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      const remember = window.localStorage?.getItem("mleo_remember_me");
      if (remember === "false") {
        const { data } = await supabaseMP.auth.getSession();
        if (!cancelled && data?.session) {
          await supabaseMP.auth.signOut();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Head>
        <title>{title || "MLEO App"}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <div
        className={
          lockShellScroll
            ? "app-shell relative h-[100dvh] max-h-[100dvh] min-h-0 w-full overflow-x-hidden overflow-y-hidden text-white"
            : "app-shell relative min-h-[var(--app-100vh,100svh)] w-full overflow-x-hidden overflow-y-auto text-white"
        }
        style={lockShellScroll ? { background: "#0b1220" } : { minHeight: "var(--app-100vh, 100svh)", background: "#0b1220" }}
      >
        {children}
      </div>
    </>
  );
}
