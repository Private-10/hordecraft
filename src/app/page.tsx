"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { getLang, setLang, t, type Lang } from "../game/i18n";

export default function Home() {
  const [lang, setLangState] = useState<Lang>("tr");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setLangState(getLang());
  }, []);

  const toggleLang = () => {
    const newLang = lang === "tr" ? "en" : "tr";
    setLang(newLang);
    setLangState(newLang);
  };

  if (!mounted) return null;

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "linear-gradient(170deg, #0a0a0f 0%, #1a0f2e 40%, #0f1a2e 100%)",
      color: "white",
      overflow: "auto",
      position: "relative",
    }}>
      {/* Background glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "radial-gradient(ellipse at 30% 20%, rgba(255, 107, 53, 0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(255, 215, 0, 0.06) 0%, transparent 50%)",
      }} />

      {/* Top bar */}
      <div style={{
        display: "flex", justifyContent: "flex-end", padding: "16px 20px",
        position: "relative", zIndex: 2,
      }}>
        <button onClick={toggleLang} style={{
          padding: "6px 14px", background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)",
          borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          {lang === "tr" ? "🇬🇧 EN" : "🇹🇷 TR"}
        </button>
      </div>

      {/* Hero section */}
      <div style={{
        flex: "0 0 auto", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 20px 30px", position: "relative", zIndex: 1,
      }}>
        <h1 style={{
          fontSize: "clamp(3rem, 12vw, 5.5rem)", fontWeight: 900,
          background: "linear-gradient(135deg, #ff6b35 0%, #ffd700 50%, #ff6b35 100%)",
          backgroundSize: "200% 200%",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          animation: "titleShimmer 4s ease-in-out infinite",
          lineHeight: 1.1, letterSpacing: -1, textAlign: "center",
        }}>HORDECRAFT</h1>

        <p style={{
          fontSize: "clamp(0.9rem, 2.5vw, 1.15rem)",
          color: "rgba(255,255,255,0.55)", marginTop: 8,
          textAlign: "center", maxWidth: 500, lineHeight: 1.6,
        }}>
          {t(lang, "survival_description")}
        </p>

        {/* CTA Buttons */}
        <div style={{
          display: "flex", gap: 14, marginTop: 32, flexWrap: "wrap", justifyContent: "center",
        }}>
          <Link href="/play" style={{
            padding: "16px 40px", fontSize: "1.1rem", fontWeight: 800,
            background: "linear-gradient(135deg, #ff6b35, #ff8855)",
            color: "white", borderRadius: 14, textDecoration: "none",
            boxShadow: "0 4px 24px rgba(255, 107, 53, 0.35)",
            minWidth: 160, textAlign: "center", letterSpacing: 1,
          }}>
            ⚔️ {t(lang, "play")}
          </Link>
          <Link href="/leaderboard" style={{
            padding: "16px 40px", fontSize: "1.1rem", fontWeight: 700,
            background: "linear-gradient(135deg, #2a1a00, #3a2800)",
            border: "1.5px solid rgba(255, 215, 0, 0.25)",
            color: "#ffd700", borderRadius: 14, textDecoration: "none",
            minWidth: 160, textAlign: "center",
          }}>
            🏆 {t(lang, "leaderboard")}
          </Link>
        </div>
      </div>

      {/* Features */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 14, maxWidth: 700, width: "100%",
        margin: "0 auto", padding: "20px 20px 40px",
        position: "relative", zIndex: 1,
      }}>
        {[
          { icon: "👥", title: t(lang, "characters"), sub: `6 ${t(lang, "unique_characters")}`, color: "#ff6b35" },
          { icon: "⚔️", title: t(lang, "weapons"), sub: `7 ${t(lang, "powerful_weapons")}`, color: "#ffd700" },
          { icon: "👑", title: t(lang, "bosses"), sub: `3 ${t(lang, "epic_bosses")}`, color: "#aa44ff" },
        ].map((f, i) => (
          <div key={i} style={{
            background: "rgba(255,255,255,0.04)", borderRadius: 14,
            padding: "20px 16px", textAlign: "center",
            border: `1px solid ${f.color}22`,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{f.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: f.color, marginBottom: 4 }}>{f.title}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{f.sub}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        textAlign: "center", padding: "20px",
        color: "rgba(255,255,255,0.2)", fontSize: 13,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        position: "relative", zIndex: 1,
      }}>
        <div>{t(lang, "controls_info")}</div>
        <div style={{ marginTop: 6 }}>HordeCraft © 2026</div>
      </div>

      <style jsx>{`
        @keyframes titleShimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
}
