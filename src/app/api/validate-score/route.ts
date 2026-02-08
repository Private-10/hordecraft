import { NextRequest, NextResponse } from "next/server";
import { db } from "@/game/firebase";
import { collection, addDoc } from "firebase/firestore";

// Score formula constants (must match client)
const SCORE_CONSTANTS = {
  timeMultiplier: 10,
  killPoints: 2,
  levelPoints: 50,
  bossPoints: 500,
};

interface ValidateRequest {
  nickname: string;
  score: number;
  kills: number;
  survivalTime: number;
  level: number;
  maxCombo: number;
  character: string;
  map: string;
  bossKills?: number;
  integrity: {
    integrityHash: number;
    integrityScore: number;
    timeConsistency: boolean;
    timeCheckpoints: { gameTime: number; realTime: number }[];
    maxDPS: number;
    killRate: number;
    statsHash: number;
    realElapsedTime: number;
    totalDamageDealt: number;
  };
}

function validateScore(data: ValidateRequest): { verified: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const { kills, survivalTime, level, score, bossKills = 0, maxCombo = 0, integrity } = data;

  // 1. Time consistency: real elapsed vs game time (allow 10% + 5s grace)
  if (integrity.realElapsedTime > 0) {
    const timeDiff = Math.abs(integrity.realElapsedTime - survivalTime);
    const maxAllowed = integrity.realElapsedTime * 0.1 + 5;
    if (timeDiff > maxAllowed) {
      reasons.push(`time_mismatch: diff=${timeDiff.toFixed(1)}s allowed=${maxAllowed.toFixed(1)}s`);
    }
  }

  // 2. Kill rate: max ~3 kills/second sustained
  if (survivalTime > 10) {
    const killsPerSecond = kills / survivalTime;
    if (killsPerSecond > 3) {
      reasons.push(`kill_rate_too_high: ${killsPerSecond.toFixed(2)}/s`);
    }
  }

  // 3. Score formula validation
  const expectedScore = Math.floor(
    survivalTime * SCORE_CONSTANTS.timeMultiplier +
    kills * SCORE_CONSTANTS.killPoints +
    level * SCORE_CONSTANTS.levelPoints +
    bossKills * SCORE_CONSTANTS.bossPoints +
    maxCombo * 10
  );
  // Allow 5% variance due to timing
  const scoreDiff = Math.abs(score - expectedScore);
  if (scoreDiff > expectedScore * 0.05 + 50) {
    reasons.push(`score_mismatch: got=${score} expected≈${expectedScore}`);
  }

  // 4. Level vs survival time (roughly 1 level per 15-30s, generous)
  if (survivalTime > 30) {
    const maxReasonableLevel = Math.floor(survivalTime / 10) + 5; // very generous
    if (level > maxReasonableLevel) {
      reasons.push(`level_too_high: ${level} max≈${maxReasonableLevel}`);
    }
  }

  // 5. DPS not impossibly high
  if (integrity.maxDPS > 5000) {
    reasons.push(`dps_impossibly_high: ${integrity.maxDPS}`);
  }

  // 6. Integrity score from client
  if (integrity.integrityScore < 50) {
    reasons.push(`low_client_integrity: ${integrity.integrityScore}`);
  }

  return {
    verified: reasons.length === 0,
    reasons,
  };
}

export async function POST(request: NextRequest) {
  try {
    const data: ValidateRequest = await request.json();

    // Basic input validation
    if (!data.nickname || typeof data.score !== "number" || typeof data.kills !== "number") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { verified, reasons } = validateScore(data);

    // Write to Firestore
    const docRef = await addDoc(collection(db, "scores"), {
      nickname: data.nickname,
      score: data.score,
      kills: data.kills,
      survivalTime: data.survivalTime,
      level: data.level,
      maxCombo: data.maxCombo,
      character: data.character,
      map: data.map,
      bossKills: data.bossKills || 0,
      verified,
      verificationReasons: reasons,
      date: new Date().toISOString(),
    });

    return NextResponse.json({
      validated: verified,
      docId: docRef.id,
      reasons: verified ? [] : reasons,
    });
  } catch (error) {
    console.error("Validate score error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
