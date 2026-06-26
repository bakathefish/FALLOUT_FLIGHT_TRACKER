import type { Metadata, Viewport } from "next";
import { Inter, Saira_Condensed, JetBrains_Mono } from "next/font/google";
import { EVENT_NAME } from "@/lib/config";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const saira = Saira_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-saira",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

const title = "FALLOUT // ARRIVALS // SHENZHEN";
const description =
  "live board watching the fallout cohort's flights converge on shenzhen and hong kong.";

export const metadata: Metadata = {
  // resolves the absolute urls for the og/twitter images. vercel exposes the
  // production url at build time; locally we fall back to localhost.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000",
  ),
  title,
  description,
  applicationName: EVENT_NAME,
  openGraph: {
    title,
    description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0E1A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${saira.variable} ${jetbrains.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
