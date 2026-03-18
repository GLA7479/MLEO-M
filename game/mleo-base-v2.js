import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useAccountModal, useConnectModal } from "@rainbow-me/rainbowkit";
import Layout from "../components/Layout";
import { BaseMap } from "./base-v2/components/BaseMap";
import { BaseHud } from "./base-v2/components/BaseHud";
import { EventStrip } from "./base-v2/components/EventStrip";
import { BuildingPanel } from "./base-v2/components/BuildingPanel";
import { ExpeditionPanel } from "./base-v2/components/ExpeditionPanel";
import { CrewPanel } from "./base-v2/components/CrewPanel";
import {
  applyBaseVaultDelta,
  getBaseVaultBalance,
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

// NOTE:
// This is a V2 visual shell for the MLEO base game.
// Gameplay rules, simulation logic and server/RPC behavior should remain identical
// to the original implementation in mleo-base.js.

// For now we reuse the same core constants and logic by importing from the original file
// once they are factored out. Until then, we keep a minimal wrapper and delegate to the
// existing page while providing a new layout scaffold.

const MAX_LOG_ITEMS = 16;

export default function MleoBaseV2() {
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBuildingKey, setSelectedBuildingKey] = useState(null);

  const logRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        if (!address) {
          setLoading(false);
          return;
        }
        const baseState = await getBaseState(address);
        if (cancelled) return;
        setState(baseState);
        setLoading(false);
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setError("Failed to load base state.");
        setLoading(false);
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const baseVaultBalance = useMemo(() => {
    if (!address) return null;
    return getBaseVaultBalance(address);
  }, [address]);

  function pushLog(entry) {
    logRef.current = [
      { id: Date.now(), ...entry },
      ...logRef.current,
    ].slice(0, MAX_LOG_ITEMS);
  }

  // Placeholder action wrappers.
  // These should mirror the behavior from mleo-base.js without changing rules.
  async function handleBuild(key) {
    if (!address || !state) return;
    try {
      const result = await buildBuilding(address, key);
      setState(result.state);
      if (result.log) pushLog(result.log);
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Build failed." });
    }
  }

  async function handleInstallModule(key) {
    if (!address || !state) return;
    try {
      const result = await installModule(address, key);
      setState(result.state);
      if (result.log) pushLog(result.log);
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Module install failed." });
    }
  }

  async function handleResearch(key) {
    if (!address || !state) return;
    try {
      const result = await researchTech(address, key);
      setState(result.state);
      if (result.log) pushLog(result.log);
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Research failed." });
    }
  }

  async function handleLaunchExpedition(config) {
    if (!address || !state) return;
    try {
      const result = await launchExpeditionAction(address, config);
      setState(result.state);
      if (result.log) pushLog(result.log);
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Expedition failed." });
    }
  }

  async function handleShipToVault(payload) {
    if (!address || !state) return;
    try {
      const result = await shipToVault(address, payload);
      setState(result.state);
      if (result.log) pushLog(result.log);
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Shipment failed." });
    }
  }

  async function handleSpendFromVault(payload) {
    if (!address || !state) return;
    try {
      const result = await spendFromVault(address, payload);
      setState(result.state);
      if (result.log) pushLog(result.log);
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Spend failed." });
    }
  }

  async function handleHireCrew() {
    if (!address || !state) return;
    try {
      const result = await hireCrewAction(address);
      setState(result.state);
      if (result.log) pushLog(result.log);
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Hire failed." });
    }
  }

  async function handleMaintenance() {
    if (!address || !state) return;
    try {
      const result = await performMaintenanceAction(address);
      setState(result.state);
      if (result.log) pushLog(result.log);
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Maintenance failed." });
    }
  }

  async function handleClaimMission(id) {
    if (!address || !state) return;
    try {
      const result = await claimBaseMission(address, id);
      setState(result.state);
      if (result.log) pushLog(result.log);
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Claim failed." });
    }
  }

  if (!address) {
    return (
      <Layout>
        <div className="mx-auto max-w-4xl py-16 px-4 text-center">
          <h1 className="text-3xl font-bold mb-4">MLEO Base V2</h1>
          <p className="mb-6 text-neutral-300">
            Connect your wallet to access your base.
          </p>
          {openConnectModal && (
            <button
              className="rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500"
              onClick={openConnectModal}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="mx-auto max-w-4xl py-16 px-4 text-center">
          <p className="text-neutral-300">Loading your base...</p>
        </div>
      </Layout>
    );
  }

  if (error || !state) {
    return (
      <Layout>
        <div className="mx-auto max-w-4xl py-16 px-4 text-center">
          <p className="text-red-400 mb-4">
            {error || "Unable to load base state."}
          </p>
          <button
            className="rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500"
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
      <div className="flex h-[calc(100vh-4rem)] flex-col bg-slate-950/70 text-neutral-100">
        {/* Top HUD */}
        <div className="border-b border-slate-800 bg-slate-900/70 px-4 py-2 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="text-sm uppercase tracking-wide text-slate-400">
                MLEO BASE // V2
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                Commander: {address.slice(0, 6)}...{address.slice(-4)}
              </span>
            </div>
            <BaseHud state={state} />
          </div>
          <div className="flex items-center gap-2">
            {openAccountModal && (
              <button
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs hover:border-slate-400"
                onClick={openAccountModal}
              >
                Account
              </button>
            )}
            <Link
              href="/game/mleo-base"
              className="rounded border border-slate-700 px-2 py-1 text-xs hover:border-slate-400"
            >
              Legacy View
            </Link>
          </div>
        </div>

        {/* Main layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* World / Base map */}
          <div className="flex-1 border-r border-slate-900 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-slate-300">
                BASE OVERVIEW
              </h2>
              <span className="text-xs text-slate-500">
                Prototype layout – logic mirrors V1
              </span>
            </div>
            <BaseMap
              state={state}
              onSelectBuilding={(key) => {
                setSelectedBuildingKey(key);
              }}
            />
          </div>

          {/* Right actions / panels */}
          <div className="w-80 flex flex-col border-l border-slate-900 bg-slate-950/90">
            <div className="border-b border-slate-900 px-3 py-2">
              <h2 className="text-xs font-semibold tracking-wide text-slate-300">
                ACTIONS & DETAIL
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 text-xs text-slate-300 space-y-3">
              <BuildingPanel
                state={state}
                selectedKey={selectedBuildingKey}
                onBuild={handleBuild}
              />
              <ExpeditionPanel state={state} onLaunch={handleLaunchExpedition} />
              <CrewPanel state={state} />
            </div>
          </div>
        </div>

        {/* Bottom log strip */}
        <div className="border-t border-slate-900 bg-slate-950/95 px-3 py-2">
          <EventStrip items={logRef.current} max={MAX_LOG_ITEMS} />
        </div>
      </div>
    </Layout>
  );
}

