import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { MetaState } from "./types";

/** Normalize nickname for Firestore document ID */
function norm(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Save meta state to Firestore (fire-and-forget) */
export function saveMetaToCloud(nickname: string, meta: MetaState): void {
  const id = norm(nickname);
  if (!id) return;
  const ref = doc(db, "players", id);
  setDoc(ref, {
    gold: meta.gold,
    permanentUpgrades: meta.permanentUpgrades,
    unlockedCharacters: meta.unlockedCharacters,
    unlockedMaps: meta.unlockedMaps,
    totalRuns: meta.totalRuns,
    achievements: meta.achievements,
    updatedAt: new Date().toISOString(),
  }, { merge: true }).catch((e) => {
    console.warn("Cloud save failed:", e);
  });
}

/** Load meta state from Firestore */
export async function loadMetaFromCloud(nickname: string): Promise<MetaState | null> {
  try {
    const id = norm(nickname);
    if (!id) return null;
    const ref = doc(db, "players", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      gold: data.gold ?? 0,
      permanentUpgrades: data.permanentUpgrades ?? {},
      unlockedCharacters: data.unlockedCharacters ?? ["knight"],
      unlockedMaps: data.unlockedMaps ?? ["forest"],
      totalRuns: data.totalRuns ?? 0,
      achievements: data.achievements ?? { maxKills: 0, maxSurvivalTime: 0, maxLevel: 0, totalRuns: 0 },
      unlockedSkins: data.unlockedSkins ?? [],
      selectedSkins: data.selectedSkins ?? {},
    };
  } catch (e) {
    console.warn("Cloud load failed:", e);
    return null;
  }
}

/** Merge two MetaStates: higher values for numbers, union for arrays, higher for each upgrade level */
export function mergeMetaStates(local: MetaState, cloud: MetaState): MetaState {
  // Merge permanent upgrades: take higher level for each
  const mergedUpgrades: Record<string, number> = { ...local.permanentUpgrades };
  for (const [key, val] of Object.entries(cloud.permanentUpgrades)) {
    mergedUpgrades[key] = Math.max(mergedUpgrades[key] ?? 0, val);
  }

  // Union arrays
  const mergedChars = [...new Set([...local.unlockedCharacters, ...cloud.unlockedCharacters])];
  const mergedMaps = [...new Set([...local.unlockedMaps, ...cloud.unlockedMaps])];

  // Merge achievements: take higher
  const mergedAchievements = {
    maxKills: Math.max(local.achievements.maxKills, cloud.achievements.maxKills),
    maxSurvivalTime: Math.max(local.achievements.maxSurvivalTime, cloud.achievements.maxSurvivalTime),
    maxLevel: Math.max(local.achievements.maxLevel, cloud.achievements.maxLevel),
    totalRuns: Math.max(local.achievements.totalRuns, cloud.achievements.totalRuns),
  };

  return {
    gold: Math.max(local.gold, cloud.gold),
    permanentUpgrades: mergedUpgrades,
    unlockedCharacters: mergedChars,
    unlockedMaps: mergedMaps,
    totalRuns: Math.max(local.totalRuns, cloud.totalRuns),
    achievements: mergedAchievements,
    unlockedSkins: [...new Set([...(local.unlockedSkins || []), ...(cloud.unlockedSkins || [])])],
    selectedSkins: { ...(local.selectedSkins || {}), ...(cloud.selectedSkins || {}) },
  };
}
