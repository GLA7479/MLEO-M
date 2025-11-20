import { useEffect, useState } from "react";
import LocalGameShell from "../../components/LocalGameShell";

const STORAGE_KEY = "mleo_local_clicker";
const VAULT_KEY = "mleo_local_vault";

const UPGRADES = [
  {
    id: "paw",
    name: "Turbo Paw",
    description: "+1 MLEO per tap",
    type: "perClick",
    amount: 1,
    baseCost: 35,
  },
  {
    id: "drill",
    name: "Mini Drill",
    description: "+2 MLEO per second",
    type: "autoRate",
    amount: 2,
    baseCost: 120,
  },
  {
    id: "rig",
    name: "Doggo Rig",
    description: "+4 MLEO per tap",
    type: "perClick",
    amount: 4,
    baseCost: 400,
  },
  {
    id: "bot",
    name: "LeoBot Worker",
    description: "+6 MLEO per second",
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

export default function MineClickerOffline() {
  const [save, setSave] = useState(defaultSave);
  const [loaded, setLoaded] = useState(false);
  const [vaultBalance, setVaultBalance] = useState(0);
  const [bankMessage, setBankMessage] = useState("");

  useEffect(() => {
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
    setBankMessage(`Stored ${deposit.toLocaleString()} MLEO in local vault!`);
    setTimeout(() => setBankMessage(""), 2500);
  }

  function resetProgress() {
    if (!confirm("Reset local progress?")) return;
    setSave(defaultSave);
  }

  return (
    <LocalGameShell
      title="Mine Clicker Offline"
      subtitle="Tap to mine MLEO, buy upgrades, and bank tokens in a local vault — works even in airplane mode."
      eyebrow="Idle Clicker • Offline"
      backgroundClass="bg-gradient-to-b from-[#05060b] via-[#090d18] to-[#030307]"
    >
      <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                💰 Balances
              </h2>
              <StatRow label="Unbanked MLEO" value={save.ore} />
              <StatRow label="Per tap" value={save.perClick} />
              <StatRow label="Per second (auto)" value={save.autoRate} />
              <StatRow label="Lifetime mined" value={save.totalMined} />
              <div className="mt-2 text-xs text-white/60 space-y-1">
                <p>Local vault: {vaultBalance.toLocaleString()} MLEO</p>
                <button
                  onClick={bankToVault}
                  className="w-full px-3 py-2 rounded-lg bg-emerald-500/80 font-semibold text-sm hover:bg-emerald-500"
                >
                  Bank to vault
                </button>
                {bankMessage && (
                  <p className="text-emerald-300 text-center">{bankMessage}</p>
                )}
                <button
                  onClick={resetProgress}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20"
                >
                  🧹 Reset progress
                </button>
              </div>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
              <h2 className="text-lg font-semibold text-center">⛏️ Mining</h2>
              <button
                onClick={handleMine}
                className="w-full py-10 text-4xl font-black rounded-3xl bg-gradient-to-br from-yellow-500 to-orange-600 shadow-lg active:scale-95 transition transform"
              >
                Mine {save.perClick} MLEO
              </button>
              <p className="text-center text-white/60 text-sm">
                Tip: some devices support hold-to-repeat on the mining button.
              </p>
            </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-xl font-semibold mb-4">🚀 Upgrades</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {UPGRADES.map((upgrade) => {
            const cost = upgradeCost(upgrade);
            const owned = save.purchases[upgrade.id] || 0;
            const affordable = save.ore >= cost;
            return (
              <button
                key={upgrade.id}
                onClick={() => buyUpgrade(upgrade)}
                className={`text-left rounded-2xl border p-4 bg-[#0c111d] transition ${
                  affordable ? "border-amber-400/50" : "border-white/10 opacity-70"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-lg font-semibold">{upgrade.name}</p>
                    <p className="text-sm text-white/60">{upgrade.description}</p>
                  </div>
                  <span className="text-xs bg-white/10 px-2 py-1 rounded-full">
                    Owned {owned}
                  </span>
                </div>
                <p className="text-amber-300 font-semibold">
                  {affordable ? "Buy" : "Need"} — {cost.toLocaleString()} MLEO
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </LocalGameShell>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between bg-[#0d1628] rounded-xl px-3 py-2">
      <span className="text-sm text-white/60">{label}</span>
      <span className="font-semibold">{value.toLocaleString()}</span>
    </div>
  );
}

