import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PROVIDER_NAMES } from "@/lib/providers";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";
const providerList = PROVIDER_NAMES.join(", ");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  verification: {
    google: "P2_1zWxkE0R-QmgUGw4dGpmHqVlIO0X-SaoFDdH-ciM",
  },
  title: {
    default: "Ashby Jobs — Browse Ashby, Greenhouse, Lever & More Job Listings",
    template: "%s | Ashby Jobs",
  },
  description:
    `Browse and track job listings from top tech startups across ${providerList} — all in one place. Find remote engineering, product, and design roles from companies like OpenAI, Figma, Anthropic, Linear, Cursor, and more. Updated daily.`,
  keywords: [
    "ashby hq jobs",
    "ashby jobs board",
    "ashbyhq careers",
    "lever jobs",
    "lever.co jobs",
    "lever job board",
    "greenhouse jobs",
    "greenhouse.io jobs",
    "greenhouse job board",
    "workable jobs",
    "recruitee jobs",
    "teamtailor jobs",
    "pinpoint ats jobs",
    "smartrecruiters jobs",
    "ashby lever greenhouse jobs",
    "tech startup jobs",
    "remote tech jobs",
    "engineering jobs startups",
    "job board aggregator",
    "ats job scraper",
    "ashby hq scraper",
    "ashby hiring",
  ],
  authors: [{ name: "Ashby Jobs" }],
  creator: "Ashby Jobs",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Ashby Jobs",
    title: "Ashby Jobs — Browse Ashby, Greenhouse, Lever & More Job Listings",
    description:
      `Browse job listings from top tech startups across ${providerList}. Find remote engineering, product, and design roles. Updated daily.`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Ashby Jobs — Browse Ashby, Greenhouse, Lever & More Job Listings",
    description:
      `Browse job listings from top tech startups across ${providerList}. Updated daily.`,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
};

const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.add(dark ? 'dark' : 'light');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
