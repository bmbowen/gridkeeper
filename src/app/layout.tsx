import type { Metadata, Viewport } from "next";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "GRIDKEEPER — Keep the lights on",
  description: "A 3D industrial cybersecurity strategy game. Defend substations, water plants and power grids against simulated cyber threats.",
};

export const viewport: Viewport = { themeColor: "#050b14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
