export function mergeProgressFromServer({
  prev,
  serverState,
  normalizeServerState,
  applyLevelUps,
  todayKey,
  overrides = {},
}) {
  const base = normalizeServerState(serverState, prev);

  return applyLevelUps({
    ...prev,
    ...base,
    crewRole: base?.crewRole ?? prev?.crewRole ?? "engineer",
    commanderPath: base?.commanderPath ?? prev?.commanderPath ?? "industry",
    missionState: {
      dailySeed: base?.missionState?.dailySeed || prev?.missionState?.dailySeed || todayKey(),
      completed: {
        ...(prev?.missionState?.completed || {}),
        ...(base?.missionState?.completed || {}),
      },
      claimed: {
        ...(prev?.missionState?.claimed || {}),
        ...(base?.missionState?.claimed || {}),
      },
    },
    ...overrides,
  });
}
