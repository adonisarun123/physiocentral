import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted variable fonts (no third-party font requests; §21.1).
const jakarta = localFont({
  src: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  variable: "--font-jakarta",
  display: "swap",
  weight: "200 800",
});
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
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
  themeColor: "#0066d6",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={`${jakarta.variable} ${inter.variable}`}>
      <body className="min-h-screen antialiased">
        <a href="#main" className="skip-link">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
