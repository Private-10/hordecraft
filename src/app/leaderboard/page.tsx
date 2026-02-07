"use client";

import { useEffect, useState } from "react";
import { db } from "@/game/firebase";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";

interface ScoreEntry {
  nickname: string;
  score: number;
  kills: number;
  survivalTime: number;
  level: number;
  maxCombo: number;
  date: string;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function LeaderboardPage() {
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [lang, setLang] = useState<"tr" | "en">("tr");
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("hordecraft_lang") as "tr" | "en" | null;
      if (saved) setLang(saved);
    } catch {}

    // Fetch from Firestore
    (async () => {
      try {
        const q = query(collection(db, "scores"), orderBy("score", "desc"), limit(100));
        const snap = await getDocs(q);
        const entries: ScoreEntry[] = [];
        snap.forEach((doc) => {
          const d = doc.data();
          entries.push({
            nickname: d.nickname || "",
            score: d.score || 0,
            kills: d.kills || 0,
            survivalTime: d.survivalTime || 0,
            level: d.level || 1,
            maxCombo: d.maxCombo || 0,
            date: d.date || "",
          });
        });
        setScores(entries);
      } catch (e) {
        console.error("Leaderboard fetch failed:", e);
      }
      setLoading(false);
    })();
  }, []);

  if (!mounted) return null;

  const tr = lang === "tr";

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)",
      color: "white",
      fontFamily: "'Segoe UI', sans-serif",
      padding: "40px 20px",
    }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{
            fontSize: 48, fontWeight: 900, margin: 0,
            background: "linear-gradient(135deg, #ff6b35, #ffd700)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            🏆 {tr ? "SIRALAMALAR" : "LEADERBOARD"}
          </h1>
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
            {tr ? "En iyi hayatta kalanlar" : "Top survivors"}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => { window.location.href = "/play"; }}
            style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #ff6b35, #ff8c42)",
              color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            ▶ {tr ? "OYNA" : "PLAY"}
          </button>
          <button
            onClick={() => setLang(l => l === "tr" ? "en" : "tr")}
            style={{
              padding: "10px 16px", borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)",
              color: "white", fontSize: 14, cursor: "pointer",
            }}
          >
            {tr ? "🇬🇧 EN" : "🇹🇷 TR"}
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.4)", fontSize: 18 }}>
            ⏳ {tr ? "Yükleniyor..." : "Loading..."}
          </div>
        ) : scores.length === 0 ? (
          <div style={{
            textAlign: "center", padding: 60,
            color: "rgba(255,255,255,0.4)", fontSize: 18,
          }}>
            {tr ? "Henüz skor yok. İlk sen ol! 🎮" : "No scores yet. Be the first! 🎮"}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {/* Header row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "50px 1fr 100px 80px 70px 60px 80px",
                padding: "12px 16px",
                fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
              }}>
                <span>#</span>
                <span>{tr ? "İsim" : "Name"}</span>
                <span style={{ textAlign: "right" }}>{tr ? "Skor" : "Score"}</span>
                <span style={{ textAlign: "right" }}>☠️</span>
                <span style={{ textAlign: "right" }}>⏱️</span>
                <span style={{ textAlign: "right" }}>Lvl</span>
                <span style={{ textAlign: "right" }}>🔥</span>
              </div>

              {scores.map((s, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
                const isTop3 = i < 3;
                return (
                  <div key={i} style={{
                    display: "grid",
                    gridTemplateColumns: "50px 1fr 100px 80px 70px 60px 80px",
                    padding: "14px 16px",
                    background: isTop3 ? "rgba(255, 215, 0, 0.05)" : "rgba(255,255,255,0.02)",
                    borderRadius: 10,
                    border: isTop3 ? "1px solid rgba(255, 215, 0, 0.15)" : "1px solid rgba(255,255,255,0.05)",
                    fontSize: 14,
                    alignItems: "center",
                  }}>
                    <span style={{ fontWeight: 700 }}>{medal}</span>
                    <span style={{ fontWeight: 600, color: isTop3 ? "#ffd700" : "white" }}>
                      {s.nickname || (tr ? "Anonim" : "Anonymous")}
                    </span>
                    <span style={{ textAlign: "right", fontWeight: 700, color: "#ff6b35" }}>
                      {s.score.toLocaleString()}
                    </span>
                    <span style={{ textAlign: "right" }}>{s.kills.toLocaleString()}</span>
                    <span style={{ textAlign: "right" }}>{formatTime(s.survivalTime)}</span>
                    <span style={{ textAlign: "right" }}>{s.level}</span>
                    <span style={{ textAlign: "right" }}>x{s.maxCombo}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 32, color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
          HordeCraft © 2026
        </div>
      </div>
    </div>
  );
}
