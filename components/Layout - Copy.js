// components/Layout.js
import Head from "next/head";

export default function Layout({ children }) {
  return (
    <>
      <Head>
        <title>MLEO Miners</title>

        {/* Viewport + iOS full-bleed */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0b1220" />

        {/* PWA + iOS install */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      </Head>

      {/* App shell: true device height */}
      <div
        className="app-shell relative w-full text-white overflow-hidden"
        style={{
          height: "var(--app-100vh, 100svh)",
          minHeight: "var(--app-100vh, 100svh)",
          background: "#0b1220",
        }}
      >
        {children}
      </div>
    </>
  );
}
