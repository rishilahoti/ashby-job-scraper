"use client";

import { useEffect, useState } from "react";

// localStorage value: "done" once answered, else the ms timestamp until which
// a dismissed card stays hidden.
const KEY = "survey-pay";
const SNOOZE_MS = 2 * 24 * 60 * 60 * 1000;

function remember(value: string) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // storage disabled: the card comes back on the next page load
  }
}

// True when this browser should be asked and the server still wants answers.
export function useSurveyOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    if (saved === "done" || Number(saved) > Date.now()) return;
    fetch("/api/survey")
      .then((r) => r.json())
      .then((d) => setOpen(d.open === true))
      .catch(() => {});
  }, []);
  return [open, () => setOpen(false)];
}

export default function SurveyCard({ onClose }: { onClose: () => void }) {
  const [thanks, setThanks] = useState(false);

  const snooze = () => {
    remember(String(Date.now() + SNOOZE_MS));
    onClose();
  };

  const answer = (score: number) => {
    remember("done");
    setThanks(true);
    setTimeout(onClose, 2500);
    fetch("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score }),
    }).catch(() => {});
  };

  return (
    <div className="rounded-lg border border-edge bg-paper shadow-xl p-4 animate-menu-in">
      <p className="text-[10px] font-mono uppercase tracking-wider text-signal mb-1">Quick question</p>
      {thanks ? (
        <p className="text-sm font-semibold text-ink">Thanks, that helps a lot.</p>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink mb-1">Would you pay a little to keep this running?</p>
          <p className="text-xs text-ink-secondary mb-3">
            How likely are you to pay up to $3 a month toward servers and other costs?
          </p>
          <div role="group" aria-label="Likelihood from 1 to 5" className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => answer(n)}
                className="h-9 w-9 rounded-full border border-edge text-sm text-ink hover:border-signal hover:bg-signal/10 transition-colors cursor-pointer"
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-ink-muted mt-1 mb-3">
            <span>Not likely</span>
            <span>Very likely</span>
          </div>
          <button
            type="button"
            onClick={snooze}
            className="text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            Not now
          </button>
        </>
      )}
    </div>
  );
}
