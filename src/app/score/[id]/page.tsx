"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/game/firebase";
import { doc, getDoc } from "firebase/firestore";

interface ScoreData {
  nickname: string;
  score: number;
  kills: number;
  survivalTime: number;
  level: number;
  maxCombo: number;
  character: string;
  map: string;
  date: string;
}

const CHARACTER_ICONS: Record<string, string> = {
  knight: "🛡️", mage: "🧙", rogue: "🗡️", priest: "✝️", berserker: "🪓", necromancer: "💀",
};
const CHARACTER_NAMES_TR: Record<string, string> = {
  knight: "Şövalye", mage: "Büyücü", rogue: "Hırsız", priest: "Rahip", berserker: "Berserker", necromancer: "Nekromansır",
};
const CHARACTER_NAMES_EN: Record<string, string> = {
  knight: "Knight", mage: "Mage", rogue: "Rogue", priest: "Priest", berserker: "Berserker", necromancer: "Necromancer",
};
const MAP_NAMES_TR: Record<string, string> = { forest: "Büyülü Orman", desert: "Kavurucu Çöl" };
const MAP_NAMES_EN: Record<string, string> = { forest: "Enchanted Forest", desert: "Scorched Desert" };
const MAP_ICONS: Record<string, string> = { forest: "🌲", desert: "🏜️" };

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function ScorePage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lang, setLang] = useState<"tr" | "en">("tr");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("hordecraft_lang") as "tr" | "en" | null;
      if (saved) setLang(saved);
      else {
        const browserLang = navigator.language.toLowerCase();
        if (browserLang.startsWith("en")) setLang("en");
      }
    } catch {}

    if (!id) { setError(true); setLoading(false); return; }

    (async () => {
      try {
        const snap = await getDoc(doc(db, "scores", id));
        if (!snap.exists()) { setError(true); setLoading(false); return; }
        const d = snap.data();
        setData({
          nickname: d.nickname || "",
          score: d.score || 0,
          kills: d.kills || 0,
          survivalTime: d.survivalTime || 0,
          level: d.level || 1,
          maxCombo: d.maxCombo || 0,
          character: d.character || "knight",
          map: d.map || "forest",
          date: d.date || "",
        });
      } catch (e) {
        console.error("Score fetch failed:", e);
        setError(true);
      }
      setLoading(false);
    })();
  }, [id]);

  const tr = lang === "tr";

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center", fontSize: 24, color: "rgba(255,255,255,0.5)" }}>⏳ {tr ? "Yükleniyor..." : "Loading..."}</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
          <div style={{ fontSize: 20, marginBottom: 24 }}>{tr ? "Skor bulunamadı" : "Score not found"}</div>
          <a href="/play" style={playBtnStyle}>{tr ? "🎮 Oyna" : "🎮 Play Now"}</a>
        </div>
      </div>
    );
  }

  const charIcon = CHARACTER_ICONS[data.character] || "🛡️";
  const charName = tr ? (CHARACTER_NAMES_TR[data.character] || data.character) : (CHARACTER_NAMES_EN[data.character] || data.character);
  const mapName = tr ? (MAP_NAMES_TR[data.map] || data.map) : (MAP_NAMES_EN[data.map] || data.map);
  const mapIcon = MAP_ICONS[data.map] || "🌲";
  const displayName = data.nickname || (tr ? "Anonim" : "Anonymous");
  const dateStr = data.date ? new Date(data.date).toLocaleDateString(tr ? "tr-TR" : "en-US", { year: "numeric", month: "short", day: "numeric" }) : "";

  return (
    <>
      <head>
        <title>{`${displayName} scored ${data.score.toLocaleString()} on HordeCraft!`}</title>
        <meta property="og:title" content={`${displayName} scored ${data.score.toLocaleString()} on HordeCraft!`} />
        <meta property="og:description" content={`${charIcon} ${charName} | ☠️ ${data.kills} kills | ⏱️ ${formatTime(data.survivalTime)} | Lvl ${data.level} | 🔥 x${data.maxCombo} combo | ${mapIcon} ${mapName}`} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://hordecraft.online/score/${id}`} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={`${displayName} scored ${data.score.toLocaleString()} on HordeCraft!`} />
      </head>
      <div style={containerStyle}>
        <div style={cardStyle}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 8, letterSpacing: 2 }}>HORDECRAFT</div>
            <div style={{ fontSize: 48, marginBottom: 4 }}>{charIcon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#ffd700" }}>{displayName}</div>
            {dateStr && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{dateStr}</div>}
          </div>

          {/* Score */}
          <div style={{
            textAlign: "center", padding: "20px 0", marginBottom: 20,
            borderTop: "1px solid rgba(255,255,255,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{tr ? "SKOR" : "SCORE"}</div>
            <div style={{
              fontSize: 48, fontWeight: 900,
              background: "linear-gradient(135deg, #ff6b35, #ffb347)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              {data.score.toLocaleString()}
            </div>
          </div>

          {/* Stats grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24,
          }}>
            {[
              { icon: "☠️", label: tr ? "Öldürme" : "Kills", value: data.kills.toLocaleString() },
              { icon: "⏱️", label: tr ? "Süre" : "Time", value: formatTime(data.survivalTime) },
              { icon: "📊", label: tr ? "Seviye" : "Level", value: `${data.level}` },
              { icon: "🔥", label: tr ? "Maks Kombo" : "Max Combo", value: `x${data.maxCombo}` },
              { icon: charIcon, label: tr ? "Karakter" : "Character", value: charName },
              { icon: mapIcon, label: tr ? "Harita" : "Map", value: mapName },
            ].map((stat, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 8px", textAlign: "center",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{stat.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "white" }}>{stat.value}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Play button */}
          <div style={{ textAlign: "center" }}>
            <a href="/play" style={playBtnStyle}>
              {tr ? "🎮 ŞİMDİ OYNA!" : "🎮 PLAY NOW!"}
            </a>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 24, color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
          HordeCraft © 2026
        </div>
      </div>
    </>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)",
  color: "white",
  fontFamily: "'Segoe UI', sans-serif",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  padding: 20,
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20, padding: 32, maxWidth: 420, width: "100%",
  backdropFilter: "blur(10px)",
};

const playBtnStyle: React.CSSProperties = {
  display: "inline-block", padding: "14px 40px", borderRadius: 12,
  background: "linear-gradient(135deg, #ff6b35, #ff8c42)",
  color: "white", fontWeight: 800, fontSize: 18, textDecoration: "none",
  boxShadow: "0 4px 20px rgba(255,107,53,0.4)",
};
