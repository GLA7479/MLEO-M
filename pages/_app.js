// pages/_app.js
import "../styles/globals.css"; // חשוב לטעון את ה-CSS הגלובלי
import "@rainbow-me/rainbowkit/styles.css";

import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "../lib/wagmi";

import { useEffect } from "react";

const queryClient = new QueryClient();

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // --- Register Service Worker (PWA install) ---
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
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
