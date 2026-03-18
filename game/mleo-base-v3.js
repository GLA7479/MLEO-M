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

const MAX_LOG_ITEMS = 16;

// V3: scene-first mobile-first game screen. Replaces dashboard feel with a game screen.
// Gameplay rules, backend endpoints, server state shape and action semantics unchanged.

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
    return () => { cancelled = true; };
  }, []);

  function pushLog(entry) {
    const item = { id: Date.now(), ...entry };
    setLogItems((prev) => [item, ...prev].slice(0, MAX_LOG_ITEMS));
  }

  async function refreshBase() {
    try {
      const res = await getBaseState();
      if (res?.success && res?.state) setBaseState(res.state);
    } catch (e) {
      console.warn("Refresh failed", e);
    }
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
      if (res?.log) pushLog(res.log);
      else pushLog({ type: "info", message: "Build completed." });
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
      if (res?.log) pushLog(res.log);
      else pushLog({ type: "info", message: "Module installed." });
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
      if (res?.log) pushLog(res.log);
      else pushLog({ type: "info", message: "Research completed." });
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
      if (res?.log) pushLog(res.log);
      else pushLog({ type: "info", message: "Expedition launched." });
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
      if (res?.log) pushLog(res.log);
      else pushLog({ type: "info", message: "Shipped to vault." });
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
      if (res?.log) pushLog(res.log);
      else pushLog({ type: "info", message: "Spent from vault." });
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
      if (res?.log) pushLog(res.log);
      else pushLog({ type: "info", message: "Crew hired." });
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
      if (res?.log) pushLog(res.log);
      else pushLog({ type: "info", message: "Maintenance done." });
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
      if (res?.log) pushLog(res.log);
      else pushLog({ type: "info", message: "Mission claimed." });
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
      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-50">
        <BaseHudV3 base={baseState} />

        <div className="flex-1 flex items-stretch justify-center px-3 pb-2">
          <BaseSceneV3
            base={baseState}
            selected={selectedBuilding}
            onSelect={setSelectedBuilding}
          />
        </div>

        <BaseUtilityTrayV3
          hubHref="/mining"
          busy={isBusy}
          onExpedition={handleExpedition}
          onMaintenance={handleMaintenance}
          onShipToVault={handleShipToVault}
          onHireCrew={handleHireCrew}
          onClaimMission={handleClaimMission}
          claimableMissionKeys={baseState?.claimableMissions ?? []}
        />
        <ActivityFeedV3 items={logItems} />
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
    </Layout>
  );
}
