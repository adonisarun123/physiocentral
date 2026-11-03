import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted fonts (no third-party font requests; §21.1). DM Serif Display for
// M3 display/headline roles, DM Sans for title/body/label roles.
const dmSerif = localFont({
  src: "../../node_modules/@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff2",
  variable: "--font-dm-serif",
  display: "swap",
  weight: "400",
});
const dmSans = localFont({
  src: "../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
  variable: "--font-dm-sans",
  display: "swap",
  weight: "100 1000",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Physio Central by Dr Nitin Sunku — Physiotherapy & Rehabilitation, HSR Layout", template: "%s | Physio Central by Dr Nitin Sunku" },
  description: "Physio Central by Dr Nitin Sunku — orthopaedic, post-surgical and sports injury rehabilitation, spine and posture care, and home visits in HSR Layout, Bengaluru.",
  applicationName: "Physio Central by Dr Nitin Sunku",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#002552",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${dmSerif.variable} ${dmSans.variable}`}>
      <body className="min-h-screen antialiased">
        <a href="#main" className="skip-link">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
