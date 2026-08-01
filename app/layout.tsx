import type { Metadata } from "next";
import { IBM_Plex_Mono, Poppins } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "WOW Leads",
  description:
    "Lead and prospecting module for WOW OS — four pipelines, AI-drafted touchpoints, human approval.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font variables go on <html>, not <body>: Tailwind's @theme emits
    // --font-sans at :root, so --font-poppins has to be defined there too or
    // the whole value is invalid and the stack silently falls back.
    <html lang="en" className={`${poppins.variable} ${plexMono.variable}`}>
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
