"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine, Audio } from "@/game/engine";
import type { GameState, UpgradeOption } from "@/game/types";
import { t, getLang, setLang, type Lang } from "@/game/i18n";
import { CHARACTERS } from "@/game/characters";
import { getActiveNickname, registerNickname, claimNickname, isNicknameClaimed, logoutNickname } from "@/game/nickname";

export default function PlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>("menu");
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
  const [nickMode, setNickMode] = useState<"idle" | "register" | "claim">("idle");
  const [nickLoggedIn, setNickLoggedIn] = useState(false);
  const [nickClaimed, setNickClaimed] = useState(false);
  const [bossInfo, setBossInfo] = useState<{ name: string; hp: number; maxHp: number } | null>(null);
  const [bossWarning, setBossWarning] = useState<string | null>(null);
  const [nextBossTime, setNextBossTime] = useState<number | null>(null);
  const [nickChecking, setNickChecking] = useState(false);
  const [nickBusy, setNickBusy] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showNicknameInput, setShowNicknameInput] = useState(false);
  const [selectedChar, setSelectedChar] = useState("knight");
  const [showCharSelect, setShowCharSelect] = useState(false);
  const [dps, setDps] = useState(0);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [maxDps, setMaxDps] = useState(0);

  const submitScore = async (data: Record<string, unknown>) => {
    try {
      // Save to Firestore
      const { db } = await import("@/game/firebase");
      const { collection, addDoc } = await import("firebase/firestore");
      await addDoc(collection(db, "scores"), {
        ...data,
        date: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Score submit failed:", e);
      // Fallback: save locally
      try {
        const key = "hordecraft_scores";
        const existing = JSON.parse(localStorage.getItem(key) || "[]");
        existing.push({ ...data, date: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(existing));
      } catch {}
    }
  };

  useEffect(() => {
    setMounted(true);
    setLangState(getLang());
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setIsMobileDevice(isTouchDevice);
    const savedNick = getActiveNickname();
    if (savedNick && savedNick.trim().length >= 2) {
      setNicknameState(savedNick);
      setNickLoggedIn(true);
    }

    const onMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    const onPointerLockChange = () => {
      setIsPointerLocked(!!document.pointerLockElement);
    };
    // Force hide cursor on desktop only
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (!isTouch) {
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

  const toggleLang = useCallback(() => {
    const newLang = lang === "tr" ? "en" : "tr";
    setLang(newLang);
    setLangState(newLang);
  }, [lang]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine();
    engineRef.current = engine;
    engine.init(canvasRef.current);

    engine.onStateChange = (state: GameState) => {
      setGameState(state);
      if (state === "gameover") {
        setScoreSubmitted(false);
        setSubmitting(false);
        setShowNicknameInput(false);
        // Auto-submit score
        const saved = getActiveNickname();
        const name = (saved && saved.trim().length >= 2) ? saved.trim() : "Anonim";
        setTimeout(async () => {
          try {
            setSubmitting(true);
            await submitScore({
              nickname: name,
              score: engine.stats.score,
              kills: engine.stats.kills,
              survivalTime: engine.stats.survivalTime,
              level: engine.player.level,
              maxCombo: engine.stats.maxCombo,
              character: selectedChar,
              map: "forest",
            });
            setScoreSubmitted(true);
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

    engine.onDamage = () => {
      setDamageFlash(true);
      setTimeout(() => setDamageFlash(false), 150);
    };

    engine.onBossSpawn = () => {
      // Boss HP updated via onStatsUpdate
    };

    engine.onBossDeath = () => {
      setBossInfo(null);
    };

    // Override onStatsUpdate to include boss info + DPS
    const origStatsUpdate = engine.onStatsUpdate;
    engine.onStatsUpdate = () => {
      origStatsUpdate?.();
      const currentDps = engine.dps || 0;
      setDps(currentDps);
      setMaxDps(prev => Math.max(prev, currentDps));
      // Check active boss
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
        // Calculate next boss
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
          if (secsLeft <= 10 && secsLeft > 0) {
            setBossWarning(next.name);
          } else {
            setBossWarning(null);
          }
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

    return () => {
      cancelAnimationFrame(animId);
      engine.dispose();
    };
  }, []);

  const startGame = useCallback(() => {
    try {
      setMaxDps(0);
      setDps(0);
      engineRef.current?.startGame(selectedChar);
    } catch (e) {
      console.error("startGame failed:", e);
      alert("Game start error: " + (e as Error).message);
    }
  }, [selectedChar]);

  const selectUpgrade = useCallback((option: UpgradeOption) => {
    Audio.playSelect();
    engineRef.current?.applyUpgrade(option);
    setUpgradeOptions([]);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: "100vw", height: "100vh", touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
      />

      {/* No crosshair */}

      {/* Custom cursor - desktop only */}
      {!isPointerLocked && mounted && !isMobileDevice && (
        <div
          className="custom-cursor"
          style={{ left: cursorPos.x, top: cursorPos.y }}
        />
      )}

      {/* Click to resume - desktop only, when playing but pointer not locked */}
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

      {/* Main Menu */}
      {gameState === "menu" && mounted && (
        <div className="main-menu">
          <button
            onClick={toggleLang}
            style={{
              position: "absolute", top: 20, right: 20,
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
              color: "white", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14,
            }}
          >
            {lang === "tr" ? "🇬🇧 English" : "🇹🇷 Türkçe"}
          </button>
          <h1>{t("menu.title")}</h1>
          <p className="subtitle">{t("menu.subtitle")}</p>

          {/* Character Selection */}
          <button
            onClick={() => setShowCharSelect(!showCharSelect)}
            style={{
              margin: "12px 0 4px", padding: "10px 20px", borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)",
              color: "white", fontSize: 14, cursor: "pointer", width: 250,
            }}
          >
            {CHARACTERS.find(c => c.id === selectedChar)?.icon}{" "}
            {CHARACTERS.find(c => c.id === selectedChar)?.name()}{" "}
            {showCharSelect ? "▲" : "▼"}
          </button>

          {showCharSelect && (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
              width: 320, maxWidth: "90vw", margin: "8px 0",
            }}>
              {CHARACTERS.map(ch => (
                <div
                  key={ch.id}
                  onClick={() => { setSelectedChar(ch.id); Audio.playSelect(); }}
                  style={{
                    padding: "10px 8px", borderRadius: 10, cursor: "pointer",
                    border: selectedChar === ch.id
                      ? "2px solid #ff6b35"
                      : "1px solid rgba(255,255,255,0.1)",
                    background: selectedChar === ch.id
                      ? "rgba(255,107,53,0.15)"
                      : "rgba(255,255,255,0.03)",
                    textAlign: "center",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 24 }}>{ch.icon}</div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, marginTop: 2,
                    color: selectedChar === ch.id ? "#ff6b35" : "white",
                  }}>
                    {ch.name()}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                    {ch.description()}
                  </div>
                  {/* Mini stat bars */}
                  <div style={{ marginTop: 4, display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, color: "#ff6666" }}>❤️{Math.round(ch.hpMult * 100)}%</span>
                    <span style={{ fontSize: 9, color: "#66ccff" }}>⚡{Math.round(ch.speedMult * 100)}%</span>
                    <span style={{ fontSize: 9, color: "#ffaa44" }}>⚔️{Math.round(ch.damageMult * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Nickname Section */}
          <div style={{ marginBottom: 8, marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {nickLoggedIn ? (
              /* Already logged in */
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 16, color: "#ffd700", fontWeight: 700 }}>
                  👤 {nickname}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={startGame}
                  style={{ width: 250 }}
                >
                  ✨ {lang === "tr" ? "OYNA" : "PLAY"}
                </button>
                <button
                  onClick={() => { logoutNickname(); setNickLoggedIn(false); setNicknameState(""); setPin(""); setNickMode("idle"); }}
                  style={{
                    background: "none", border: "none", color: "rgba(255,255,255,0.3)",
                    fontSize: 12, cursor: "pointer", textDecoration: "underline",
                  }}
                >
                  {lang === "tr" ? "Çıkış yap" : "Logout"}
                </button>
              </div>
            ) : (
              /* Not logged in — register/claim flow */
              <>
                <input
                  type="text"
                  placeholder={lang === "tr" ? "Takma adını gir..." : "Enter nickname..."}
                  value={nickname}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-Z0-9_\-çğıöşüÇĞİÖŞÜ ]/g, "").slice(0, 16);
                    setNicknameState(val);
                    setNickError("");
                    setNickMode("idle");
                    setNickClaimed(false);
                  }}
                  onBlur={async (e) => {
                    e.target.style.borderColor = "rgba(255,255,255,0.2)";
                    if (nickname.trim().length >= 2) {
                      setNickChecking(true);
                      const claimed = await isNicknameClaimed(nickname.trim());
                      setNickClaimed(claimed);
                      setNickChecking(false);
                    }
                  }}
                  maxLength={16}
                  style={{
                    padding: "12px 20px", borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)",
                    color: "white", fontSize: 16, width: 250, textAlign: "center", outline: "none",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#ff6b35")}
                />

                {/* PIN input */}
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
                  style={{
                    padding: "10px 20px", borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)",
                    color: "white", fontSize: 18, width: 150, textAlign: "center",
                    outline: "none", letterSpacing: 8, fontWeight: 700,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#ff6b35")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.2)")}
                />

                {/* Error message */}
                {nickError && (
                  <div style={{ fontSize: 12, color: "#ff4444", fontWeight: 600 }}>
                    {nickError}
                  </div>
                )}

                {/* Register / Claim buttons */}
                {nickname.trim().length >= 2 && pin.length === 4 && (
                  <div style={{ display: "flex", gap: 8 }}>
                    {nickClaimed ? (
                      <button
                        className="btn btn-primary"
                        disabled={nickBusy}
                        onClick={async () => {
                          setNickBusy(true);
                          const err = await claimNickname(nickname.trim(), pin);
                          setNickBusy(false);
                          if (err === "wrong_pin") {
                            setNickError(lang === "tr" ? "Yanlış PIN!" : "Wrong PIN!");
                          } else if (err === "not_found") {
                            setNickError(lang === "tr" ? "İsim bulunamadı" : "Name not found");
                          } else {
                            setNickLoggedIn(true);
                          }
                        }}
                        style={{ width: 250, opacity: nickBusy ? 0.5 : 1 }}
                      >
                        🔑 {nickBusy ? "..." : (lang === "tr" ? "Giriş Yap & Oyna" : "Login & Play")}
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        disabled={nickBusy || nickChecking}
                        onClick={async () => {
                          setNickBusy(true);
                          const err = await registerNickname(nickname.trim(), pin);
                          setNickBusy(false);
                          if (err) {
                            if (err === "already_claimed") {
                              setNickClaimed(true);
                              setNickError(lang === "tr" ? "Bu isim alınmış! PIN ile giriş yap." : "Name taken! Login with PIN.");
                            } else {
                              setNickError(lang === "tr" ? "Geçersiz giriş" : "Invalid input");
                            }
                          } else {
                            setNickLoggedIn(true);
                          }
                        }}
                        style={{ width: 250, opacity: (nickBusy || nickChecking) ? 0.5 : 1 }}
                      >
                        📝 {nickBusy ? "..." : (lang === "tr" ? "Kayıt Ol & Oyna" : "Register & Play")}
                      </button>
                    )}
                  </div>
                )}
                {nickChecking && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {lang === "tr" ? "Kontrol ediliyor..." : "Checking..."}
                  </div>
                )}
                {!nickChecking && nickname.trim().length >= 2 && nickClaimed && !nickError && (
                  <div style={{ fontSize: 11, color: "#ffd700" }}>
                    {lang === "tr" ? "Bu isim kayıtlı — PIN ile giriş yap" : "Name registered — login with PIN"}
                  </div>
                )}
                {!nickChecking && nickname.trim().length >= 2 && !nickClaimed && pin.length === 4 && (
                  <div style={{ fontSize: 11, color: "rgba(100,255,100,0.6)" }}>
                    {lang === "tr" ? "✓ İsim müsait" : "✓ Name available"}
                  </div>
                )}

                {nickname.trim().length > 0 && nickname.trim().length < 2 && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {lang === "tr" ? "En az 2 karakter" : "At least 2 characters"}
                  </div>
                )}

                {nickname.trim().length >= 2 && pin.length < 4 && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {lang === "tr" ? "4 haneli PIN gir" : "Enter 4-digit PIN"}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, width: 250, margin: "4px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{lang === "tr" ? "veya" : "or"}</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
          </div>

          {/* Play as guest */}
          <button className="btn btn-secondary" onClick={() => { logoutNickname(); setNicknameState(""); startGame(); }} style={{ width: 250 }}>
            {t("menu.play_guest")}
          </button>
          <div style={{ fontSize: 11, color: "rgba(255,215,0,0.5)", marginTop: 4, maxWidth: 280, textAlign: "center" }}>
            {t("menu.guest_warning")}
          </div>

          {/* Leaderboard */}
          <button className="btn btn-secondary" onClick={() => { window.location.href = "/leaderboard"; }} style={{ width: 250, marginTop: 12 }}>
            {t("menu.leaderboard")}
          </button>

          <p style={{ marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            {isMobileDevice
              ? (lang === "tr" ? "Joystick: Hareket · Sağ Kaydır: Kamera" : "Joystick: Move · Swipe Right: Camera")
              : t("menu.controls")
            }
          </p>

          {/* Fullscreen button (mobile) */}
          {isMobileDevice && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 8 }}>
              <button
                onClick={() => {
                  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
                  if (document.fullscreenElement) return;
                  if (el.requestFullscreen) {
                    el.requestFullscreen().catch(() => {});
                  } else if (el.webkitRequestFullscreen) {
                    el.webkitRequestFullscreen();
                  }
                  try { (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.("landscape")?.catch?.(() => {}); } catch {}
                }}
                style={{
                  padding: "10px 24px", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)",
                  color: "white", fontSize: 14, cursor: "pointer",
                }}
              >
                📱 {lang === "tr" ? "Tam Ekran" : "Fullscreen"}
              </button>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center", maxWidth: 250 }}>
                {lang === "tr"
                  ? "iOS: Paylaş → Ana Ekrana Ekle ile tam ekran deneyimi"
                  : "iOS: Share → Add to Home Screen for fullscreen"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* HUD */}
      {gameState === "playing" && (
        <div className="hud">
          {/* HP Bar */}
          <div className="hp-bar-container">
            <div className="hp-bar-bg">
              <div
                className="hp-bar-fill"
                style={{ width: `${(stats.hp / stats.maxHp) * 100}%` }}
              />
            </div>
            <div className="hp-text">
              ❤️ {stats.hp} / {stats.maxHp}
            </div>
          </div>

          {/* Weapon Slots */}
          <div className="weapon-slots">
            {weapons.map((w, i) => (
              <div key={i} className="weapon-slot">
                {w.icon}
                <span className="level-badge">{w.level}</span>
              </div>
            ))}
          </div>

          {/* Timer */}
          <div className="timer">⏱️ {formatTime(stats.survivalTime)}</div>

          {/* Combo */}
          <div className={`combo-display ${stats.currentCombo >= 10 ? "active" : ""}`}>
            🔥 x{stats.comboMultiplier.toFixed(1)}
            <div style={{ fontSize: 14 }}>{stats.currentCombo} combo</div>
          </div>

          {/* XP Bar */}
          <div className="level-display">LVL {stats.level}</div>
          <div className="xp-bar-container">
            <div className="xp-bar-bg">
              <div
                className="xp-bar-fill"
                style={{ width: `${(stats.xp / stats.xpToNext) * 100}%` }}
              />
            </div>
            <div className="xp-text">XP {stats.xp} / {stats.xpToNext}</div>
          </div>

          {/* Kill Counter */}
          <div className="kill-counter">☠️ {stats.kills.toLocaleString()} {t("hud.kills")}</div>

          {/* Score + DPS */}
          <div style={{
            position: "absolute", bottom: 50, right: 20,
            display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2,
            textShadow: "0 0 4px rgba(0,0,0,0.8)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              🏆 {stats.score.toLocaleString()}
            </div>
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: dps > 100 ? "#ff4444" : dps > 50 ? "#ffaa44" : "#66ff66",
            }}>
              ⚔️ {dps.toLocaleString()} DPS
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>
                (max {maxDps.toLocaleString()})
              </span>
            </div>
          </div>

          {/* Controls hint */}
          <div className="controls-hint">
            {t("hud.controls_hint")}
          </div>

          {/* Next Boss Timer */}
          {!bossInfo && nextBossTime !== null && nextBossTime > 0 && (
            <div style={{
              position: "fixed", top: 52, left: "50%", transform: "translateX(-50%)",
              zIndex: 20, textAlign: "center",
            }}>
              <div style={{
                fontSize: nextBossTime <= 10 ? 18 : 13,
                fontWeight: 700,
                color: nextBossTime <= 10 ? "#ff4444" : "rgba(255,255,255,0.4)",
                animation: nextBossTime <= 10 ? "pulse 0.5s ease-in-out infinite alternate" : "none",
                textShadow: nextBossTime <= 10 ? "0 0 15px rgba(255,0,0,0.6)" : "none",
              }}>
                {nextBossTime <= 10
                  ? `⚠️ ${bossWarning} ${lang === "tr" ? "GELİYOR!" : "INCOMING!"} ${Math.ceil(nextBossTime)}s`
                  : `🕐 ${lang === "tr" ? "Boss" : "Boss"}: ${Math.floor(nextBossTime / 60)}:${Math.floor(nextBossTime % 60).toString().padStart(2, "0")}`
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
              }}>
                {bossInfo.name}
              </div>
              <div style={{
                width: "100%", height: 14, background: "rgba(0,0,0,0.7)",
                borderRadius: 7, border: "1px solid rgba(255,0,0,0.4)", overflow: "hidden",
              }}>
                <div style={{
                  width: `${(bossInfo.hp / bossInfo.maxHp) * 100}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #ff0000, #ff4444)",
                  borderRadius: 7,
                  transition: "width 0.2s",
                  boxShadow: "0 0 8px rgba(255,0,0,0.5)",
                }} />
              </div>
              <div style={{
                textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2,
              }}>
                {Math.round(bossInfo.hp)} / {Math.round(bossInfo.maxHp)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Level Up Modal */}
      {gameState === "levelup" && mounted && (
        <div className="level-up-overlay">
          <div>
            <div className="level-up-title">{t("levelup.title")}</div>
            <div className="upgrade-cards">
              {upgradeOptions.map((opt) => (
                <div
                  key={opt.id}
                  className="upgrade-card"
                  onClick={() => selectUpgrade(opt)}
                >
                  <div className="icon">{opt.icon}</div>
                  <div className="name">{opt.name}</div>
                  <div className="desc">{opt.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Game Over */}
      {gameState === "gameover" && mounted && (
        <div className="game-over-overlay">
          <div className="game-over-panel">
            <div className="game-over-title">{t("gameover.title")}</div>
            <div className="game-over-score">
              {t("gameover.score")}: {stats.score.toLocaleString()}
            </div>
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
                ✅ {lang === "tr"
                  ? `Skor kaydedildi! (${nickname || "Anonim"})`
                  : `Score saved! (${nickname || "Anonymous"})`}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={startGame}>
                {t("gameover.retry")}
              </button>
              <button className="btn btn-secondary" onClick={() => setGameState("menu")}>
                {t("gameover.menu")}
              </button>
              <button className="btn btn-secondary" onClick={() => { window.location.href = "/leaderboard"; }}>
                🏆 {lang === "tr" ? "Sıralama" : "Leaderboard"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
