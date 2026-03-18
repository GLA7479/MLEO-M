import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import {
  getBaseState,
  buildBuilding,
  installModule,
  researchTech,
  launchExpedition as launchExpeditionAction,
  shipToVault,
  spendFromVault,
  hireCrewAction,
  performMaintenanceAction,
  claimBaseMission,
} from "../lib/baseVaultClient";
import { BaseHudV3 } from "./base-v3/components/BaseHudV3";
import { BaseSceneV3 } from "./base-v3/components/BaseSceneV3";
import { BuildingSheetV3 } from "./base-v3/components/BuildingSheetV3";
import { ActivityFeedV3 } from "./base-v3/components/ActivityFeedV3";
import { BaseUtilityTrayV3 } from "./base-v3/components/BaseUtilityTrayV3";
import { BaseHintV3 } from "./base-v3/components/BaseHintV3";

const MAX_LOG_ITEMS = 16;

export default function MleoBaseV3() {
  const [baseState, setBaseState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [logItems, setLogItems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const res = await getBaseState();
        if (cancelled) return;

        if (!res || !res.success || !res.state) {
          setError(res?.message || "Failed to load base state.");
          setBaseState(null);
          setLoading(false);
          return;
        }

        setBaseState(res.state);
        setError(null);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Failed to load base state.");
          setBaseState(null);
        }
      }

      if (!cancelled) setLoading(false);
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  function pushLog(entry) {
    const item = { id: Date.now() + Math.random(), ...entry };
    setLogItems((prev) => [item, ...prev].slice(0, MAX_LOG_ITEMS));
  }

  async function handleBuild(key) {
    if (!baseState || isBusy) return;
    setIsBusy(true);
    try {
      const res = await buildBuilding(key);
      if (!res?.success || !res?.state) {
        pushLog({ type: "error", message: res?.message || "Build failed." });
        return;
      }
      setBaseState(res.state);
      pushLog(res?.log || { type: "info", message: "Build completed." });
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Build failed." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleInstallModule(key) {
    if (!baseState || isBusy) return;
    setIsBusy(true);
    try {
      const res = await installModule(key);
      if (!res?.success || !res?.state) {
        pushLog({ type: "error", message: res?.message || "Module install failed." });
        return;
      }
      setBaseState(res.state);
      pushLog(res?.log || { type: "info", message: "Module installed." });
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Module install failed." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleResearch(key) {
    if (!baseState || isBusy) return;
    setIsBusy(true);
    try {
      const res = await researchTech(key);
      if (!res?.success || !res?.state) {
        pushLog({ type: "error", message: res?.message || "Research failed." });
        return;
      }
      setBaseState(res.state);
      pushLog(res?.log || { type: "info", message: "Research completed." });
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Research failed." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleExpedition() {
    if (!baseState || isBusy) return;
    setIsBusy(true);
    try {
      const res = await launchExpeditionAction();
      if (!res?.success || !res?.state) {
        pushLog({ type: "error", message: res?.message || "Expedition failed." });
        return;
      }
      setBaseState(res.state);
      pushLog(res?.log || { type: "info", message: "Expedition launched." });
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Expedition failed." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleShipToVault() {
    if (!baseState || isBusy) return;
    setIsBusy(true);
    try {
      const res = await shipToVault();
      if (!res?.success || !res?.state) {
        pushLog({ type: "error", message: res?.message || "Shipment failed." });
        return;
      }
      setBaseState(res.state);
      pushLog(res?.log || { type: "info", message: "Shipped to vault." });
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Shipment failed." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSpendFromVault(spendType) {
    if (!baseState || isBusy) return;
    setIsBusy(true);
    try {
      const res = await spendFromVault(spendType);
      if (!res?.success || !res?.state) {
        pushLog({ type: "error", message: res?.message || "Spend failed." });
        return;
      }
      setBaseState(res.state);
      pushLog(res?.log || { type: "info", message: "Spent from vault." });
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Spend failed." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleHireCrew() {
    if (!baseState || isBusy) return;
    setIsBusy(true);
    try {
      const res = await hireCrewAction();
      if (!res?.success || !res?.state) {
        pushLog({ type: "error", message: res?.message || "Hire failed." });
        return;
      }
      setBaseState(res.state);
      pushLog(res?.log || { type: "info", message: "Crew hired." });
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Hire failed." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleMaintenance() {
    if (!baseState || isBusy) return;
    setIsBusy(true);
    try {
      const res = await performMaintenanceAction();
      if (!res?.success || !res?.state) {
        pushLog({ type: "error", message: res?.message || "Maintenance failed." });
        return;
      }
      setBaseState(res.state);
      pushLog(res?.log || { type: "info", message: "Maintenance done." });
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Maintenance failed." });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClaimMission(missionKey) {
    if (!baseState || isBusy) return;
    setIsBusy(true);
    try {
      const res = await claimBaseMission(missionKey);
      if (!res?.success || !res?.state) {
        pushLog({ type: "error", message: res?.message || "Claim failed." });
        return;
      }
      setBaseState(res.state);
      pushLog(res?.log || { type: "info", message: "Mission claimed." });
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Claim failed." });
    } finally {
      setIsBusy(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
          <p>Loading your base...</p>
        </div>
      </Layout>
    );
  }

  if (error || !baseState) {
    return (
      <Layout>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center">
          <p className="text-red-400">{error || "Unable to load base state."}</p>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            onClick={() => typeof window !== "undefined" && window.location.reload()}
          >
            Retry
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-slate-950 text-slate-50 min-h-[100dvh] md:h-[100dvh] md:overflow-hidden">
        <div className="mx-auto flex h-[100dvh] max-w-[1600px] flex-col overflow-hidden px-2 py-2 md:grid md:grid-cols-[332px_minmax(0,1fr)] md:gap-3 md:px-3 md:py-3">
          <aside className="hidden md:flex md:min-h-0 md:flex-col md:gap-3">
            <BaseHudV3 base={baseState} />
            <BaseHintV3 base={baseState} />
            <div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-800 bg-slate-900/55 backdrop-blur">
              <div className="border-b border-slate-800 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.25em] text-slate-500">Activity</div>
                <div className="mt-1 text-sm font-semibold text-slate-200">Base events</div>
              </div>
              <div className="h-[calc(100%-68px)] overflow-y-auto">
                <ActivityFeedV3 items={logItems} mode="desktop" />
              </div>
            </div>
          </aside>

          <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-slate-800 bg-slate-900/40 backdrop-blur md:pr-[7rem]">
            <div className="md:hidden shrink-0 space-y-2">
              <BaseHudV3 base={baseState} />
              <BaseHintV3 base={baseState} />
            </div>

            <div className="flex min-h-0 flex-1 px-1 pb-2 pt-2 md:px-4 md:py-4">
              <BaseSceneV3
                base={baseState}
                selected={selectedBuilding}
                onSelect={setSelectedBuilding}
              />
            </div>

            <div className="md:hidden shrink-0">
              <ActivityFeedV3 items={logItems} mode="mobile" />
            </div>

            <BaseUtilityTrayV3
              base={baseState}
              hubHref="/mining"
              busy={isBusy}
              sheetOpen={Boolean(selectedBuilding)}
              onExpedition={handleExpedition}
              onMaintenance={handleMaintenance}
              onShipToVault={handleShipToVault}
              onHireCrew={handleHireCrew}
              onClaimMission={handleClaimMission}
              claimableMissionKeys={baseState?.claimableMissions ?? []}
            />
          </section>
        </div>

        <BuildingSheetV3
          base={baseState}
          buildingKey={selectedBuilding}
          busy={isBusy}
          onClose={() => setSelectedBuilding(null)}
          onBuild={handleBuild}
          onExpedition={handleExpedition}
          onMaintenance={handleMaintenance}
          onInstallModule={handleInstallModule}
          onResearch={handleResearch}
          onShipToVault={handleShipToVault}
          onSpendFromVault={handleSpendFromVault}
          onHireCrew={handleHireCrew}
          onClaimMission={handleClaimMission}
        />
      </div>
    </Layout>
  );
}
