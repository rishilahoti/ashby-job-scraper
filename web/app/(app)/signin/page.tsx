"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

type Step = "email" | "code";

export default function SignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not send code.");
        return;
      }
      setStep("code");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await signIn("email-otp", { email, code, redirect: false });
    setBusy(false);
    if (result?.error) {
      setError("Incorrect or expired code.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="max-w-sm mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-xl font-bold tracking-tight mb-1">Sign in</h1>
        <p className="text-sm text-ink-secondary leading-relaxed">
          Optional — sign in to sync applied/ignored jobs across devices. Browsing and tracking without an account still works.
        </p>
      </div>

      <div className="space-y-2.5">
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="w-full h-10 px-4 rounded-md text-sm font-medium border border-edge
                     text-ink hover:border-edge-strong hover:bg-surface transition-colors cursor-pointer"
        >
          Continue with Google
        </button>
        <button
          type="button"
          onClick={() => signIn("github", { callbackUrl: "/" })}
          className="w-full h-10 px-4 rounded-md text-sm font-medium border border-edge
                     text-ink hover:border-edge-strong hover:bg-surface transition-colors cursor-pointer"
        >
          Continue with GitHub
        </button>
      </div>

      <div className="flex items-center gap-3 my-6">
        <div className="h-px flex-1 bg-edge" />
        <span className="text-xs text-ink-muted">or</span>
        <div className="h-px flex-1 bg-edge" />
      </div>

      {step === "email" ? (
        <form onSubmit={requestCode} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full h-10 px-3 text-sm bg-surface border border-edge rounded-md
                       placeholder:text-ink-muted focus:outline-none focus:border-edge-strong
                       focus:ring-1 focus:ring-edge-strong transition-colors"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full h-10 px-4 rounded-md text-sm font-medium bg-ink text-paper
                       hover:bg-ink/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {busy ? "Sending..." : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-3">
          <p className="text-xs text-ink-muted">Code sent to {email}.</p>
          <input
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            className="w-full h-10 px-3 text-sm bg-surface border border-edge rounded-md
                       placeholder:text-ink-muted focus:outline-none focus:border-edge-strong
                       focus:ring-1 focus:ring-edge-strong font-mono tracking-widest transition-colors"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full h-10 px-4 rounded-md text-sm font-medium bg-ink text-paper
                       hover:bg-ink/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {busy ? "Verifying..." : "Verify & sign in"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("email"); setCode(""); setError(""); }}
            className="w-full text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            Use a different email
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-signal">{error}</p>}
    </div>
  );
}
