import type { Metadata } from "next";
import Script from "next/script";
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
  // AdSense site-ownership tag.
  other: { "google-adsense-account": "ca-pub-8450633668347138" },
  title: {
    default: "Ashby Jobs — Browse Ashby, Greenhouse, Lever & More Job Listings",
    template: "%s | Ashby Jobs",
  },
  description:
    `Browse and track job listings from top tech startups across ${providerList} — all in one place. Find remote engineering, product, and design roles from companies like OpenAI, Figma, Anthropic, Linear, Cursor, and more. Updated daily.`,
  authors: [{ name: "Ashby Jobs" }],
  creator: "Ashby Jobs",
  // Static files in public/, not generated routes: the CDN serves them without asking the server.
  icons: { icon: "/icon.png", apple: "/apple-icon.png" },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Ashby Jobs",
    title: "Ashby Jobs — Browse Ashby, Greenhouse, Lever & More Job Listings",
    description:
      `Browse job listings from top tech startups across ${providerList}. Find remote engineering, product, and design roles. Updated daily.`,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Ashby Jobs — Every AshbyHQ Job in One Feed" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ashby Jobs — Browse Ashby, Greenhouse, Lever & More Job Listings",
    description:
      `Browse job listings from top tech startups across ${providerList}. Updated daily.`,
    images: ["/og.png"],
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
        {/* AdSense: loads the library; Google decides placement once the site is approved. */}
        <Script
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8450633668347138"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <Script
          src="https://stats.whatrunsindia.com/script.js"
          data-website-id="56758f43-f995-44cd-a81d-1b0d49a93b5c"
          data-domains="jobs.whatrunsindia.com"
        />
      </body>
    </html>
  );
}
