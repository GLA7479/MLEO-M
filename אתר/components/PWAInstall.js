// components/PWAInstall.js
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function PWAInstall() {
  const deferredPrompt = useRef(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [open, setOpen] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [mounted, setMounted] = useState(false); // SSR guard

  useEffect(() => {
    setMounted(true);

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone;
    setIsStandalone(!!standalone);

    const ua = (navigator.userAgent || "").toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const onBIP = (e) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    const onInstalled = () => {
      setCanInstall(false);
      setIsStandalone(true);
      setOpen(false);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Lock/unlock body scroll when modal is open
  useEffect(() => {
    try {
      if (open) document.body.style.overflow = "hidden";
      else document.body.style.overflow = "";
    } catch {}
    return () => {
      try { document.body.style.overflow = ""; } catch {}
    };
  }, [open]);

  if (isStandalone) return null;

  async function doInstall() {
    try {
      if (deferredPrompt.current) {
        deferredPrompt.current.prompt();
        await deferredPrompt.current.userChoice;
        deferredPrompt.current = null;
        setCanInstall(false);
        setOpen(false);
      }
    } catch {}
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/15 transition text-sm"
      >
        Install App
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur"
          style={{
            zIndex: 2147483647,
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 6vh)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2vh)",
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto w-[min(720px,94vw)] max-h-[88vh] overflow-auto rounded-2xl border border-white/10 shadow-2xl bg-neutral-900 text-white relative">
            {/* Sticky header with close button */}
            <div className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur p-4 border-b border-white/10 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-xl font-bold">Install MLEO App</h2>
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20"
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-5 text-sm text-white/85">
              <p>
                Install MLEO to your device for a fast, full-screen experience.
                The app opens directly on the Home page with all animations enabled.
              </p>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h3 className="font-semibold mb-1">Chrome / Android</h3>
                <ol className="list-decimal ml-5 space-y-1">
                  <li>Tap <b>Install</b> below (or the install icon in the address bar).</li>
                  <li>Confirm the prompt.</li>
                </ol>
                <div className="mt-3 flex gap-2 items-center">
                  <button
                    onClick={doInstall}
                    disabled={!canInstall}
                    className={`px-4 py-2 rounded-xl font-bold ${
                      canInstall
                        ? "bg-yellow-400 text-black hover:bg-yellow-300"
                        : "bg-white/10 text-white/40 cursor-not-allowed"
                    }`}
                    title={canInstall ? "Install" : "Install not available yet"}
                  >
                    Install
                  </button>
                  {!canInstall && (
                    <span className="text-xs text-white/60">
                      If you don’t see the prompt yet, reload the page and try again.
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h3 className="font-semibold mb-1">iOS Safari</h3>
                <ol className="list-decimal ml-5 space-y-1">
                  <li>Tap the <span className="px-1 py-0.5 rounded bg-white/10">Share</span> icon.</li>
                  <li>Choose <span className="px-1 py-0.5 rounded bg-white/10">Add to Home Screen</span>.</li>
                  <li>Confirm. The app will appear on your Home Screen.</li>
                </ol>
                {isIOS && (
                  <div className="mt-2 text-xs text-white/60">
                    Tip: If you don’t see “Add to Home Screen”, scroll the sheet up.
                  </div>
                )}
              </div>

              <div className="text-xs text-white/50">
                Installing creates a lightweight offline-capable app (PWA).
                You can remove it anytime from your device.
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
