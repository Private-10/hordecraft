import Link from "next/link";

export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0f",
        color: "white",
      }}
    >
      <h1
        style={{
          fontSize: "5rem",
          fontWeight: 900,
          background: "linear-gradient(135deg, #ff6b35, #ffd700)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: 10,
        }}
      >
        HORDECRAFT
      </h1>
      <p style={{ fontSize: "1.2rem", color: "rgba(255,255,255,0.5)", marginBottom: 50 }}>
        3D Roguelike Survival — Tarayıcında Oyna
      </p>

      <Link
        href="/play"
        style={{
          padding: "18px 60px",
          fontSize: "1.3rem",
          fontWeight: "bold",
          background: "#ff6b35",
          color: "white",
          borderRadius: 16,
          textDecoration: "none",
          transition: "all 0.2s",
          marginBottom: 16,
        }}
      >
        🎮 OYNA
      </Link>

      <div style={{ marginTop: 40, fontSize: 14, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
        <p>Düşman dalgalarına karşı hayatta kal · Güçlen · Sıralamada yarış</p>
        <p style={{ marginTop: 8 }}>WASD + Mouse · Tarayıcı tabanlı · Ücretsiz</p>
      </div>
    </div>
  );
}
