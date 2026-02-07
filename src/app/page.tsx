"use client";
import Link from "next/link";
import { getLang, t } from "../game/i18n";

export default function Home() {
  const lang = getLang();
  
  return (
    <div
      className="landing-container"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0a0a0f 0%, #1a0f2e 50%, #0f1a2e 100%)",
        color: "white",
        padding: "20px",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* Background pattern */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: "radial-gradient(circle at 25% 25%, rgba(255, 107, 53, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255, 215, 0, 0.1) 0%, transparent 50%)",
        zIndex: -1
      }}></div>

      {/* Main title */}
      <h1
        style={{
          fontSize: "clamp(3rem, 8vw, 6rem)",
          fontWeight: 900,
          background: "linear-gradient(135deg, #ff6b35, #ffd700, #ff6b35)",
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: 10,
          textAlign: "center",
          animation: "gradientShift 3s ease-in-out infinite",
          textShadow: "0 0 20px rgba(255, 107, 53, 0.3)"
        }}
      >
        HORDECRAFT
      </h1>

      {/* Subtitle */}
      <p style={{ 
        fontSize: "clamp(1rem, 3vw, 1.4rem)", 
        color: "rgba(255,255,255,0.8)", 
        marginBottom: 30,
        textAlign: "center",
        maxWidth: "600px",
        lineHeight: 1.6
      }}>
        {t(lang, "survival_description")}
      </p>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "20px", marginBottom: 40, flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          href="/play"
          style={{
            padding: "18px 40px",
            fontSize: "1.2rem",
            fontWeight: "bold",
            background: "linear-gradient(135deg, #ff6b35, #ff8c42)",
            color: "white",
            borderRadius: 16,
            textDecoration: "none",
            transition: "all 0.3s ease",
            boxShadow: "0 4px 15px rgba(255, 107, 53, 0.4)",
            border: "none",
            cursor: "pointer",
            minWidth: "160px",
            textAlign: "center"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(255, 107, 53, 0.6)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 15px rgba(255, 107, 53, 0.4)";
          }}
        >
          🎮 {t(lang, "play")}
        </Link>

        <Link
          href="/leaderboard"
          style={{
            padding: "18px 40px",
            fontSize: "1.2rem",
            fontWeight: "bold",
            background: "linear-gradient(135deg, #ffd700, #ffed4e)",
            color: "#1a1a1a",
            borderRadius: 16,
            textDecoration: "none",
            transition: "all 0.3s ease",
            boxShadow: "0 4px 15px rgba(255, 215, 0, 0.4)",
            border: "none",
            cursor: "pointer",
            minWidth: "160px",
            textAlign: "center"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(255, 215, 0, 0.6)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 15px rgba(255, 215, 0, 0.4)";
          }}
        >
          🏆 {t(lang, "leaderboard")}
        </Link>
      </div>

      {/* Features grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
        gap: "20px",
        maxWidth: "800px",
        width: "100%",
        marginBottom: 40
      }}>
        <div style={{
          background: "rgba(255, 255, 255, 0.05)",
          backdropFilter: "blur(10px)",
          borderRadius: "16px",
          padding: "20px",
          textAlign: "center",
          border: "1px solid rgba(255, 107, 53, 0.2)"
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "10px" }}>👥</div>
          <h3 style={{ margin: "0 0 8px", color: "#ff6b35" }}>{t(lang, "characters")}</h3>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(255,255,255,0.7)" }}>6 {t(lang, "unique_characters")}</p>
        </div>

        <div style={{
          background: "rgba(255, 255, 255, 0.05)",
          backdropFilter: "blur(10px)",
          borderRadius: "16px",
          padding: "20px",
          textAlign: "center",
          border: "1px solid rgba(255, 215, 0, 0.2)"
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "10px" }}>⚔️</div>
          <h3 style={{ margin: "0 0 8px", color: "#ffd700" }}>{t(lang, "weapons")}</h3>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(255,255,255,0.7)" }}>5 {t(lang, "powerful_weapons")}</p>
        </div>

        <div style={{
          background: "rgba(255, 255, 255, 0.05)",
          backdropFilter: "blur(10px)",
          borderRadius: "16px",
          padding: "20px",
          textAlign: "center",
          border: "1px solid rgba(170, 0, 255, 0.2)"
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "10px" }}>👑</div>
          <h3 style={{ margin: "0 0 8px", color: "#aa00ff" }}>{t(lang, "bosses")}</h3>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(255,255,255,0.7)" }}>3 {t(lang, "epic_bosses")}</p>
        </div>
      </div>

      {/* Game info */}
      <div style={{ 
        marginBottom: 30, 
        fontSize: "1rem", 
        color: "rgba(255,255,255,0.6)", 
        textAlign: "center",
        lineHeight: 1.8,
        maxWidth: "600px"
      }}>
        <p>{t(lang, "game_description")}</p>
        <p style={{ marginTop: 8, fontSize: "0.9rem" }}>{t(lang, "controls_info")}</p>
      </div>

      {/* Footer */}
      <footer style={{
        marginTop: "auto",
        paddingTop: 20,
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
        textAlign: "center",
        color: "rgba(255, 255, 255, 0.4)",
        fontSize: "0.9rem"
      }}>
        HordeCraft © 2026
      </footer>

      <style jsx>{`
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        @media (max-width: 768px) {
          .landing-container {
            padding: 15px !important;
          }
        }
      `}</style>
    </div>
  );
}
