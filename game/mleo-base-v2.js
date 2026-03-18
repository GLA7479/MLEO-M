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
        const baseState = await getBaseState();
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
    return getBaseVaultBalance();
  }, []);

  function pushLog(entry) {
    logRef.current = [
      { id: Date.now(), ...entry },
      ...logRef.current,
    ].slice(0, MAX_LOG_ITEMS);
  }

  // Placeholder action wrappers.
  // These should mirror the behavior from mleo-base.js without changing rules.
  async function handleBuild(key) {
    if (!state) return;
    try {
      const result = await buildBuilding(key);
      if (result?.state) {
        setState(result.state);
      }
      if (result?.log) {
        pushLog(result.log);
      } else if (result?.message) {
        pushLog({ type: "info", message: result.message });
      }
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Build failed." });
    }
  }

  async function handleInstallModule(key) {
    if (!state) return;
    try {
      const result = await installModule(key);
      if (result?.state) {
        setState(result.state);
      }
      if (result?.log) {
        pushLog(result.log);
      } else if (result?.message) {
        pushLog({ type: "info", message: result.message });
      }
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Module install failed." });
    }
  }

  async function handleResearch(key) {
    if (!state) return;
    try {
      const result = await researchTech(key);
      if (result?.state) {
        setState(result.state);
      }
      if (result?.log) {
        pushLog(result.log);
      } else if (result?.message) {
        pushLog({ type: "info", message: result.message });
      }
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Research failed." });
    }
  }

  async function handleLaunchExpedition(config) {
    if (!state) return;
    try {
      const result = await launchExpeditionAction(config);
      if (result?.state) {
        setState(result.state);
      }
      if (result?.log) {
        pushLog(result.log);
      } else if (result?.message) {
        pushLog({ type: "info", message: result.message });
      }
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Expedition failed." });
    }
  }

  async function handleShipToVault(payload) {
    if (!state) return;
    try {
      const result = await shipToVault();
      if (result?.state) {
        setState(result.state);
      }
      if (result?.log) {
        pushLog(result.log);
      } else if (result?.message) {
        pushLog({ type: "info", message: result.message });
      }
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Shipment failed." });
    }
  }

  async function handleSpendFromVault(payload) {
    if (!state) return;
    try {
      const result = await spendFromVault(payload);
      if (result?.state) {
        setState(result.state);
      }
      if (result?.log) {
        pushLog(result.log);
      } else if (result?.message) {
        pushLog({ type: "info", message: result.message });
      }
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Spend failed." });
    }
  }

  async function handleHireCrew() {
    if (!state) return;
    try {
      const result = await hireCrewAction();
      if (result?.state) {
        setState(result.state);
      }
      if (result?.log) {
        pushLog(result.log);
      } else if (result?.message) {
        pushLog({ type: "info", message: result.message });
      }
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Hire failed." });
    }
  }

  async function handleMaintenance() {
    if (!state) return;
    try {
      const result = await performMaintenanceAction();
      if (result?.state) {
        setState(result.state);
      }
      if (result?.log) {
        pushLog(result.log);
      } else if (result?.message) {
        pushLog({ type: "info", message: result.message });
      }
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Maintenance failed." });
    }
  }

  async function handleClaimMission(id) {
    if (!state) return;
    try {
      const result = await claimBaseMission(id);
      if (result?.state) {
        setState(result.state);
      }
      if (result?.log) {
        pushLog(result.log);
      } else if (result?.message) {
        pushLog({ type: "info", message: result.message });
      }
    } catch (err) {
      console.error(err);
      pushLog({ type: "error", message: "Claim failed." });
    }
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
      <div className="min-h-screen bg-slate-950/80 text-neutral-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          {/* Header */}
          <header className="flex flex-col gap-2 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  MLEO BASE // V2
                </span>
                {address && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </span>
                )}
              </div>
              <BaseHud state={state} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {openAccountModal && address && (
                <button
                  className="rounded border border-slate-600 bg-slate-900 px-3 py-1 text-xs hover:border-slate-400"
                  onClick={openAccountModal}
                >
                  Account
                </button>
              )}
              {openConnectModal && !address && (
                <button
                  className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium hover:bg-indigo-500"
                  onClick={openConnectModal}
                >
                  Connect Wallet
                </button>
              )}
              <Link
                href="/mleo-base"
                className="rounded border border-slate-700 px-3 py-1 text-xs hover:border-slate-400"
              >
                Legacy View
              </Link>
            </div>
          </header>

          {/* Main content */}
          <main className="flex flex-col gap-4 xl:flex-row">
            {/* Map section */}
            <section className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-wide text-slate-200">
                  Base overview
                </h2>
                <span className="text-[11px] text-slate-500">
                  Visual layer on top of existing logic
                </span>
              </div>
              <div className="min-h-[260px] rounded-lg border border-slate-800 bg-slate-950/80 p-2 sm:p-3">
                <BaseMap
                  state={state}
                  onSelectBuilding={(key) => {
                    setSelectedBuildingKey(key);
                  }}
                />
              </div>
            </section>

            {/* Detail / actions */}
            <aside className="w-full space-y-3 xl:w-[340px]">
              <div className="rounded-lg border border-slate-800 bg-slate-950/90 px-3 py-2 text-xs text-slate-300">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[11px] font-semibold tracking-wide text-slate-200">
                    Actions & detail
                  </h2>
                </div>
                <div className="space-y-3">
                  <BuildingPanel
                    state={state}
                    selectedKey={selectedBuildingKey}
                    onBuild={handleBuild}
                  />
                  <ExpeditionPanel
                    state={state}
                    onLaunch={handleLaunchExpedition}
                  />
                  <CrewPanel state={state} />
                </div>
              </div>
            </aside>
          </main>

          {/* Activity / log */}
          <section className="rounded-lg border border-slate-800 bg-slate-950/90 px-3 py-2">
            <EventStrip items={logRef.current} max={MAX_LOG_ITEMS} />
          </section>
        </div>
      </div>
    </Layout>
  );
}

