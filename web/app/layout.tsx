import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ashbyhq-scraper.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ashby Tracker — Browse AshbyHQ Job Listings",
    template: "%s | Ashby Tracker",
  },
  description:
    "Browse and track job listings from 135+ top tech startups on AshbyHQ. Find remote engineering, product, and design roles from companies like OpenAI, Figma, Anthropic, Linear, Cursor, and more. Updated twice daily.",
  keywords: [
    "ashby hq jobs",
    "ashby jobs board",
    "ashbyhq careers",
    "tech startup jobs",
    "remote tech jobs",
    "engineering jobs startups",
    "ashby hq scraper",
    "ashby hiring",
  ],
  authors: [{ name: "Ashby Tracker" }],
  creator: "Ashby Tracker",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Ashby Tracker",
    title: "Ashby Tracker — Browse AshbyHQ Job Listings",
    description:
      "Browse job listings from 135+ top tech startups on AshbyHQ. Find remote engineering, product, and design roles. Updated twice daily.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ashby Tracker — Browse AshbyHQ Job Listings",
    description:
      "Browse job listings from 135+ top tech startups on AshbyHQ. Updated twice daily.",
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
      </body>
    </html>
  );
}
