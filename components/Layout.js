// components/Layout.js
import Head from "next/head";
import { useEffect } from "react";
import { initVaultShim } from "../lib/vaultShim";

export default function Layout({ children, title }) {
  useEffect(() => {
    initVaultShim();
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
