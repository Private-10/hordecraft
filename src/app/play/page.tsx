"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine } from "@/game/engine";
import type { GameState, UpgradeOption } from "@/game/types";
import { t, getLang, setLang, type Lang } from "@/game/i18n";

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

  useEffect(() => {
    setMounted(true);
    setLangState(getLang());

    const onMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };
    const onPointerLockChange = () => {
      setIsPointerLocked(!!document.pointerLockElement);
    };
    // Force hide cursor on entire document
    document.documentElement.style.cursor = "none";
    document.body.style.cursor = "none";
    
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

    engine.onStateChange = (state: GameState) => setGameState(state);

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
    engineRef.current?.startGame();
  }, []);

  const selectUpgrade = useCallback((option: UpgradeOption) => {
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
        style={{ width: "100vw", height: "100vh" }}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
      />

      {/* No crosshair */}

      {/* Custom cursor - show when pointer is NOT locked */}
      {!isPointerLocked && mounted && (
        <div
          className="custom-cursor"
          style={{ left: cursorPos.x, top: cursorPos.y }}
        />
      )}

      {/* Click to resume - show when playing but pointer not locked */}
      {gameState === "playing" && !isPointerLocked && (
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
          <button className="btn btn-primary" onClick={startGame}>
            {t("menu.play")}
          </button>
          <button className="btn btn-secondary" style={{ opacity: 0.5, cursor: "not-allowed" }}>
            {t("menu.leaderboard")}
          </button>
          <p style={{ marginTop: 30, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            {t("menu.controls")}
          </p>
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

          {/* Score */}
          <div className="score-display">🏆 {stats.score.toLocaleString()}</div>

          {/* Controls hint */}
          <div className="controls-hint">
            {t("hud.controls_hint")}
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
            </div>
            <div style={{ marginBottom: 20, color: "var(--gold)" }}>
              💰 +{stats.gold} {t("gameover.gold_earned")}
            </div>
            <button className="btn btn-primary" onClick={startGame}>
              {t("gameover.retry")}
            </button>
            <button className="btn btn-secondary" onClick={() => setGameState("menu")}>
              {t("gameover.menu")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
