import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HordeCraft — 3D Roguelike Survival",
  description: "Tarayıcıda oynanan 3D roguelike survival. Düşman dalgalarına karşı hayatta kal, güçlen, sıralamada zirveye çık!",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0a0a1a" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body style={{ overscrollBehavior: "none" }}>{children}</body>
    </html>
  );
}
