// components/PWAInstall.js
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const STORAGE_KEY = "mleo_app_build_id";

export default function PWAInstall() {
  const deferredPrompt = useRef(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [open, setOpen] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isOutdated, setIsOutdated] = useState(false);
  const [currentBuild, setCurrentBuild] = useState("");

  useEffect(() => {
    setMounted(true);

    // 1) detect if running as PWA
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone;
    setIsStandalone(!!standalone);

    // 2) detect iOS
    const ua = (navigator.userAgent || "").toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    // 3) detect next.js build id from page
    // Next exposes it on window.__NEXT_DATA__.buildId
    const buildId = window.__NEXT_DATA__?.buildId || "unknown";
    setCurrentBuild(buildId);

    try {
      const lastBuild = localStorage.getItem(STORAGE_KEY);
      if (lastBuild && lastBuild !== buildId) {
        // page was opened from an old build → force refresh message
        setIsOutdated(true);
      } else {
        // store current
        localStorage.setItem(STORAGE_KEY, buildId);
      }
    } catch {
      // ignore
    }

    // 4) install prompt
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

  // lock body scroll
  useEffect(() => {
    if (!mounted) return;
    try {
      document.body.style.overflow = open ? "hidden" : "";
    } catch {}
    return () => {
      try {
        document.body.style.overflow = "";
      } catch {}
    };
  }, [open, mounted]);

  // if already installed → hide button
  if (isStandalone) return null;

  async function doInstall() {
    if (isOutdated) return; // don't install old build
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

      {open &&
        mounted &&
        createPortal(
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
              <div className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur p-4 border-b border-white/10 rounded-t-2xl flex items-center justify-between">
                <h2 className="text-xl font-bold">
                  {isOutdated ? "New version available" : "Install MLEO App"}
                </h2>
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
                {isOutdated ? (
                  <>
                    <p className="text-red-200">
                      יש גרסה חדשה של האתר. הדף הזה נטען מגרסה ישנה
                      ולכן אי אפשר להתקין אותה.
                    </p>
                    <p className="text-white/60">
                      תעשה <b>Hard reload</b> (Ctrl+Shift+R) או תסגור ותפתח שוב
                      את האתר, ואז תוכל להתקין.
                    </p>
                    <p className="text-xs text-white/30">
                      build: {currentBuild}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      Install MLEO to your device for a fast, full-screen
                      experience.
                    </p>

                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <h3 className="font-semibold mb-1">Chrome / Android</h3>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Tap Install below.</li>
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
                        >
                          Install
                        </button>
                        {!canInstall && (
                          <span className="text-xs text-white/60">
                            If you don’t see the prompt yet, reload the page and
                            try again.
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <h3 className="font-semibold mb-1">iOS Safari</h3>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>
                          Tap the{" "}
                          <span className="px-1 py-0.5 rounded bg-white/10">
                            Share
                          </span>{" "}
                          icon.
                        </li>
                        <li>
                          Choose{" "}
                          <span className="px-1 py-0.5 rounded bg-white/10">
                            Add to Home Screen
                          </span>
                          .
                        </li>
                        <li>Confirm.</li>
                      </ol>
                      {isIOS && (
                        <div className="mt-2 text-xs text-white/60">
                          Tip: If you don’t see it, scroll the sheet up.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
