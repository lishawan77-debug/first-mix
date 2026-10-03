import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./controls.css";
import "./first-mix.css";
export const metadata: Metadata = { title: "FIRST MIX - Learn to DJ", description: "Easy, five-minute DJ learning games for complete beginners.", manifest: "/manifest.webmanifest", icons: { icon: "/favicon.svg" } };
export const viewport: Viewport = { themeColor: "#090b10", width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
