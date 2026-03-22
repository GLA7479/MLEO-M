import {
  getWorldDailyMleoCapByOrder,
  resolveSectorWorldOrder,
  WORLD_BY_ORDER,
  WORLD_MAX_ORDER,
  WORLDS,
} from "./catalog";
import { buildActiveWorldPanelFlavor } from "./worldPanelFlavor";

const SUPPORT_KEYS = ["logisticsCenter", "researchLab", "repairBay"];

/** Mirrors engine milestone layout (avoid circular import from engine). */
const MILESTONE_KEYS_BY_BUILDING = {
  logisticsCenter: ["disciplined_pipeline", "buffer_authority"],
  researchLab: ["matrix_operator", "telemetry_controller"],
  repairBay: ["preventive_standard", "mesh_discipline"],
};

function supportLevel(state, key) {
  return Math.max(0, Math.floor(Number(state?.buildings?.[key] || 0)));
}

function supportTier(state, key) {
  return Math.max(1, Math.floor(Number(state?.buildingTiers?.[key] || 1)));
}

function isProgramUnlocked(state, buildingKey, programKey) {
  const u =
    state?.supportProgramUnlocks?.[buildingKey] ||
    state?.support_program_unlocks?.[buildingKey] ||
    {};
  return u[programKey] === true;
}

function activeProgram(state, buildingKey) {
  const v =
    state?.supportProgramActive?.[buildingKey] ?? state?.support_program_active?.[buildingKey] ?? null;
  return typeof v === "string" && v.length ? v : null;
}

function countProgramsUnlocked(state) {
  let n = 0;
  for (const b of SUPPORT_KEYS) {
    const u =
      state?.supportProgramUnlocks?.[b] || state?.support_program_unlocks?.[b] || {};
    for (const k of Object.keys(u)) {
      if (u[k] === true) n += 1;
    }
  }
  return n;
}

function hasAtLeastOneUnlockPerSupportBuilding(state) {
  return SUPPORT_KEYS.every((b) => {
    const u = state?.supportProgramUnlocks?.[b] || state?.support_program_unlocks?.[b] || {};
    return Object.keys(u).some((k) => u[k] === true);
  });
}

function countMilestonesClaimed(state) {
  const claimed = state?.specializationMilestonesClaimed || state?.specialization_milestones_claimed || {};
  let n = 0;
  for (const b of SUPPORT_KEYS) {
    const bucket = claimed[b];
    if (!bucket || typeof bucket !== "object") continue;
    for (const mk of MILESTONE_KEYS_BY_BUILDING[b] || []) {
      if (bucket[mk]) n += 1;
    }
  }
  return n;
}

function milestoneLinesWithClaim(state) {
  const lines = new Set();
  const claimed = state?.specializationMilestonesClaimed || state?.specialization_milestones_claimed || {};
  for (const b of SUPPORT_KEYS) {
    const bucket = claimed[b];
    if (!bucket || typeof bucket !== "object") continue;
    for (const mk of MILESTONE_KEYS_BY_BUILDING[b] || []) {
      if (bucket[mk]) lines.add(b);
    }
  }
  return lines.size;
}

function contractClaimedMap(state) {
  return state?.contractState?.claimed || state?.contract_state?.claimed || {};
}

function countEliteClaims(state) {
  const m = contractClaimedMap(state);
  return Object.keys(m).filter((k) => k.startsWith("elite:") && m[k]).length;
}

/** @returns {Set<string>} logistics | research | repair */
function eliteFamiliesClaimed(state) {
  const m = contractClaimedMap(state);
  const fam = new Set();
  for (const k of Object.keys(m)) {
    if (!m[k] || !k.startsWith("elite:")) continue;
    const part = k.split(":")[1] || "";
    if (part.startsWith("elite_log_")) fam.add("logistics");
    else if (part.startsWith("elite_res_")) fam.add("research");
    else if (part.startsWith("elite_rep_")) fam.add("repair");
  }
  return fam;
}

function hasUnlockedActiveProgram(state) {
  for (const b of SUPPORT_KEYS) {
    const a = activeProgram(state, b);
    if (a && isProgramUnlocked(state, b, a)) return true;
  }
  return false;
}

function hasAnyTierAtLeast(state, minTier) {
  return SUPPORT_KEYS.some((b) => supportLevel(state, b) >= 1 && supportTier(state, b) >= minTier);
}

function allSupportBuilt(state) {
  return SUPPORT_KEYS.every((b) => supportLevel(state, b) >= 1);
}

function allSupportMinTier(state, minTier) {
  return SUPPORT_KEYS.every(
    (b) => supportLevel(state, b) >= 1 && supportTier(state, b) >= minTier
  );
}

function maxSupportTier(state) {
  return Math.max(...SUPPORT_KEYS.map((b) => (supportLevel(state, b) >= 1 ? supportTier(state, b) : 0)));
}

function world6TierGate(state) {
  const tiers = SUPPORT_KEYS.filter((b) => supportLevel(state, b) >= 1).map((b) => supportTier(state, b));
  if (tiers.length < 3) return false;
  const sorted = [...tiers].sort((a, b) => b - a);
  return sorted[0] >= 4 && sorted[1] >= 3 && sorted[2] >= 3;
}

function hasTier3ProgramUnlockedAndActive(state, catalog) {
  for (const b of SUPPORT_KEYS) {
    if (supportTier(state, b) < 3) continue;
    const progKey = activeProgram(state, b);
    if (!progKey || !isProgramUnlocked(state, b, progKey)) continue;
    const meta = catalog?.[b]?.find((p) => p.key === progKey);
    if (meta && Number(meta.minTier || 0) >= 3) return true;
  }
  return false;
}

function systemEmergency(stability) {
  const s = Number(stability ?? 100);
  return s < 50 ? "critical" : s < 70 ? "warning" : "normal";
}

function mergeGroup(pass, checks) {
  return { pass, checks };
}

/**
 * @param {object} state
 * @param {object} derived
 * @param {{ supportProgramCatalog: Record<string, Array<{ key: string, minTier: number }>> }} deps
 */
export function getSectorWorldProgressSnapshot(state, derived, deps) {
  const catalog = deps?.supportProgramCatalog || {};
  const order = resolveSectorWorldOrder(state);
  const current = WORLD_BY_ORDER[order];
  const nextOrder = order < WORLD_MAX_ORDER ? order + 1 : null;
  const next = nextOrder ? WORLD_BY_ORDER[nextOrder] : null;

  const stability = Number(state?.stability ?? 100);
  const energy = Number(state?.resources?.ENERGY || 0);
  const cap = Math.max(1, Number(derived?.energyCap || 148));
  const emergency = systemEmergency(stability);

  const evalTransition = () => {
    if (!nextOrder) {
      return {
        canDeploy: false,
        groups: {
          infrastructure: mergeGroup(true, [{ id: "max", label: "Final sector reached", ok: true }]),
          specialization: mergeGroup(true, []),
          execution: mergeGroup(true, []),
          stability: mergeGroup(true, []),
        },
      };
    }

    if (nextOrder === 2) {
      const gInfra = [
        {
          id: "three_support",
          label: "Logistics, Research Lab, and Repair Bay built",
          ok: allSupportBuilt(state),
        },
        {
          id: "tier2_any",
          label: "At least one support building reached Tier 2",
          ok: hasAnyTierAtLeast(state, 2),
        },
        {
          id: "prog_active",
          label: "At least one support program unlocked and set active",
          ok: hasUnlockedActiveProgram(state),
        },
      ];
      const gSpec = [
        {
          id: "mile1",
          label: "At least one specialization milestone claimed",
          ok: countMilestonesClaimed(state) >= 1,
        },
      ];
      const gExec = [{ id: "none", label: "No extra execution gates at this sector", ok: true }];
      const gStab = [
        { id: "stab84", label: "Stability ≥ 84", ok: stability >= 84 },
        { id: "no_crit", label: "No critical emergency (stability band)", ok: emergency !== "critical" },
      ];
      const groups = {
        infrastructure: mergeGroup(gInfra.every((c) => c.ok), gInfra),
        specialization: mergeGroup(gSpec.every((c) => c.ok), gSpec),
        execution: mergeGroup(gExec.every((c) => c.ok), gExec),
        stability: mergeGroup(gStab.every((c) => c.ok), gStab),
      };
      const canDeploy = Object.values(groups).every((g) => g.pass);
      return { canDeploy, groups };
    }

    if (nextOrder === 3) {
      const gInfra = [
        {
          id: "all_t2",
          label: "All three support buildings at least Tier 2",
          ok: allSupportMinTier(state, 2),
        },
        {
          id: "unlock3",
          label: "At least 3 support programs unlocked (total)",
          ok: countProgramsUnlocked(state) >= 3,
        },
        {
          id: "each_line",
          label: "At least one program unlocked in each support building",
          ok: hasAtLeastOneUnlockPerSupportBuilding(state),
        },
      ];
      const gSpec = [
        {
          id: "mile2lines",
          label: "≥2 specialization milestones from ≥2 different support lines",
          ok: countMilestonesClaimed(state) >= 2 && milestoneLinesWithClaim(state) >= 2,
        },
      ];
      const gExec = [
        {
          id: "regular_contract",
          label: "Regular contract completion tracked (TODO — not enforced yet)",
          ok: true,
        },
      ];
      const gStab = [
        { id: "stab86", label: "Stability ≥ 86", ok: stability >= 86 },
        { id: "en40", label: "Energy ≥ 40% of cap", ok: energy >= cap * 0.4 },
      ];
      const groups = {
        infrastructure: mergeGroup(gInfra.every((c) => c.ok), gInfra),
        specialization: mergeGroup(gSpec.every((c) => c.ok), gSpec),
        execution: mergeGroup(gExec.every((c) => c.ok), gExec),
        stability: mergeGroup(gStab.every((c) => c.ok), gStab),
      };
      const canDeploy = Object.values(groups).every((g) => g.pass);
      return { canDeploy, groups };
    }

    if (nextOrder === 4) {
      const gInfra = [
        {
          id: "any_t3",
          label: "At least one support building reached Tier 3",
          ok: hasAnyTierAtLeast(state, 3),
        },
        {
          id: "t3_prog",
          label: "At least one Tier-3 program unlocked and active",
          ok: hasTier3ProgramUnlockedAndActive(state, catalog),
        },
      ];
      const gSpec = [
        {
          id: "mile3",
          label: "At least 3 specialization milestones claimed",
          ok: countMilestonesClaimed(state) >= 3,
        },
        {
          id: "elite1",
          label: "At least one Elite contract claimed (any rotation)",
          ok: countEliteClaims(state) >= 1,
        },
      ];
      const gExec = [{ id: "none", label: "—", ok: true }];
      const gStab = [
        { id: "stab88", label: "Stability ≥ 88", ok: stability >= 88 },
        { id: "no_crit", label: "No critical emergency", ok: emergency !== "critical" },
      ];
      const groups = {
        infrastructure: mergeGroup(gInfra.every((c) => c.ok), gInfra),
        specialization: mergeGroup(gSpec.every((c) => c.ok), gSpec),
        execution: mergeGroup(true, gExec),
        stability: mergeGroup(gStab.every((c) => c.ok), gStab),
      };
      const canDeploy = Object.values(groups).every((g) => g.pass);
      return { canDeploy, groups };
    }

    if (nextOrder === 5) {
      const fam = eliteFamiliesClaimed(state);
      const eliteFamilyOk = fam.size >= 2;
      const gInfra = [
        {
          id: "all_t3",
          label: "All three support buildings at least Tier 3",
          ok: allSupportMinTier(state, 3),
        },
        {
          id: "unlock6",
          label: "At least 6 support programs unlocked (total)",
          ok: countProgramsUnlocked(state) >= 6,
        },
      ];
      const gSpec = [
        {
          id: "mile4",
          label: "At least 4 specialization milestones claimed",
          ok: countMilestonesClaimed(state) >= 4,
        },
        {
          id: "elite2fam",
          label:
            "≥2 Elite claims from ≥2 specialization families (logistics / research / repair) — TODO fallback: total Elite claims ≥ 2",
          ok: eliteFamilyOk || countEliteClaims(state) >= 2,
        },
      ];
      const gExec = [{ id: "none", label: "—", ok: true }];
      const gStab = [
        { id: "stab90", label: "Stability ≥ 90", ok: stability >= 90 },
        { id: "en45", label: "Energy ≥ 45% of cap", ok: energy >= cap * 0.45 },
      ];
      const groups = {
        infrastructure: mergeGroup(gInfra.every((c) => c.ok), gInfra),
        specialization: mergeGroup(gSpec.every((c) => c.ok), gSpec),
        execution: mergeGroup(true, gExec),
        stability: mergeGroup(gStab.every((c) => c.ok), gStab),
      };
      const canDeploy = Object.values(groups).every((g) => g.pass);
      return { canDeploy, groups };
    }

    if (nextOrder === 6) {
      const gInfra = [
        {
          id: "t4_split",
          label: "One support building Tier 4+; the other two at least Tier 3 (all three built)",
          ok: world6TierGate(state),
        },
        {
          id: "unlock7",
          label: "At least 7 support programs unlocked (total)",
          ok: countProgramsUnlocked(state) >= 7,
        },
      ];
      const gSpec = [
        {
          id: "mile5",
          label: "At least 5 specialization milestones claimed",
          ok: countMilestonesClaimed(state) >= 5,
        },
        {
          id: "elite3",
          label: "At least 3 Elite contract claims (lifetime)",
          ok: countEliteClaims(state) >= 3,
        },
      ];
      const gExec = [{ id: "none", label: "—", ok: true }];
      const gStab = [
        { id: "stab90", label: "Stability ≥ 90", ok: stability >= 90 },
        { id: "en50", label: "Energy ≥ 50% of cap", ok: energy >= cap * 0.5 },
        { id: "no_crit", label: "No critical emergency", ok: emergency !== "critical" },
      ];
      const groups = {
        infrastructure: mergeGroup(gInfra.every((c) => c.ok), gInfra),
        specialization: mergeGroup(gSpec.every((c) => c.ok), gSpec),
        execution: mergeGroup(true, gExec),
        stability: mergeGroup(gStab.every((c) => c.ok), gStab),
      };
      const canDeploy = Object.values(groups).every((g) => g.pass);
      return { canDeploy, groups };
    }

    return {
      canDeploy: false,
      groups: {
        infrastructure: mergeGroup(false, [{ id: "unknown", label: "Unknown sector transition", ok: false }]),
        specialization: mergeGroup(true, []),
        execution: mergeGroup(true, []),
        stability: mergeGroup(true, []),
      },
    };
  };

  const { canDeploy, groups } = evalTransition();

  const highestUnlockedWorldId =
    !!next && canDeploy ? next.id : current?.id ?? "world1";

  return {
    currentWorldOrder: order,
    currentWorldId: current?.id ?? "world1",
    currentWorldName: current?.name ?? "Frontier Base",
    currentDailyCap: getWorldDailyMleoCapByOrder(order),
    highestUnlockedWorldId,
    nextWorldOrder: nextOrder,
    nextWorldId: next?.id ?? null,
    nextWorldName: next?.name ?? null,
    nextDailyCap: next ? next.dailyMleoCap : null,
    canDeployToNextWorld: !!next && canDeploy,
    readiness: groups,
    worldsCatalog: WORLDS,
    panelFlavor: buildActiveWorldPanelFlavor(state, derived, {
      nextWorldName: next?.name ?? null,
      canDeployToNextWorld: !!next && canDeploy,
    }),
  };
}
