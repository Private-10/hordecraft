import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, addDoc, query, where, limit, getDocs, doc, setDoc } from "firebase/firestore";
import { generateBotScore, NAMED_BOTS } from "@/game/bots";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getDb() {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig, "bot-api") : getApps().find(a => a.name === "bot-api") || initializeApp(firebaseConfig, "bot-api");
  return getFirestore(app);
}

const BOT_SECRET = "hordecraft_bot_secret_2026";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();
    const promises: Promise<unknown>[] = [];

    // Generate 3-8 bot scores
    const scoreCount = Math.floor(Math.random() * 6) + 3;
    const scores = [];
    for (let i = 0; i < scoreCount; i++) {
      const score = generateBotScore();
      scores.push(score);
      promises.push(addDoc(collection(db, "scores"), score));
    }

    // Ensure named bots have nicknames claimed
    for (const name of NAMED_BOTS) {
      const snap = await getDocs(query(collection(db, "nicknames"), where("nickname", "==", name), limit(1)));
      if (snap.empty) {
        promises.push(addDoc(collection(db, "nicknames"), {
          nickname: name,
          pin: String(Math.floor(1000 + Math.random() * 9000)),
          claimedAt: Date.now(),
        }));
      }
    }

    // Write presence docs for 5-15 "online" bots
    const presenceCount = Math.floor(Math.random() * 11) + 5;
    for (let i = 0; i < presenceCount; i++) {
      const presId = `bot_${Date.now()}_${i}`;
      promises.push(setDoc(doc(db, "presence", presId), { timestamp: Date.now() }));
    }

    await Promise.all(promises);

    return NextResponse.json({
      success: true,
      scoresGenerated: scoreCount,
      presenceBots: presenceCount,
      scores: scores.map(s => ({ nickname: s.nickname, score: s.score })),
    });
  } catch (error) {
    console.error("Bot generation failed:", error);
    return NextResponse.json({ error: "Internal error", details: String(error) }, { status: 500 });
  }
}
