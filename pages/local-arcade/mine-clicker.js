import { useEffect, useState, useRef } from "react";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";
import { useIOSViewportFix } from "../../hooks/useIOSViewportFix";

const STORAGE_KEY = "mleo_local_clicker";
const VAULT_KEY = "mleo_local_vault";

const UPGRADES = [
  {
    id: "paw",
    name: "Turbo Paw",
    description: "+1/tap",
    type: "perClick",
    amount: 1,
    baseCost: 35,
  },
  {
    id: "drill",
    name: "Mini Drill",
    description: "+2/sec",
    type: "autoRate",
    amount: 2,
    baseCost: 120,
  },
  {
    id: "rig",
    name: "Doggo Rig",
    description: "+4/tap",
    type: "perClick",
    amount: 4,
    baseCost: 400,
  },
  {
    id: "bot",
    name: "LeoBot Worker",
    description: "+6/sec",
    type: "autoRate",
    amount: 6,
    baseCost: 750,
  },
];

const defaultSave = {
  ore: 0,
  perClick: 1,
  autoRate: 0,
  purchases: {},
  totalMined: 0,
};

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toString();
}

export default function MineClickerOffline() {
  useIOSViewportFix();
  const router = useRouter();
  const wrapRef = useRef(null);
  const headerRef = useRef(null);
  const mineRef = useRef(null);
  const upgradesRef = useRef(null);
  const controlsRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [save, setSave] = useState(defaultSave);
  const [loaded, setLoaded] = useState(false);
  const [vaultBalance, setVaultBalance] = useState(0);
  const [bankMessage, setBankMessage] = useState("");

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : defaultSave;
      setSave({ ...defaultSave, ...parsed });
      setVaultBalance(Number(localStorage.getItem(VAULT_KEY) || 0));
    } catch {
      setSave(defaultSave);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Dynamic layout calculation - stable, no state dependencies
  useEffect(() => {
    if (!wrapRef.current || !mounted) return;
    const calc = () => {
      const rootH = window.visualViewport?.height ?? window.innerHeight;
      const safeBottom =
        Number(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--satb")
            .replace("px", "")
        ) || 0;
      const headH = headerRef.current?.offsetHeight || 0;
      document.documentElement.style.setProperty("--head-h", headH + "px");
      
      const controlsH = controlsRef.current?.offsetHeight || 40;
      const mineH = mineRef.current?.offsetHeight || 100;
      const used =
        headH +
        controlsH +
        mineH +
        60 + // Spacing
        safeBottom +
        32;
      const freeH = Math.max(200, rootH - used);
      document.documentElement.style.setProperty("--upgrades-h", freeH + "px");
    };
    const timer = setTimeout(calc, 100);
    window.addEventListener("resize", calc);
    window.visualViewport?.addEventListener("resize", calc);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", calc);
      window.visualViewport?.removeEventListener("resize", calc);
    };
  }, [mounted]); // Only depend on mounted

  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  }, [save, loaded]);

  useEffect(() => {
    if (!loaded || save.autoRate <= 0) return;
    const interval = setInterval(() => {
      setSave((prev) => ({
        ...prev,
        ore: prev.ore + prev.autoRate,
        totalMined: prev.totalMined + prev.autoRate,
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [save.autoRate, loaded]);

  function handleMine() {
    setSave((prev) => {
      const gain = prev.perClick;
      return {
        ...prev,
        ore: prev.ore + gain,
        totalMined: prev.totalMined + gain,
      };
    });
    if ("vibrate" in navigator) navigator.vibrate?.(20);
  }

  function upgradeCost(upgrade) {
    const count = save.purchases[upgrade.id] || 0;
    return Math.floor(upgrade.baseCost * Math.pow(1.45, count));
  }

  function buyUpgrade(upgrade) {
    const cost = upgradeCost(upgrade);
    if (save.ore < cost) return;
    setSave((prev) => ({
      ...prev,
      ore: prev.ore - cost,
      perClick:
        upgrade.type === "perClick"
          ? prev.perClick + upgrade.amount
          : prev.perClick,
      autoRate:
        upgrade.type === "autoRate"
          ? prev.autoRate + upgrade.amount
          : prev.autoRate,
      purchases: {
        ...prev.purchases,
        [upgrade.id]: (prev.purchases[upgrade.id] || 0) + 1,
      },
    }));
  }

  function bankToVault() {
    const deposit = Math.floor(save.ore);
    if (deposit <= 0 || typeof window === "undefined") return;
    setSave((prev) => ({ ...prev, ore: prev.ore - deposit }));
    setVaultBalance((prev) => {
      const next = prev + deposit;
      localStorage.setItem(VAULT_KEY, String(next));
      return next;
    });
    setBankMessage(`Stored ${fmt(deposit)} MLEO!`);
    setTimeout(() => setBankMessage(""), 2500);
  }

  function resetProgress() {
    if (!confirm("Reset local progress?")) return;
    setSave(defaultSave);
  }

  const backSafe = () => {
    router.push("/local-arcade");
  };

  if (!mounted)
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0b0f18] to-[#050608] flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );

  return (
    <Layout>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden bg-gradient-to-b from-[#0b0f18] to-[#050608]"
        style={{ height: "100svh" }}
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "30px 30px",
            }}
          />
        </div>

        <div
          ref={headerRef}
          className="absolute top-0 left-0 right-0 z-50 pointer-events-none"
        >
          <div
            className="relative px-2 py-3"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
          >
            <div className="absolute left-2 top-2 flex gap-2 pointer-events-auto">
              <button
                onClick={backSafe}
                className="min-w-[60px] px-3 py-1 rounded-lg text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10"
              >
                BACK
              </button>
            </div>
            <div className="absolute right-2 top-2 pointer-events-auto">
              <span className="text-xs uppercase tracking-[0.3em] text-white/60">
                Local
              </span>
            </div>
          </div>
        </div>

        <div
          className="relative h-full flex flex-col items-center justify-start px-4 pb-4"
          style={{
            minHeight: "100%",
            paddingTop: "calc(var(--head-h, 56px) + 8px)",
          }}
        >
          <div className="text-center mb-1">
            <h1 className="text-2xl font-extrabold text-white mb-0.5">
              ⛏️ Mine Clicker
            </h1>
            <p className="text-white/70 text-xs">
              Tap to mine • Auto: {fmt(save.autoRate)}/s
            </p>
          </div>

          <div
            ref={controlsRef}
            className="grid grid-cols-3 gap-1 mb-1 w-full max-w-md"
          >
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">MLEO</div>
              <div className="text-sm font-bold text-emerald-400">
                {fmt(save.ore)}
              </div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Per Tap</div>
              <div className="text-sm font-bold text-amber-400">
                {fmt(save.perClick)}
              </div>
            </div>
            <div className="bg-black/30 border border-white/10 rounded-lg p-1 text-center">
              <div className="text-[10px] text-white/60">Vault</div>
              <div className="text-sm font-bold text-purple-400">
                {fmt(vaultBalance)}
              </div>
            </div>
          </div>

          <div
            ref={mineRef}
            className="w-full max-w-md flex flex-col items-center justify-center mb-1"
          >
            <button
              onClick={handleMine}
              className="w-full py-8 text-4xl font-black rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-600 shadow-lg active:scale-95 transition transform"
            >
              Mine {fmt(save.perClick)} MLEO
            </button>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={bankToVault}
                className="h-9 px-4 rounded-lg bg-emerald-500/80 font-bold text-sm hover:bg-emerald-500"
              >
                Bank
              </button>
              {bankMessage && (
                <span className="text-sm text-emerald-300 font-semibold">{bankMessage}</span>
              )}
            </div>
          </div>

          <div
            ref={upgradesRef}
            className="w-full max-w-md mb-1"
            style={{ height: "var(--upgrades-h, 200px)" }}
          >
            <div className="text-sm font-semibold mb-2 text-white/80">
              Upgrades
            </div>
            <div className="grid grid-cols-2 gap-2">
              {UPGRADES.map((upgrade) => {
                const cost = upgradeCost(upgrade);
                const owned = save.purchases[upgrade.id] || 0;
                const affordable = save.ore >= cost;
                return (
                  <button
                    key={upgrade.id}
                    onClick={() => buyUpgrade(upgrade)}
                    className={`text-left rounded-xl border-2 p-3 bg-black/30 transition active:scale-95 ${
                      affordable
                        ? "border-amber-400/50"
                        : "border-white/10 opacity-70"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-semibold">{upgrade.name}</p>
                        <p className="text-xs text-white/60">
                          {upgrade.description}
                        </p>
                      </div>
                      <span className="text-xs bg-white/10 px-2 py-1 rounded">
                        {owned}
                      </span>
                    </div>
                    <p className="text-sm text-amber-300 font-semibold">
                      {affordable ? "Buy" : "Need"} {fmt(cost)}
                    </p>
                  </button>
                );
              })}
            </div>
            <button
              onClick={resetProgress}
              className="mt-2 w-full h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-sm"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
