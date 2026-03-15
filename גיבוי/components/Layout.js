// components/Layout.js
import Head from "next/head";
import { useEffect } from "react";
import { initVaultShim } from "../lib/vaultShim";
import { supabaseMP } from "../lib/supabaseClients";

export default function Layout({ children, title }) {
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div
        className="app-shell relative w-full text-white overflow-x-hidden overflow-y-auto"
        style={{
          minHeight: "var(--app-100vh, 100svh)",
          background: "#0b1220",
        }}
      >
        {children}
      </div>
    </>
  );
}
