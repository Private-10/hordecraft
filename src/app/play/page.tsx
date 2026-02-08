"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine, Audio } from "@/game/engine";
import type { GameState, UpgradeOption } from "@/game/types";
import { t, getLang, setLang, type Lang } from "@/game/i18n";
import { CHARACTERS, type CharacterDef } from "@/game/characters";
import { MAPS } from "@/game/constants";
import type { MetaState } from "@/game/types";
import { getActiveNickname, registerNickname, claimNickname, isNicknameClaimed, logoutNickname } from "@/game/nickname";
import { loadMetaFromCloud, mergeMetaStates } from "@/game/cloud-save";
import { secureSet, secureGet } from "@/game/storage";
import { collection, addDoc, query, orderBy, limit as fbLimit, onSnapshot, doc, setDoc, deleteDoc, getDocs } from "firebase/firestore";
import { db } from "@/game/firebase";
import { trackEvent } from "@/game/analytics";
import { getSkinsForCharacter, type Skin } from "@/game/cosmetics";

export default function PlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>("menu");
  const [deathCause, setDeathCause] = useState("");
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOption[]>([]);
  const [stats, setStats] = useState({
    hp: 100, maxHp: 100, xp: 0, xpToNext: 20, level: 1,
    kills: 0, score: 0, survivalTime: 0, currentCombo: 0,
    comboMultiplier: 1, gold: 0, maxCombo: 0,
  });
  const [weapons, setWeapons] = useState<{ icon: string; level: number }[]>([]);
  const [damageFlash, setDamageFlash] = useState(false);
  const [lang, setLangState] = useState<Lang>("tr");
  const [mounted, setMounted] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [nickname, setNicknameState] = useState("");
  const [pin, setPin] = useState("");
  const [nickError, setNickError] = useState("");
  const [nickLoggedIn, setNickLoggedIn] = useState(false);
  const [nickClaimed, setNickClaimed] = useState(false);
  const [bossInfo, setBossInfo] = useState<{ name: string; hp: number; maxHp: number } | null>(null);
  const [bossWarning, setBossWarning] = useState<string | null>(null);
  const [nextBossTime, setNextBossTime] = useState<number | null>(null);
  const [nickChecking, setNickChecking] = useState(false);
  const [nickBusy, setNickBusy] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastScoreDocId, setLastScoreDocId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [selectedChar, setSelectedCharState] = useState("knight");
  const selectedCharRef = useRef("knight");
  const setSelectedChar = (v: string) => { setSelectedCharState(v); selectedCharRef.current = v; };
  const [showCharSelect, setShowCharSelect] = useState(false);
  const [dps, setDps] = useState(0);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [maxDps, setMaxDps] = useState(0);
  const [showShop, setShowShop] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [invertY, setInvertY] = useState(false);
  const [metaState, setMetaState] = useState<MetaState | null>(null);
  const [selectedMap, setSelectedMapState] = useState("forest");
  const selectedMapRef = useRef("forest");
  const setSelectedMap = (v: string) => { setSelectedMapState(v); selectedMapRef.current = v; };
  const [showMapSelect, setShowMapSelect] = useState(false);
  const [sandstormWarning, setSandstormWarning] = useState(false);
  const [sandstormActive, setSandstormActive] = useState(false);
  const [mistWarning, setMistWarning] = useState(false);
  const [mistActive, setMistActive] = useState(false);
  const [eruptionWarning, setEruptionWarning] = useState(false);
  const [eruptionActive, setEruptionActive] = useState(false);
  const [graphicsQuality, setGraphicsQuality] = useState("medium");
  const [blizzardWarning, setBlizzardWarning] = useState(false);
  const [blizzardActive, setBlizzardActive] = useState(false);
  const [showSkinSelect, setShowSkinSelect] = useState<string | null>(null); // characterId or null
  const [showChat, setShowChat] = useState(true);
  const [chatMessages, setChatMessages] = useState<{nickname:string;text:string;color:string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatCooldown, setChatCooldown] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const presenceIdRef = useRef<string>("");
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const topScoresRef = useRef<number[]>([]);
  const [chestSpinOptions, setChestSpinOptions] = useState<{icon: string, name: string, type: 'weapon' | 'passive', id: string}[]>([]);
  const [showChestSpin, setShowChestSpin] = useState(false);
  const [chestSpinResult, setChestSpinResult] = useState<{icon: string, name: string, type: 'weapon' | 'passive', id: string} | null>(null);

  const submitScore = async (data: Record<string, unknown>): Promise<string | null> => {
    try {
      const { db } = await import("@/game/firebase");
      const { collection, addDoc } = await import("firebase/firestore");
      const docRef = await addDoc(collection(db, "scores"), {
        ...data,
        date: new Date().toISOString(),
      });
      return docRef.id;
    } catch (e) {
      console.error("Score submit failed:", e);
      try {
        const existing = JSON.parse(secureGet("hordecraft_scores") || "[]");
        existing.push({ ...data, date: new Date().toISOString() });
        secureSet("hordecraft_scores", JSON.stringify(existing));
      } catch {}
      return null;
    }
  };

  useEffect(() => {
    document.body.classList.add("play-page");
    return () => { document.body.classList.remove("play-page"); };
  }, []);

  useEffect(() => {
    setMounted(true);
    setLangState(getLang());
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setIsMobileDevice(isTouchDevice);
    const savedNick = getActiveNickname();
    if (savedNick && savedNick.trim().length >= 2) {
      setNicknameState(savedNick);
      setNickLoggedIn(true);
      // Sync cloud meta on page load (delayed to let engine init)
      setTimeout(() => {
        if (engineRef.current) {
          loadMetaFromCloud(savedNick).then(cloud => {
            if (cloud && engineRef.current) {
              const local = engineRef.current.getMetaState();
              const merged = mergeMetaStates(local, cloud);
              engineRef.current.setMetaState(merged);
            }
          }).catch(() => {});
        }
      }, 1500);
    }

    const onMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    const onPointerLockChange = () => {
      setIsPointerLocked(!!document.pointerLockElement);
    };
    if (!isTouchDevice) {
      document.documentElement.style.cursor = "none";
      document.body.style.cursor = "none";
    }
    
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
    };
  }, []);

  // Control body overflow based on game state - iOS needs this
  useEffect(() => {
    if (gameState === "menu") {
      document.body.classList.remove("game-playing");
    } else {
      document.body.classList.add("game-playing");
    }
  }, [gameState]);

  const toggleLang = useCallback(() => {
    const newLang = lang === "tr" ? "en" : "tr";
    setLang(newLang);
    setLangState(newLang);
  }, [lang]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine();
    try {
      engine.init(canvasRef.current);
    } catch (e) {
      console.error("Engine init failed:", e);
      engineRef.current = null;
      return;
    }
    engineRef.current = engine;
    setInvertY(engine.settings.invertY);
    setGraphicsQuality(engine.settings.quality || "medium");
    engine.applyQualitySettings();

    engine.onStateChange = (state: GameState) => {
      setGameState(state);
      if (state === "gameover") {
        // Read death cause
        if (engineRef.current) setDeathCause(engineRef.current.getDeathCause());
        // Update stats one final time (gold is calculated in actualGameOver)
        setStats({
          hp: Math.round(engine.player.hp),
          maxHp: Math.round(engine.player.maxHp),
          xp: engine.player.xp,
          xpToNext: engine.player.xpToNext,
          level: engine.player.level,
          kills: engine.stats.kills,
          score: engine.stats.score,
          survivalTime: engine.stats.survivalTime,
          currentCombo: engine.stats.currentCombo,
          comboMultiplier: engine.stats.comboMultiplier,
          gold: engine.stats.gold,
          maxCombo: engine.stats.maxCombo,
        });
        setScoreSubmitted(false);
        setSubmitting(false);
        trackEvent("game_end", {
          score: engine.stats.score, kills: engine.stats.kills,
          survivalTime: engine.stats.survivalTime, level: engine.player.level,
          character: selectedCharRef.current, map: selectedMapRef.current,
          maxCombo: engine.stats.maxCombo, gold: engine.stats.gold,
        });
        const saved = getActiveNickname();
        const randomAnon = () => {
          const adj = ["Brave","Swift","Shadow","Fierce","Silent","Wild","Dark","Iron","Storm","Frost"];
          const noun = ["Wolf","Hawk","Bear","Fox","Raven","Dragon","Knight","Hunter","Blade","Ghost"];
          return `${adj[Math.floor(Math.random()*adj.length)]}${noun[Math.floor(Math.random()*noun.length)]}${Math.floor(Math.random()*1000)}`;
        };
        const name = (saved && saved.trim().length >= 2) ? saved.trim() : randomAnon();
        setTimeout(async () => {
          try {
            setSubmitting(true);
            setLastScoreDocId(null);
            setLinkCopied(false);
            const integrity = engine.getIntegrityData();
            // Try validated submission first
            try {
              const res = await fetch("/api/validate-score", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  nickname: name,
                  score: engine.stats.score,
                  kills: engine.stats.kills,
                  survivalTime: engine.stats.survivalTime,
                  level: engine.player.level,
                  maxCombo: engine.stats.maxCombo,
                  character: selectedCharRef.current,
                  map: selectedMapRef.current,
                  bossKills: engine.stats.bossKills,
                  integrity,
                }),
              });
              if (res.ok) {
                const result = await res.json();
                if (result.docId) setLastScoreDocId(result.docId);
                setScoreSubmitted(true);
              } else {
                throw new Error("API failed");
              }
            } catch {
              // Fallback: direct Firestore write (unverified)
              const docId = await submitScore({
                nickname: name,
                score: engine.stats.score,
                kills: engine.stats.kills,
                survivalTime: engine.stats.survivalTime,
                level: engine.player.level,
                maxCombo: engine.stats.maxCombo,
                character: selectedCharRef.current,
                map: selectedMapRef.current,
                verified: false,
              });
              if (docId) setLastScoreDocId(docId);
              setScoreSubmitted(true);
            }
          } catch (err) {
            console.error("Score submit failed:", err);
          }
          setSubmitting(false);
        }, 300);
      }
    };

    engine.onStatsUpdate = () => {
      const e = engine;
      setStats({
        hp: Math.round(e.player.hp),
        maxHp: Math.round(e.player.maxHp),
        xp: e.player.xp,
        xpToNext: e.player.xpToNext,
        level: e.player.level,
        kills: e.stats.kills,
        score: e.stats.score,
        survivalTime: e.stats.survivalTime,
        currentCombo: e.stats.currentCombo,
        comboMultiplier: e.stats.comboMultiplier,
        gold: e.stats.gold,
        maxCombo: e.stats.maxCombo,
      });
      setWeapons(e.weapons.map(w => ({ icon: w.icon, level: w.level })));
    };

    engine.onLevelUp = (options: UpgradeOption[]) => {
      setUpgradeOptions(options);
    };

    engine.onChestOpen = (options) => {
      setChestSpinOptions(options);
      setChestSpinResult(null);
      setShowChestSpin(true);

      // Pick random winner
      const winnerIdx = Math.floor(Math.random() * options.length);
      const winner = options[winnerIdx];

      // After 3s animation, show result and apply
      setTimeout(() => {
        setChestSpinResult(winner);
        setTimeout(() => {
          engineRef.current?.applyChestReward(winner.id, winner.type);
          setShowChestSpin(false);
          setChestSpinOptions([]);
          setChestSpinResult(null);
        }, 1200);
      }, 3000);
    };

    engine.onDamage = () => {
      setDamageFlash(true);
      setTimeout(() => setDamageFlash(false), 150);
    };

    engine.onBossSpawn = () => {};
    engine.onBossDeath = () => { setBossInfo(null); };
    engine.onSandstorm = (warning: boolean, active: boolean) => {
      setSandstormWarning(warning);
      setSandstormActive(active);
    };
    engine.onMistWarning = (active: boolean) => setMistWarning(active);
    engine.onMistActive = (active: boolean) => setMistActive(active);
    engine.onEruption = (warning: boolean, active: boolean) => {
      setEruptionWarning(warning);
      setEruptionActive(active);
    };
    engine.onBlizzardWarning = (active: boolean) => setBlizzardWarning(active);
    engine.onBlizzardActive = (active: boolean) => setBlizzardActive(active);

    const origStatsUpdate = engine.onStatsUpdate;
    engine.onStatsUpdate = () => {
      origStatsUpdate?.();
      const currentDps = engine.dps || 0;
      setDps(currentDps);
      setMaxDps(prev => Math.max(prev, currentDps));
      const eng = engine as unknown as {
        activeBoss: { type: string; hp: number; maxHp: number; isAlive: boolean } | null;
        bossSpawned: Set<string>;
        gameTime: number;
      };
      const boss = eng.activeBoss;
      if (boss && boss.isAlive) {
        const names: Record<string, string> = {
          stoneGolem: lang === "tr" ? "⛰️ Taş Golem" : "⛰️ Stone Golem",
          fireWraith: lang === "tr" ? "🔥 Ateş Hayaleti" : "🔥 Fire Wraith",
          shadowLord: lang === "tr" ? "👿 Gölge Lordu" : "👿 Shadow Lord",
        };
        setBossInfo({ name: names[boss.type] || boss.type, hp: boss.hp, maxHp: boss.maxHp });
        setNextBossTime(null);
        setBossWarning(null);
      } else {
        setBossInfo(null);
        const bossSchedule = [
          { type: "stoneGolem", minute: 5, name: lang === "tr" ? "Taş Golem" : "Stone Golem" },
          { type: "fireWraith", minute: 10, name: lang === "tr" ? "Ateş Hayaleti" : "Fire Wraith" },
          { type: "shadowLord", minute: 15, name: lang === "tr" ? "Gölge Lordu" : "Shadow Lord" },
        ];
        const currentMinute = eng.gameTime / 60;
        const next = bossSchedule.find(b => !eng.bossSpawned.has(b.type) && currentMinute < b.minute);
        if (next) {
          const secsLeft = Math.max(0, next.minute * 60 - eng.gameTime);
          setNextBossTime(secsLeft);
          setBossWarning(secsLeft <= 10 && secsLeft > 0 ? next.name : null);
        } else {
          setNextBossTime(null);
          setBossWarning(null);
        }
      }
    };

    let lastTime = performance.now();
    let animId: number;
    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      engine.update(dt);
      engine.render();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animId); engine.dispose(); };
  }, []);

  const handleStartGame = useCallback(() => {
    try {
      setMaxDps(0);
      setDps(0);
      setSandstormWarning(false);
      setSandstormActive(false);
      setMistWarning(false);
      setMistActive(false);
      setEruptionWarning(false);
      setEruptionActive(false);
      setBlizzardWarning(false);
      setBlizzardActive(false);
      if (!engineRef.current) {
        alert("Oyun motoru yüklenemedi. Sayfayı yenile!");
        return;
      }
      engineRef.current.startGame(selectedChar, selectedMap);
      trackEvent("game_start", { character: selectedChar, map: selectedMap, permanentUpgrades: engineRef.current.getMetaState().permanentUpgrades });
    } catch (e) {
      alert("Hata: " + (e as Error).message);
    }
  }, [selectedChar, selectedMap]);

  const selectUpgrade = useCallback((option: UpgradeOption) => {
    Audio.playSelect();
    engineRef.current?.applyUpgrade(option);
    trackEvent("level_up", { level: engineRef.current?.player.level ?? 0, chosenUpgrade: option.id });
    setUpgradeOptions([]);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const refreshMeta = useCallback(() => {
    if (engineRef.current) setMetaState({ ...engineRef.current.getMetaState() });
  }, []);

  /** Load cloud meta, merge with local, apply to engine */
  const syncCloudMeta = useCallback(async (nick: string) => {
    if (!engineRef.current) return;
    try {
      const cloud = await loadMetaFromCloud(nick);
      if (cloud) {
        const local = engineRef.current.getMetaState();
        const merged = mergeMetaStates(local, cloud);
        engineRef.current.setMetaState(merged);
      }
    } catch (e) {
      console.warn("Cloud sync failed:", e);
    }
    refreshMeta();
  }, [refreshMeta]);

  // Refresh meta on mount and when returning to menu
  useEffect(() => {
    if (gameState === "menu" && engineRef.current) refreshMeta();
  }, [gameState, refreshMeta]);

  // Chat: Firestore listener
  useEffect(() => {
    const q = query(collection(db, "chat"), orderBy("timestamp", "asc"), fbLimit(50));
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(d => {
        const data = d.data();
        return { nickname: data.nickname, text: data.text, color: data.color };
      });
      setChatMessages(msgs);
    });
    return () => unsub();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, showChat]);

  // Presence tracking + online count
  useEffect(() => {
    // Generate session ID
    const sessionId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    presenceIdRef.current = sessionId;
    const presenceRef = doc(db, "presence", sessionId);

    // Write presence
    const writePresence = () => {
      setDoc(presenceRef, { timestamp: Date.now() }).catch(() => {});
    };
    writePresence();
    const presenceInterval = setInterval(writePresence, 30000);

    // Query online count (fetch all, filter client-side to avoid index requirement)
    const fetchOnlineCount = async () => {
      try {
        const snap = await getDocs(collection(db, "presence"));
        const cutoff = Date.now() - 300000; // 5 minutes
        let count = 0;
        snap.forEach(d => { if (d.data().timestamp > cutoff) count++; });
        setOnlineCount(Math.max(1, count)); // at least 1 (self)
      } catch { setOnlineCount(1); }
    };
    fetchOnlineCount();
    const countInterval = setInterval(fetchOnlineCount, 15000);

    // Cleanup on unload
    const cleanup = () => {
      deleteDoc(presenceRef).catch(() => {});
    };
    window.addEventListener("beforeunload", cleanup);

    return () => {
      clearInterval(presenceInterval);
      clearInterval(countInterval);
      window.removeEventListener("beforeunload", cleanup);
      cleanup();
    };
  }, []);

  // Fetch top scores for rank display
  useEffect(() => {
    if (gameState !== "playing" && gameState !== "gameover") return;
    let cancelled = false;
    const fetchScores = async () => {
      try {
        const q = query(collection(db, "scores"), orderBy("score", "desc"), fbLimit(500));
        const snap = await getDocs(q);
        const scores: number[] = [];
        snap.forEach(d => scores.push(d.data().score || 0));
        if (!cancelled) topScoresRef.current = scores;
      } catch {}
    };
    fetchScores();
    const interval = setInterval(fetchScores, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [gameState]);

  // Update rank when score changes
  useEffect(() => {
    if (gameState !== "playing") return;
    const scores = topScoresRef.current;
    if (scores.length === 0) { setPlayerRank(null); return; }
    const currentScore = stats.score;
    if (currentScore <= 0) { setPlayerRank(null); return; }
    let rank = scores.findIndex(s => currentScore >= s);
    if (rank === -1) rank = scores.length;
    setPlayerRank(rank + 1);
  }, [stats.score, gameState]);

  const nickColor = (name: string) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return `hsl(${h % 360}, 70%, 65%)`;
  };

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || !nickLoggedIn || chatCooldown) return;
    const text = chatInput.trim().slice(0, 100);
    const color = nickColor(nickname);
    setChatInput("");
    setChatCooldown(true);
    setTimeout(() => setChatCooldown(false), 2000);
    try {
      await addDoc(collection(db, "chat"), { nickname, text, timestamp: Date.now(), color });
    } catch (e) { console.error("Chat send failed:", e); }
  }, [chatInput, nickLoggedIn, chatCooldown, nickname]);

  const SHOP_UPGRADES = [
    { id: "metaHp", icon: "❤️", nameKey: "meta.hp" as const, effectKey: "shop.effect.metaHp" as const, maxLevel: 10 },
    { id: "metaDamage", icon: "⚔️", nameKey: "meta.damage" as const, effectKey: "shop.effect.metaDamage" as const, maxLevel: 10 },
    { id: "metaSpeed", icon: "🏃", nameKey: "meta.speed" as const, effectKey: "shop.effect.metaSpeed" as const, maxLevel: 5 },
    { id: "metaXp", icon: "📚", nameKey: "meta.xp" as const, effectKey: "shop.effect.metaXp" as const, maxLevel: 5 },
    { id: "metaMagnet", icon: "🧲", nameKey: "meta.magnet" as const, effectKey: "shop.effect.metaMagnet" as const, maxLevel: 5 },
    { id: "metaStartLevel", icon: "🌟", nameKey: "meta.startLevel" as const, effectKey: "shop.effect.metaStartLevel" as const, maxLevel: 3 },
    { id: "metaExtraChoice", icon: "🎯", nameKey: "meta.extraChoice" as const, effectKey: "shop.effect.metaExtraChoice" as const, maxLevel: 1 },
  ];

  const handleBuyUpgrade = useCallback((id: string) => {
    if (!engineRef.current) return;
    Audio.playSelect();
    engineRef.current.buyPermanentUpgrade(id);
    refreshMeta();
  }, [refreshMeta]);

  const handleUnlockCharacter = useCallback((id: string) => {
    if (!engineRef.current) return;
    Audio.playSelect();
    engineRef.current.unlockCharacter(id);
    refreshMeta();
  }, [refreshMeta]);

  const handleUnlockMap = useCallback((id: string) => {
    if (!engineRef.current) return;
    Audio.playSelect();
    engineRef.current.unlockMap(id);
    refreshMeta();
  }, [refreshMeta]);

  const isCharUnlocked = (ch: CharacterDef) => {
    if (ch.unlock.isDefault) return true;
    return metaState?.unlockedCharacters.includes(ch.id) ?? false;
  };

  const isConditionMet = (ch: CharacterDef) => {
    if (!metaState) return false;
    return ch.unlock.checkUnlocked(metaState.achievements);
  };

  const selectedCharData = CHARACTERS.find(c => c.id === selectedChar);

  return (
    <>
      {/* Canvas: hidden behind menu via visibility+zIndex, fully active during gameplay */}
      <canvas
        ref={canvasRef}
        style={{
          width: "100vw", height: "100vh",
          touchAction: "none",
          position: "fixed",
          top: 0, left: 0,
          zIndex: gameState === "menu" ? -1 : 1,
          visibility: gameState === "menu" ? "hidden" : "visible",
          pointerEvents: gameState === "menu" ? "none" : "auto",
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Custom cursor - desktop only */}
      {!isPointerLocked && mounted && !isMobileDevice && (
        <div className="custom-cursor" style={{ left: cursorPos.x, top: cursorPos.y }} />
      )}

      {/* Click to resume */}
      {gameState === "playing" && !isPointerLocked && !isMobileDevice && (
        <div style={{
          position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.3)", zIndex: 15, pointerEvents: "none",
        }}>
          <div style={{
            padding: "16px 32px", background: "rgba(0,0,0,0.7)", borderRadius: 12,
            fontSize: 18, fontWeight: "bold", color: "rgba(255,255,255,0.8)",
          }}>
            🖱️ {lang === "tr" ? "Devam etmek için tıkla" : "Click to continue"}
          </div>
        </div>
      )}

      {/* Damage Flash */}
      <div className={`damage-flash ${damageFlash ? "active" : ""}`} />

      {/* ============ MAIN MENU ============ */}
      {gameState === "menu" && mounted && (
        <div className="main-menu">
          {/* Top bar */}
          <div className="menu-topbar">
            <button onClick={toggleLang} className="lang-btn">
              {lang === "tr" ? "🇬🇧 EN" : "🇹🇷 TR"}
            </button>
          </div>

          {/* Scrollable content */}
          <div className="menu-scroll">
            {/* Hero */}
            <div className="menu-hero">
              <h1 className="menu-title">HORDECRAFT</h1>
              <p className="menu-subtitle">{t("menu.subtitle")}</p>
              {(
                <div style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#44ff44",
                    boxShadow: "0 0 6px #44ff44",
                    display: "inline-block",
                  }} />
                  {onlineCount} {lang === "tr" ? "oyuncu çevrimiçi" : "players online"}
                </div>
              )}
            </div>

            {/* Character Selection */}
            <div className="menu-section">
              <button onClick={() => setShowCharSelect(!showCharSelect)} className="char-toggle-btn">
                <span className="char-toggle-icon">{selectedCharData?.icon}</span>
                <div className="char-toggle-info">
                  <span className="char-toggle-name">{selectedCharData?.name()}</span>
                  <span className="char-toggle-hint">{lang === "tr" ? "Karakter değiştir" : "Change character"}</span>
                </div>
                <span className="char-toggle-arrow">{showCharSelect ? "▲" : "▼"}</span>
              </button>

              {showCharSelect && (
                <div className="char-grid">
                  {CHARACTERS.map(ch => {
                    const unlocked = isCharUnlocked(ch);
                    const condMet = isConditionMet(ch);
                    const canAfford = (metaState?.gold ?? 0) >= ch.unlock.unlockCost;
                    const isSelected = selectedChar === ch.id && unlocked;
                    const weaponNames: Record<string, Record<string, string>> = {
                      orbitBlade: { tr: "🗡️ Dönen Kılıç", en: "🗡️ Orbit Blade" },
                      lightningArc: { tr: "⚡ Yıldırım", en: "⚡ Lightning Arc" },
                      boneToss: { tr: "🦴 Kemik Fırlatma", en: "🦴 Bone Toss" },
                      shockWave: { tr: "💥 Şok Dalgası", en: "💥 Shock Wave" },
                      fireTrail: { tr: "🔥 Ateş İzi", en: "🔥 Fire Trail" },
                    };
                    const passiveDesc: Record<string, Record<string, string>> = {
                      knight: { tr: "🛡️ +2 Zırh", en: "🛡️ +2 Armor" },
                      mage: { tr: "📚 +%15 XP, -%15 Bekleme", en: "📚 +15% XP, -15% Cooldown" },
                      rogue: { tr: "🎯 %20 Kritik Şans", en: "🎯 20% Crit Chance" },
                      priest: { tr: "🧲 Geniş Mıknatıs, +%30 XP", en: "🧲 Wide Magnet, +30% XP" },
                      berserker: { tr: "💪 +%50 HP, +%40 Hasar", en: "💪 +50% HP, +40% Damage" },
                      necromancer: { tr: "⏱️ -%20 Bekleme", en: "⏱️ -20% Cooldown" },
                    };
                    const StatBar = ({ label, value, max, color }: { label: string; value: number; max: number; color: string }) => (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, width: "100%" }}>
                        <span style={{ width: 28, textAlign: "right", color: "rgba(255,255,255,0.6)" }}>{label}</span>
                        <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                    return (
                      <button
                        key={ch.id}
                        onClick={() => { if (unlocked) { setSelectedChar(ch.id); Audio.playSelect(); } }}
                        className={`char-card ${isSelected ? "selected" : ""} ${!unlocked ? "locked" : ""}`}
                        style={{
                          cursor: unlocked ? "pointer" : "default",
                          border: isSelected ? "2px solid #ff8c42" : undefined,
                          boxShadow: isSelected ? "0 0 12px rgba(255,140,66,0.4)" : undefined,
                        }}
                      >
                        <span className="char-card-icon" style={{ fontSize: 32 }}>{unlocked ? ch.icon : "🔒"}</span>
                        <span className="char-card-name">{ch.name()}</span>
                        {unlocked ? (
                          <>
                            <span className="char-card-desc" style={{ fontSize: 10, marginBottom: 4 }}>{ch.description()}</span>
                            <div style={{ fontSize: 10, color: "rgba(255,200,100,0.8)", marginBottom: 2 }}>
                              {weaponNames[ch.startWeapon]?.[lang] || ch.startWeapon}
                            </div>
                            <div style={{ fontSize: 9, color: "rgba(150,220,255,0.7)", marginBottom: 6 }}>
                              {passiveDesc[ch.id]?.[lang] || ""}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
                              <StatBar label="❤️" value={ch.hpMult} max={1.6} color="#ff4444" />
                              <StatBar label="⚡" value={ch.speedMult} max={1.3} color="#44aaff" />
                              <StatBar label="⚔️" value={ch.damageMult} max={1.5} color="#ffaa44" />
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowSkinSelect(showSkinSelect === ch.id ? null : ch.id); }}
                              style={{
                                marginTop: 4, padding: "2px 8px", fontSize: 12, background: "rgba(255,255,255,0.1)",
                                border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, cursor: "pointer", color: "#fff",
                              }}
                            >🎨</button>
                          </>
                        ) : (
                          <>
                            <span className="char-card-lock">{t(ch.unlock.unlockCondition as never)}</span>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>
                              💰 {ch.unlock.unlockCost}G
                            </div>
                            {condMet ? (
                              <button
                                className="char-unlock-btn"
                                disabled={!canAfford}
                                onClick={(e) => { e.stopPropagation(); handleUnlockCharacter(ch.id); }}
                              >
                                {t("unlock.btn")} ({ch.unlock.unlockCost}G)
                              </button>
                            ) : (
                              <span className="char-card-lock" style={{ color: "rgba(255,100,100,0.5)", fontSize: 9 }}>
                                {t("unlock.condition_not_met")}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Map Selection */}
            <div className="menu-section">
              <button onClick={() => setShowMapSelect(!showMapSelect)} className="char-toggle-btn">
                <span className="char-toggle-icon">{MAPS[selectedMap as keyof typeof MAPS]?.icon || "🌲"}</span>
                <div className="char-toggle-info">
                  <span className="char-toggle-name">{lang === "tr" ? (MAPS[selectedMap as keyof typeof MAPS]?.nametr || "Büyülü Orman") : (MAPS[selectedMap as keyof typeof MAPS]?.name || "Enchanted Forest")}</span>
                  <span className="char-toggle-hint">{t("map.select")}</span>
                </div>
                <span className="char-toggle-arrow">{showMapSelect ? "▲" : "▼"}</span>
              </button>

              {showMapSelect && (
                <div className="char-grid">
                  {(Object.entries(MAPS) as [string, typeof MAPS.forest][]).map(([mapId, mapDef]) => {
                    const unlocked = metaState?.unlockedMaps?.includes(mapId) ?? mapId === "forest";
                    const condMet = mapId === "desert"
                      ? engineRef.current?.isDesertUnlockConditionMet() ?? false
                      : mapId === "volcanic"
                      ? engineRef.current?.isVolcanicUnlockConditionMet() ?? false
                      : mapId === "frozen"
                      ? engineRef.current?.isFrozenUnlockConditionMet() ?? false
                      : true;
                    const canAfford = (metaState?.gold ?? 0) >= mapDef.unlockCost;
                    const descKey = `map.${mapId}_desc` as "map.forest_desc" | "map.desert_desc" | "map.volcanic_desc" | "map.frozen_desc";
                    return (
                      <button
                        key={mapId}
                        onClick={() => { if (unlocked) { setSelectedMap(mapId); Audio.playSelect(); } }}
                        className={`char-card ${selectedMap === mapId && unlocked ? "selected" : ""} ${!unlocked ? "locked" : ""}`}
                        style={{ cursor: unlocked ? "pointer" : "default" }}
                      >
                        <span className="char-card-icon">{unlocked ? mapDef.icon : "🔒"}</span>
                        <span className="char-card-name">{lang === "tr" ? mapDef.nametr : mapDef.name}</span>
                        {unlocked ? (
                          <span className="char-card-desc">{t(descKey)}</span>
                        ) : (
                          <>
                            <span className="char-card-lock">{lang === "tr" ? mapDef.unlockConditiontr : mapDef.unlockCondition}</span>
                            {condMet ? (
                              <button
                                className="char-unlock-btn"
                                disabled={!canAfford}
                                onClick={(e) => { e.stopPropagation(); handleUnlockMap(mapId); }}
                              >
                                🔓 {mapDef.unlockCost}G
                              </button>
                            ) : (
                              <span className="char-card-lock" style={{ color: "rgba(255,100,100,0.5)", fontSize: 9 }}>
                                {t("unlock.condition_not_met")}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Auth Section */}
            <div className="menu-section">
              {nickLoggedIn ? (
                <div className="auth-logged-in">
                  <div className="auth-user">
                    <span className="auth-avatar">👤</span>
                    <span className="auth-name">{nickname}</span>
                  </div>
                  <button className="btn-play" onClick={handleStartGame}>
                    {lang === "tr" ? "⚔️ SAVAŞA GİR" : "⚔️ ENTER BATTLE"}
                  </button>
                  <button onClick={() => { logoutNickname(); setNickLoggedIn(false); setNicknameState(""); setPin(""); if (engineRef.current) { engineRef.current.setMetaState({ gold: 0, permanentUpgrades: {}, unlockedCharacters: ["knight"], unlockedMaps: ["forest"], totalRuns: 0, achievements: { maxKills: 0, maxSurvivalTime: 0, maxLevel: 0, totalRuns: 0 }, unlockedSkins: [], selectedSkins: {} }); } }} className="auth-logout">
                    {lang === "tr" ? "Çıkış yap" : "Logout"}
                  </button>
                </div>
              ) : (
                <div className="auth-form">
                  <div className="auth-form-title">
                    {lang === "tr" ? "🏆 Sıralamaya girmek için kayıt ol" : "🏆 Register to join leaderboard"}
                  </div>

                  <input
                    type="text"
                    placeholder={lang === "tr" ? "Takma adını gir..." : "Enter nickname..."}
                    value={nickname}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^a-zA-Z0-9_\-çğıöşüÇĞİÖŞÜ ]/g, "").slice(0, 16);
                      setNicknameState(val);
                      setNickError("");
                      setNickClaimed(false);
                    }}
                    onBlur={async () => {
                      if (nickname.trim().length >= 2) {
                        setNickChecking(true);
                        const claimed = await isNicknameClaimed(nickname.trim());
                        setNickClaimed(claimed);
                        setNickChecking(false);
                      }
                    }}
                    maxLength={16}
                    className="auth-input"
                  />

                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={lang === "tr" ? "4 haneli PIN" : "4-digit PIN"}
                    value={pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setPin(val);
                      setNickError("");
                    }}
                    maxLength={4}
                    className="auth-input auth-pin"
                  />

                  {nickError && <div className="auth-error">{nickError}</div>}

                  {/* Status hints */}
                  {nickChecking && (
                    <div className="auth-hint">{lang === "tr" ? "Kontrol ediliyor..." : "Checking..."}</div>
                  )}
                  {!nickChecking && nickname.trim().length >= 2 && nickClaimed && !nickError && (
                    <div className="auth-hint warn">{lang === "tr" ? "Bu isim kayıtlı — PIN ile giriş yap" : "Name registered — login with PIN"}</div>
                  )}
                  {!nickChecking && nickname.trim().length >= 2 && !nickClaimed && pin.length === 4 && (
                    <div className="auth-hint ok">{lang === "tr" ? "✓ İsim müsait" : "✓ Name available"}</div>
                  )}
                  {nickname.trim().length > 0 && nickname.trim().length < 2 && (
                    <div className="auth-hint">{lang === "tr" ? "En az 2 karakter" : "At least 2 characters"}</div>
                  )}
                  {nickname.trim().length >= 2 && pin.length < 4 && !nickChecking && (
                    <div className="auth-hint">{lang === "tr" ? "4 haneli PIN gir" : "Enter 4-digit PIN"}</div>
                  )}

                  {/* Register / Claim button */}
                  {nickname.trim().length >= 2 && pin.length === 4 && (
                    nickClaimed ? (
                      <button
                        className="btn-play"
                        disabled={nickBusy}
                        onClick={async () => {
                          setNickBusy(true);
                          const err = await claimNickname(nickname.trim(), pin);
                          setNickBusy(false);
                          if (err === "wrong_pin") {
                            setNickError(lang === "tr" ? "Yanlış PIN!" : "Wrong PIN!");
                          } else if (err === "not_found") {
                            setNickError(lang === "tr" ? "İsim bulunamadı" : "Name not found");
                          } else if (err === "inappropriate_name") {
                            setNickError(lang === "tr" ? "Uygunsuz isim!" : "Inappropriate name!");
                          } else {
                            setNickLoggedIn(true);
                            syncCloudMeta(nickname.trim());
                          }
                        }}
                      >
                        🔑 {nickBusy ? "..." : (lang === "tr" ? "Giriş Yap & Oyna" : "Login & Play")}
                      </button>
                    ) : (
                      <button
                        className="btn-play"
                        disabled={nickBusy || nickChecking}
                        onClick={async () => {
                          setNickBusy(true);
                          const err = await registerNickname(nickname.trim(), pin);
                          setNickBusy(false);
                          if (err) {
                            if (err === "already_claimed") {
                              setNickClaimed(true);
                              setNickError(lang === "tr" ? "Bu isim alınmış! PIN ile giriş yap." : "Name taken! Login with PIN.");
                            } else if (err === "inappropriate_name") {
                              setNickError(lang === "tr" ? "Uygunsuz isim! Başka bir isim dene." : "Inappropriate name! Try another.");
                            } else {
                              setNickError(lang === "tr" ? "Geçersiz giriş" : "Invalid input");
                            }
                          } else {
                            setNickLoggedIn(true);
                            syncCloudMeta(nickname.trim());
                          }
                        }}
                      >
                        📝 {nickBusy ? "..." : (lang === "tr" ? "Kayıt Ol & Oyna" : "Register & Play")}
                      </button>
                    )
                  )}

                  {/* Divider */}
                  <div className="auth-divider">
                    <span>{lang === "tr" ? "veya" : "or"}</span>
                  </div>

                  {/* Guest play */}
                  <button className="btn-guest" onClick={() => { logoutNickname(); setNicknameState(""); if (engineRef.current) { engineRef.current.setMetaState({ gold: 0, permanentUpgrades: {}, unlockedCharacters: ["knight"], unlockedMaps: ["forest"], totalRuns: 0, achievements: { maxKills: 0, maxSurvivalTime: 0, maxLevel: 0, totalRuns: 0 }, unlockedSkins: [], selectedSkins: {} }); } handleStartGame(); }}>
                    👤 {lang === "tr" ? "Misafir Oyna" : "Play as Guest"}
                  </button>
                  <div className="auth-hint" style={{ marginTop: 4 }}>
                    {lang === "tr" ? "Misafir skorları 'Anonim' görünür" : "Guest scores show as 'Anonymous'"}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="menu-section menu-actions">
              <button className="btn-shop" onClick={() => { Audio.playSelect(); refreshMeta(); setShowShop(true); }}>
                {t("shop.btn")} {metaState ? `(💰${metaState.gold})` : ""}
              </button>
              <button className="btn-leaderboard" onClick={() => { window.location.href = "/leaderboard"; }}>
                🏆 {lang === "tr" ? "SIRALAMA" : "LEADERBOARD"}
              </button>

              <button className="btn-settings" onClick={() => { Audio.playSelect(); setShowSettings(true); }}>
                ⚙️ {lang === "tr" ? "AYARLAR" : "SETTINGS"}
              </button>

              {isMobileDevice && (
                <button
                  className="btn-fullscreen"
                  onClick={() => {
                    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
                    if (document.fullscreenElement) return;
                    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
                    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                    try { (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.("landscape")?.catch?.(() => {}); } catch {}
                  }}
                >
                  📱 {lang === "tr" ? "Tam Ekran" : "Fullscreen"}
                </button>
              )}
            </div>

            {/* Chat */}
            <div className="menu-section" style={{ alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{t("chat.title")}</div>
              {true && (
                <div className="chat-panel">
                  <div className="chat-messages">
                    {chatMessages.length === 0 && (
                      <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", fontSize: 12 }}>
                        {lang === "tr" ? "Henüz mesaj yok" : "No messages yet"}
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} className="chat-msg">
                        <span className="chat-msg-nick" style={{ color: msg.color }}>{msg.nickname}:</span>
                        {msg.text}
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  {nickLoggedIn ? (
                    <div className="chat-input-row">
                      <input
                        type="text"
                        placeholder={t("chat.placeholder")}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value.slice(0, 100))}
                        onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
                        maxLength={100}
                      />
                      <button onClick={sendChat} disabled={chatCooldown || !chatInput.trim()}>
                        {t("chat.send")}
                      </button>
                    </div>
                  ) : (
                    <div className="chat-login-msg">{t("chat.login_required")}</div>
                  )}
                </div>
              )}
            </div>

            {/* Controls info */}
            <div className="menu-controls">
              {isMobileDevice
                ? (lang === "tr" ? "Joystick: Hareket · Sağ Kaydır: Kamera" : "Joystick: Move · Swipe Right: Camera")
                : t("menu.controls")
              }
            </div>
          </div>
        </div>
      )}

      {/* ============ HUD ============ */}
      {gameState === "playing" && (
        <div className="hud">
          <div className="hp-bar-container">
            <div className="hp-bar-bg">
              <div className="hp-bar-fill" style={{ width: `${(stats.hp / stats.maxHp) * 100}%` }} />
            </div>
            <div className="hp-text">❤️ {stats.hp} / {stats.maxHp}</div>
          </div>

          <div className="weapon-slots">
            {weapons.map((w, i) => (
              <div key={i} className="weapon-slot">
                {w.icon}
                <span className="level-badge">{w.level}</span>
              </div>
            ))}
          </div>

          <div className="timer">⏱️ {formatTime(stats.survivalTime)}</div>
          <div style={{
            position: "absolute", top: isMobileDevice ? 8 : 12, right: isMobileDevice ? 80 : 120,
            fontSize: isMobileDevice ? 12 : 14, fontWeight: 700, color: "rgba(255,215,0,0.8)",
            textShadow: "0 0 4px rgba(0,0,0,0.8)", pointerEvents: "none",
          }}>
            🏆 {playerRank ? `#${playerRank}` : "--"}
          </div>

          <div className={`combo-display ${stats.currentCombo >= 10 ? "active" : ""}`}>
            🔥 x{stats.comboMultiplier.toFixed(1)}
            <div style={{ fontSize: 14 }}>{stats.currentCombo} combo</div>
          </div>

          <div className="level-display">LVL {stats.level}</div>
          <div className="xp-bar-container">
            <div className="xp-bar-bg">
              <div className="xp-bar-fill" style={{ width: `${(stats.xp / stats.xpToNext) * 100}%` }} />
            </div>
            <div className="xp-text">XP {stats.xp} / {stats.xpToNext}</div>
          </div>

          <div className="kill-counter">☠️ {stats.kills.toLocaleString()} {t("hud.kills")}</div>

          {/* Score & DPS - top right on mobile, bottom right on desktop */}
          <div style={{
            position: "absolute",
            ...(isMobileDevice
              ? { top: 20, right: 20 }
              : { bottom: 50, right: 20 }),
            display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2,
            textShadow: "0 0 4px rgba(0,0,0,0.8)",
            pointerEvents: "none",
          }}>
            <div style={{ fontSize: isMobileDevice ? 14 : 16, fontWeight: 700 }}>🏆 {stats.score.toLocaleString()}</div>
            <div style={{
              fontSize: isMobileDevice ? 11 : 13, fontWeight: 700,
              color: dps > 100 ? "#ff4444" : dps > 50 ? "#ffaa44" : "#66ff66",
            }}>
              ⚔️ {dps.toLocaleString()} DPS
              {!isMobileDevice && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>(max {maxDps.toLocaleString()})</span>}
            </div>
          </div>

          {!isMobileDevice && <div className="controls-hint">{t("hud.controls_hint")}</div>}

          {/* Next Boss Timer */}
          {!bossInfo && nextBossTime !== null && nextBossTime > 0 && (
            <div style={{
              position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)", zIndex: 20, textAlign: "center",
            }}>
              <div style={{
                fontSize: nextBossTime <= 10 ? 18 : 13, fontWeight: 700,
                color: nextBossTime <= 10 ? "#ff4444" : "rgba(255,255,255,0.4)",
                animation: nextBossTime <= 10 ? "pulse 0.5s ease-in-out infinite alternate" : "none",
                textShadow: nextBossTime <= 10 ? "0 0 15px rgba(255,0,0,0.6)" : "none",
              }}>
                {nextBossTime <= 10
                  ? `⚠️ ${bossWarning} ${lang === "tr" ? "GELİYOR!" : "INCOMING!"} ${Math.ceil(nextBossTime)}s`
                  : `🕐 Boss: ${Math.floor(nextBossTime / 60)}:${Math.floor(nextBossTime % 60).toString().padStart(2, "0")}`
                }
              </div>
            </div>
          )}

          {/* Boss HP Bar */}
          {bossInfo && (
            <div style={{
              position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)",
              width: 400, maxWidth: "90vw", zIndex: 20,
            }}>
              <div style={{
                textAlign: "center", fontSize: 16, fontWeight: 900, color: "#ff4444",
                textShadow: "0 0 10px rgba(255,0,0,0.5)", marginBottom: 4,
              }}>{bossInfo.name}</div>
              <div style={{
                width: "100%", height: 14, background: "rgba(0,0,0,0.7)",
                borderRadius: 7, border: "1px solid rgba(255,0,0,0.4)", overflow: "hidden",
              }}>
                <div style={{
                  width: `${(bossInfo.hp / bossInfo.maxHp) * 100}%`, height: "100%",
                  background: "linear-gradient(90deg, #ff0000, #ff4444)",
                  borderRadius: 7, transition: "width 0.2s", boxShadow: "0 0 8px rgba(255,0,0,0.5)",
                }} />
              </div>
              <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                {Math.round(bossInfo.hp)} / {Math.round(bossInfo.maxHp)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Eruption Warning */}
      {(eruptionWarning || eruptionActive) && gameState === "playing" && (
        <div style={{
          position: "fixed", top: "40%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 25, textAlign: "center", pointerEvents: "none",
        }}>
          <div style={{
            fontSize: 32, fontWeight: 900, color: "#ff4400",
            textShadow: "0 0 20px rgba(255,68,0,0.8), 0 0 40px rgba(255,50,0,0.4)",
            animation: "pulse 0.5s ease-in-out infinite alternate",
          }}>
            {t("hud.eruption")}
          </div>
        </div>
      )}

      {/* Sandstorm Warning */}
      {(sandstormWarning || sandstormActive) && gameState === "playing" && (
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 25, textAlign: "center", pointerEvents: "none",
        }}>
          <div style={{
            fontSize: 32, fontWeight: 900, color: sandstormActive ? "#ff8844" : "#ffaa44",
            textShadow: "0 0 20px rgba(255,136,0,0.8), 0 0 40px rgba(255,100,0,0.4)",
            animation: "pulse 0.5s ease-in-out infinite alternate",
          }}>
            {t("hud.sandstorm")}
          </div>
        </div>
      )}

      {/* Mist Warning */}
      {(mistWarning || mistActive) && gameState === "playing" && (
        <div style={{
          position: "fixed", top: "40%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 25, textAlign: "center", pointerEvents: "none",
        }}>
          <div style={{
            fontSize: 32, fontWeight: 900, color: mistActive ? "#44ff88" : "#88ffaa",
            textShadow: "0 0 20px rgba(68,255,136,0.8), 0 0 40px rgba(34,68,51,0.6)",
            animation: "pulse 0.5s ease-in-out infinite alternate",
          }}>
            {mistActive ? "🌫️ SİS" : "🌫️ Sis Geliyor!"}
          </div>
        </div>
      )}

      {/* Level Up Modal */}
      {gameState === "levelup" && mounted && (
        <div className="level-up-overlay">
          <div>
            <div className="level-up-title">{t("levelup.title")}</div>
            <div className="upgrade-cards">
              {upgradeOptions.map((opt) => (
                <div key={opt.id} className="upgrade-card" onClick={() => selectUpgrade(opt)}>
                  <div className="icon">{opt.icon}</div>
                  <div className="name">{opt.name}</div>
                  <div className="desc">{opt.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chest Spin Wheel */}
      {showChestSpin && mounted && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ color: "#ffcc00", fontSize: "24px", fontWeight: "bold", marginBottom: "20px", textShadow: "0 0 10px #ffcc00" }}>
            🎁 {t("levelup.title") || "CHEST REWARD"}
          </div>
          <div style={{
            width: "min(90vw, 500px)", height: "100px", overflow: "hidden", position: "relative",
            border: "3px solid #ffcc00", borderRadius: "12px", background: "rgba(0,0,0,0.9)",
            boxShadow: "0 0 30px rgba(255,204,0,0.3)",
          }}>
            {/* Center indicator */}
            <div style={{
              position: "absolute", left: "50%", top: 0, bottom: 0, width: "4px",
              background: "#ffcc00", transform: "translateX(-50%)", zIndex: 10,
              boxShadow: "0 0 10px #ffcc00",
            }} />
            {/* Scrolling strip */}
            <div style={{
              display: "flex", position: "absolute", top: 0, left: "50%",
              animation: chestSpinResult
                ? "none"
                : "chestSpin 0.3s linear infinite",
              transform: chestSpinResult
                ? `translateX(calc(-${chestSpinOptions.indexOf(chestSpinResult) * 100}px - 50px))`
                : undefined,
              transition: chestSpinResult ? "transform 1.5s cubic-bezier(0.2, 0.8, 0.3, 1)" : undefined,
            }}>
              {/* Repeat options 5 times for seamless scroll */}
              {Array.from({ length: 5 }).flatMap((_, rep) =>
                chestSpinOptions.map((opt, i) => (
                  <div key={`${rep}-${i}`} style={{
                    width: "100px", height: "100px", flexShrink: 0,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    borderRight: "1px solid rgba(255,204,0,0.2)",
                    background: chestSpinResult && opt.id === chestSpinResult.id && rep === 2
                      ? "rgba(255,204,0,0.2)" : "transparent",
                  }}>
                    <span style={{ fontSize: "32px" }}>{opt.icon}</span>
                    <span style={{ fontSize: "10px", color: "#fff", marginTop: "4px", textAlign: "center" }}>{opt.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          {chestSpinResult && (
            <div style={{
              marginTop: "20px", color: "#fff", fontSize: "20px", textAlign: "center",
              animation: "fadeIn 0.3s ease-in",
            }}>
              <span style={{ fontSize: "40px" }}>{chestSpinResult.icon}</span>
              <div style={{ color: "#ffcc00", fontWeight: "bold", textShadow: "0 0 15px #ffcc00" }}>
                {chestSpinResult.name} +1
              </div>
            </div>
          )}
        </div>
      )}

      {/* Game Over */}
      {/* Shop Overlay */}
      {showShop && metaState && mounted && (
        <div className="shop-overlay" onClick={() => setShowShop(false)}>
          <div className="shop-panel" onClick={(e) => e.stopPropagation()}>
            <div className="shop-header">
              <span className="shop-title">{t("shop.title")}</span>
              <span className="shop-gold">💰 {metaState.gold} {t("shop.gold")}</span>
              <button className="shop-close" onClick={() => setShowShop(false)}>{t("shop.close")}</button>
            </div>
            <div className="shop-grid">
              {SHOP_UPGRADES.map(up => {
                const level = metaState.permanentUpgrades[up.id] || 0;
                const isMax = level >= up.maxLevel;
                const cost = engineRef.current?.getUpgradeCost(up.id, level) ?? 0;
                const canAfford = metaState.gold >= cost;
                return (
                  <div key={up.id} className="shop-card">
                    <span className="shop-card-icon">{up.icon}</span>
                    <span className="shop-card-name">{t(up.nameKey)}</span>
                    <span className="shop-card-level">{level} / {up.maxLevel}</span>
                    <span className="shop-card-effect">{t(up.effectKey)}</span>
                    {!isMax && <span className="shop-card-cost">💰 {cost}</span>}
                    <button
                      className={`shop-buy-btn ${isMax ? "maxed" : ""}`}
                      disabled={isMax || !canAfford}
                      onClick={() => handleBuyUpgrade(up.id)}
                    >
                      {isMax ? t("shop.maxed") : t("shop.buy")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {gameState === "gameover" && mounted && (
        <div className="game-over-overlay">
          <div className="game-over-panel">
            <div className="game-over-title">{t("gameover.title")}</div>
            <div className="game-over-score">{t("gameover.score")}: {stats.score.toLocaleString()}</div>
            {deathCause && (() => {
              const deathNames: Record<string, string> = {
                goblin: "🟢 Goblin", slime: "🟢 Slime", skeleton: "💀 İskelet", bat: "🦇 Yarasa",
                ogre: "👹 Ogre", spider: "🕷️ Örümcek", zombie: "🧟 Zombi", wolf: "🐺 Kurt",
                necromancer: "🔮 Nekromansır", troll: "🧌 Trol", shaman: "✨ Şaman",
                stoneGolem: "⛰️ Taş Golem", fireWraith: "🔥 Ateş Hayaleti", shadowLord: "👿 Gölge Lord",
                lava: "🌋 Lav", projectile: "🏹 Ok", meteor: "☄️ Meteor", mini_slime: "🟢 Mini Slime",
              };
              return (
                <div style={{ fontSize: 16, color: "rgba(255,255,255,0.8)", marginBottom: 8 }}>
                  💀 Öldüren: <span style={{ fontWeight: 700, color: "#ff6b35" }}>{deathNames[deathCause] || deathCause}</span>
                </div>
              );
            })()}
            <div className="game-over-stats">
              <span>⏱️ {formatTime(stats.survivalTime)}</span>
              <span>☠️ {stats.kills.toLocaleString()} {t("gameover.kill")}</span>
              <span>📊 Lvl {stats.level}</span>
              <span>🔥 x{stats.maxCombo} {t("gameover.max_combo")}</span>
              <span>⚔️ {maxDps} max DPS</span>
            </div>
            <div style={{ marginBottom: 16, color: "var(--gold)" }}>
              💰 +{stats.gold} {t("gameover.gold_earned")}
            </div>
            {submitting && (
              <div style={{ marginBottom: 12, color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                ⏳ {lang === "tr" ? "Skor kaydediliyor..." : "Saving score..."}
              </div>
            )}
            {scoreSubmitted && (
              <div style={{ marginBottom: 12, color: "var(--success)", fontWeight: "bold", fontSize: 14 }}>
                ✅ {lang === "tr" ? `Skor kaydedildi! (${nickname || "Anonim"})` : `Score saved! (${nickname || "Anonymous"})`}
              </div>
            )}
            {scoreSubmitted && lastScoreDocId && (() => {
              const shareUrl = `https://hordecraft.online/score/${lastScoreDocId}`;
              const shareText = lang === "tr"
                ? `HordeCraft'ta ${stats.score.toLocaleString()} puan yaptım! 🎮⚔️`
                : `I scored ${stats.score.toLocaleString()} on HordeCraft! 🎮⚔️`;
              return (
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      padding: "8px 16px", borderRadius: 8, background: "#1DA1F2", color: "white",
                      fontWeight: 700, fontSize: 13, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4,
                    }}
                  >𝕏 Twitter</a>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      padding: "8px 16px", borderRadius: 8, background: "#25D366", color: "white",
                      fontWeight: 700, fontSize: 13, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4,
                    }}
                  >📱 WhatsApp</a>
                  <button
                    onClick={() => { navigator.clipboard.writeText(shareUrl).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }).catch(() => {}); }}
                    style={{
                      padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.15)", color: "white",
                      fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer",
                    }}
                  >{linkCopied ? "✅" : "🔗"} {linkCopied ? (lang === "tr" ? "Kopyalandı!" : "Copied!") : (lang === "tr" ? "Link Kopyala" : "Copy Link")}</button>
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={handleStartGame}>{t("gameover.retry")}</button>
              <button className="btn btn-secondary" onClick={() => setGameState("menu")}>{t("gameover.menu")}</button>
              <button className="btn btn-secondary" onClick={() => { window.location.href = "/leaderboard"; }}>
                🏆 {lang === "tr" ? "Sıralama" : "Leaderboard"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Settings Overlay */}
      {showSettings && mounted && (
        <div className="shop-overlay" onClick={() => setShowSettings(false)}>
          <div className="shop-panel settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="shop-header">
              <h2 className="shop-title">{t("settings.title")}</h2>
              <button className="shop-close" onClick={() => setShowSettings(false)}>{t("settings.close")}</button>
            </div>
            <div className="settings-list">
              <label className="settings-row">
                <span>{t("settings.invertY")}</span>
                <input
                  type="checkbox"
                  checked={invertY}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setInvertY(val);
                    if (engineRef.current) {
                      engineRef.current.settings.invertY = val;
                      engineRef.current.saveSettings();
                    }
                  }}
                  className="settings-checkbox"
                />
              </label>
              <label className="settings-row">
                <span>{t("settings.quality")}</span>
                <select
                  value={graphicsQuality}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGraphicsQuality(val);
                    if (engineRef.current) {
                      engineRef.current.settings.quality = val;
                      engineRef.current.saveSettings();
                      engineRef.current.applyQualitySettings();
                    }
                  }}
                  style={{
                    background: "rgba(255,255,255,0.1)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 14,
                  }}
                >
                  <option value="low" style={{ background: "#1a1a2e" }}>{t("settings.quality.low")}</option>
                  <option value="medium" style={{ background: "#1a1a2e" }}>{t("settings.quality.medium")}</option>
                  <option value="high" style={{ background: "#1a1a2e" }}>{t("settings.quality.high")}</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
