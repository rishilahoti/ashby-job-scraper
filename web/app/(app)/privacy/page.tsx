import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Ashby Jobs stores about you, which cookies it and Google's ads use, and how to opt out.",
  alternates: { canonical: "/privacy" },
};

const CONTACT = "rishilahoti99@gmail.com";
const H2 = "font-display text-base font-semibold tracking-tight mt-8 mb-2";
const P = "text-sm text-ink-secondary leading-relaxed mb-3";
const A = "text-signal underline";

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-xl font-bold tracking-tight mb-2">Privacy policy</h1>
      <p className="text-xs text-ink-muted mb-6">Last updated October 30, 2026</p>

      <p className={P}>
        Ashby Jobs (jobs.whatrunsindia.com) lists public job postings from company career pages. You can
        browse without an account. This page says what we keep, why, and how to remove it.
      </p>

      <h2 className={H2}>If you sign in</h2>
      <p className={P}>
        Signing in with Google, GitHub or an email code stores your email address, and your name and
        profile picture if the provider shares them. We also store the jobs you mark Applied or Ignored,
        so they follow you across devices. Email sign-in codes are kept only until they expire.
      </p>

      <h2 className={H2}>Stored in your browser</h2>
      <p className={P}>
        Without an account, your Applied and Ignored marks, theme, dismissed notifications, and any
        resume you paste into Match resume stay in your browser&apos;s local storage. They never reach
        our server, except as described below.
      </p>

      <h2 className={H2}>Match resume</h2>
      <p className={P}>
        Skills are matched inside your browser. If you ask us to read your years of experience, the
        resume text is sent once to an AI model (Groq, or Google Gemini if Groq is busy) to get that
        number. We don&apos;t save the resume.
      </p>

      <h2 className={H2}>Cookies</h2>
      <p className={P}>
        We set a sign-in cookie when you sign in, and a random survey cookie if you answer our one-question
        survey, so we don&apos;t ask you twice. Survey answers are stored with that random id, and with
        your account if you&apos;re signed in.
      </p>

      <h2 className={H2}>Advertising</h2>
      <p className={P}>
        Some pages show ads from Google AdSense. Third-party vendors, including Google, use cookies to
        serve ads based on your prior visits to this and other websites. Google&apos;s advertising
        cookies let it and its partners serve ads based on those visits.
      </p>
      <p className={P}>
        You can opt out of personalized advertising in{" "}
        <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" className={A}>
          Google&apos;s Ads Settings
        </a>
        , or opt out of other vendors&apos; cookies at{" "}
        <a href="https://www.aboutads.info/choices" target="_blank" rel="noopener noreferrer" className={A}>
          aboutads.info
        </a>
        . Read{" "}
        <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer" className={A}>
          how Google uses information from sites that use its services
        </a>
        .
      </p>

      <h2 className={H2}>Analytics</h2>
      <p className={P}>
        We count visits with Umami, which we host ourselves and which sets no cookies, and with
        Cloudflare Web Analytics, which also uses no cookies. Neither tracks you across sites.
      </p>

      <h2 className={H2}>Deleting your data</h2>
      <p className={P}>
        Email{" "}
        <a href={`mailto:${CONTACT}`} className={A}>
          {CONTACT}
        </a>{" "}
        from your account&apos;s address and we&apos;ll delete your account and everything stored with
        it. Clearing your browser&apos;s site data removes what&apos;s kept locally.
      </p>
    </div>
  );
}
