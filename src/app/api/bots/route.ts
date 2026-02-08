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

const BOT_SECRET = process.env.BOT_SECRET || "hordecraft_bot_secret_2026";

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

    // Ensure named bots have nicknames claimed (best-effort, skip on error)
    for (const name of NAMED_BOTS) {
      try {
        const normId = name.trim().toLowerCase().replace(/\s+/g, "_");
        const nickRef = doc(db, "nicknames", normId);
        const nickSnap = await getDocs(query(collection(db, "nicknames"), where("nickname", "==", name), limit(1)));
        if (nickSnap.empty) {
          await setDoc(nickRef, {
            nickname: name,
            pin: String(Math.floor(1000 + Math.random() * 9000)),
            claimedAt: new Date().toISOString(),
          });
        }
      } catch {} // skip nickname claim errors
    }

    // Write presence docs for 30-45 "online" bots with FIXED IDs (so they get updated, not duplicated)
    const presenceCount = Math.floor(Math.random() * 16) + 30;
    for (let i = 0; i < presenceCount; i++) {
      const presId = `bot_persistent_${i}`;
      promises.push(setDoc(doc(db, "presence", presId), { timestamp: Date.now() }));
    }

    // Bot chat messages (1-2 messages per run, diverse and natural)
    const trMessages = [
      "selam", "gg wp", "bu oyun baya sarıyor", "stone golem nasıl yeniliyor?",
      "necromancer ile 18dk dayandım", "fire trail + frost nova deneyin efsane",
      "çöl haritası aşırı zor ya", "yeni haritayı açtım sonunda 🎉",
      "berserker en iyi karakter bence", "50 combo yaptım az önce",
      "knight ile başlayın tavsiyem", "boss'a az kaldı ama öldüm 😭",
      "mağazadan magnet al ilk önce", "lvl 40'a kim ulaştı?",
      "spider düşmanlar sinir bozucu", "rogue hız efsane ya",
      "şu orbit blade çok op", "sıralamada 3. oldum 🏆",
      "arkadaşlarla oynasak süper olur", "priest ile regen kasınca ölmüyorsun",
      "troll düşmanın regenini kesemiyorum", "elite mob'lar çok XP veriyor",
      "gg herkese", "ben yeni başladım nasıl oynuyoruz?", "void vortex denediniz mi?",
      "shockwave alanı çok geniş süper", "lav havuzlarına dikkat edin",
      "meteor yağmuru çok epik", "shadow lord'u yendim sonunda!",
      "2 saat oynadım farkında bile olmadım 😅",
    ];
    const enMessages = [
      "hey", "gg wp", "this game is so addicting", "how do you beat stone golem?",
      "18min with necromancer!", "try fire trail + frost nova combo",
      "desert map is brutal", "finally unlocked the new map 🎉",
      "berserker is the best imo", "just hit 50 combo",
      "start with knight trust me", "almost beat the boss then died 😭",
      "buy magnet upgrade first", "who reached lvl 40?",
      "spider enemies are so annoying", "rogue speed is nuts",
      "orbit blade is so broken lol", "rank 3 on leaderboard 🏆",
      "wish we could play co-op", "priest regen build is immortal",
      "can't outdamage troll regen", "elite mobs give crazy XP",
      "gg everyone", "just started, any tips?", "have you tried void vortex?",
      "shockwave range is insane", "watch out for lava pools",
      "meteor shower is so epic", "finally beat shadow lord!",
      "played 2 hours without realizing 😅",
    ];
    // Turkish bot names speak Turkish, English names speak English
    const trBotNames = new Set(["xKralx", "GölgeAvcısı", "Yıldırım34", "KurtAdam55", "AlpSavaşçı"]);
    const chatCount = Math.floor(Math.random() * 3) + 1;
    const chatNickColors = ["#ff6b6b","#4ecdc4","#ffe66d","#a8e6cf","#ff8a80","#82b1ff","#b388ff","#f48fb1"];
    const usedNicks = new Set<string>();
    const usedMsgs = new Set<string>();
    for (let i = 0; i < chatCount; i++) {
      // Pick unique bot nickname
      let chatNick: string;
      let attempts = 0;
      do {
        chatNick = scores[Math.floor(Math.random() * scores.length)]?.nickname || NAMED_BOTS[Math.floor(Math.random() * NAMED_BOTS.length)];
        attempts++;
      } while (usedNicks.has(chatNick) && attempts < 10);
      usedNicks.add(chatNick);
      // Pick message in correct language, no duplicate messages
      const pool = trBotNames.has(chatNick) ? trMessages : enMessages;
      let msg: string;
      attempts = 0;
      do {
        msg = pool[Math.floor(Math.random() * pool.length)];
        attempts++;
      } while (usedMsgs.has(msg) && attempts < 10);
      usedMsgs.add(msg);
      const color = chatNickColors[Math.floor(Math.random() * chatNickColors.length)];
      promises.push(addDoc(collection(db, "chat"), {
        nickname: chatNick,
        text: msg,
        timestamp: Date.now() - Math.floor(Math.random() * 60000),
        color,
      }));
    }

    await Promise.allSettled(promises);

    return NextResponse.json({
      success: true,
      scoresGenerated: scoreCount,
      presenceBots: presenceCount,
      chatMessages: chatCount,
      scores: scores.map(s => ({ nickname: s.nickname, score: s.score })),
    });
  } catch (error) {
    console.error("Bot generation failed:", error);
    return NextResponse.json({ error: "Internal error", details: String(error) }, { status: 500 });
  }
}
