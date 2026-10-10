import type { Metadata, Viewport } from "next";
import "@fontsource/anton/400.css";
import "@fontsource/stardos-stencil/400.css";
import "@fontsource/stardos-stencil/700.css";
import "@fontsource/special-elite/400.css";
import "@fontsource/permanent-marker/400.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SUBLEVEL — a fight-club card duel on Monad",
  description:
    "Write who your fighter is, pick how they fight, and duel 1v1 with secret simultaneous moves. Every card remembers every fight.",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
