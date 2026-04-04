// pages/_app.js
import "../styles/globals.css"; // חשוב לטעון את ה-CSS הגלובלי
import "@rainbow-me/rainbowkit/styles.css";

import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "../lib/wagmi";

import { useEffect } from "react";
import { ensureCsrfToken } from "../lib/arcadeDeviceClient";

const queryClient = new QueryClient();

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // --- Initialize CSRF token on app load ---
    if (typeof window !== "undefined") {
      ensureCsrfToken().catch(() => {});
    }

    // --- Service Worker: disable in dev, enable in prod ---
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      if (process.env.NODE_ENV !== "production") {
        navigator.serviceWorker.getRegistrations?.()
          .then(regs => regs.forEach(r => r.unregister()))
          .catch(() => {});
      } else {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    }

    // --- Recover once from stale chunk references (dev/prod cache mismatch) ---
    const CHUNK_RELOAD_KEY = "mleo_chunk_reload_once";
    const isChunkLoadError = (reason) => {
      const msg = String(reason?.message || reason || "");
      return (
        msg.includes("ChunkLoadError") ||
        msg.includes("Loading chunk")
      );
    };
    const reloadOnceForChunkError = (reason) => {
      if (!isChunkLoadError(reason)) return;
      if (window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") return;
      window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      window.location.reload();
    };
    const isBenignArcadeDeviceRejection = (reason) => {
      const msg = String(reason?.message || reason || "");
      return (
        /arcade device unavailable/i.test(msg) ||
        /failed to initialize arcade device/i.test(msg) ||
        /arcade device init failed/i.test(msg)
      );
    };
    const onUnhandledRejection = (event) => {
      if (isBenignArcadeDeviceRejection(event?.reason)) {
        event.preventDefault?.();
        console.warn("[mleo] Arcade device / vault sync deferred:", event?.reason?.message || event?.reason);
        return;
      }
      reloadOnceForChunkError(event?.reason);
    };
    const onWindowError = (event) => reloadOnceForChunkError(event?.error || event?.message);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onWindowError);

    // --- Fix scroll-behavior warning for Next.js ---
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-scroll-behavior", "smooth");
    }

    // --- iOS 100vh fix (שיהיה גובה מלא גם בספארי) ---
    const root = document.documentElement;
    const vv = window.visualViewport;
    const setVH = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--app-100vh", `${Math.round(h)}px`);
    };
    setVH();
    vv?.addEventListener("resize", setVH);
    window.addEventListener("resize", setVH);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onWindowError);
      vv?.removeEventListener("resize", setVH);
      window.removeEventListener("resize", setVH);
    };
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact">
          <Component {...pageProps} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
