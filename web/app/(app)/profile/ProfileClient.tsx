"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { ProfileData } from "@/lib/profile";

type Tab = "profile" | "jobs" | "integrations";

interface JobSummary {
  jobId: string;
  title: string;
  company: string;
  isActive: boolean;
}

export default function ProfileClient({ initialData }: { initialData: ProfileData }) {
  return (
    <Suspense fallback={null}>
      <ProfileClientInner initialData={initialData} />
    </Suspense>
  );
}

function ProfileClientInner({ initialData }: { initialData: ProfileData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "profile";
  const [data, setData] = useState<ProfileData>(initialData);

  const setTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.push(`/profile?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-xl font-bold tracking-tight mb-6">Profile</h1>

      <div className="flex gap-1 mb-6 border-b border-edge">
        {(["profile", "jobs", "integrations"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors cursor-pointer
              ${tab === t ? "border-ink text-ink" : "border-transparent text-ink-secondary hover:text-ink"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileTab data={data} />}
      {tab === "jobs" && <JobsTab />}
      {tab === "integrations" && <IntegrationsTab data={data} setData={setData} />}
    </div>
  );
}

function ProfileTab({ data }: { data: ProfileData }) {
  const [name, setName] = useState(data.name || "");
  const [role, setRole] = useState(data.role || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role }),
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="space-y-5 max-w-sm">
      <div className="flex items-center gap-3">
        {data.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.image} alt="" className="w-16 h-16 rounded-full object-cover border border-edge" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-surface border border-edge" />
        )}
        <p className="text-xs text-ink-muted">Avatar is fetched from your connected account and can&apos;t be changed here.</p>
      </div>

      <Field label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-9 px-3 text-sm bg-surface border border-edge rounded-md focus:outline-none focus:border-edge-strong"
        />
      </Field>

      <Field label="Role">
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Software Engineer"
          className="w-full h-9 px-3 text-sm bg-surface border border-edge rounded-md placeholder:text-ink-muted focus:outline-none focus:border-edge-strong"
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          value={data.email}
          disabled
          className="w-full h-9 px-3 text-sm bg-surface border border-edge rounded-md text-ink-muted cursor-not-allowed"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-9 px-4 rounded-md text-sm font-medium bg-ink text-paper hover:bg-ink/90 disabled:opacity-40 transition-colors cursor-pointer"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-xs text-positive">Saved</span>}
      </div>
    </div>
  );
}

function JobsTab() {
  const [applied, setApplied] = useState<JobSummary[] | null>(null);
  const [ignored, setIgnored] = useState<JobSummary[] | null>(null);
  const [sub, setSub] = useState<"applied" | "ignored">("applied");

  useEffect(() => {
    fetch("/api/profile/jobs")
      .then((r) => r.json())
      .then((d: { applied: JobSummary[]; ignored: JobSummary[] }) => {
        setApplied(d.applied);
        setIgnored(d.ignored);
      });
  }, []);

  const list = sub === "applied" ? applied : ignored;

  return (
    <div>
      <div className="flex gap-1.5 mb-4">
        {(["applied", "ignored"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSub(s)}
            className={`h-7 px-3 text-xs font-mono rounded-md border transition-colors cursor-pointer capitalize
              ${sub === s ? "bg-ink text-paper border-ink" : "bg-surface border-edge text-ink-secondary hover:border-edge-strong"}`}
          >
            {s} {s === "applied" ? applied && `(${applied.length})` : ignored && `(${ignored.length})`}
          </button>
        ))}
      </div>

      {list === null && <p className="text-sm text-ink-muted">Loading...</p>}
      {list?.length === 0 && <p className="text-sm text-ink-muted">No {sub} jobs yet.</p>}

      <div className="divide-y divide-edge">
        {list?.map((job) => (
          <Link
            key={job.jobId}
            href={`/jobs/${job.jobId}`}
            className="flex items-center justify-between gap-3 py-3 hover:bg-surface -mx-2 px-2 rounded-md transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm text-ink truncate">{job.title}</p>
              <p className="text-xs text-ink-muted truncate">{job.company}</p>
            </div>
            {!job.isActive && (
              <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-ink-muted px-1.5 py-0.5 rounded bg-surface border border-edge">
                No longer available
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = { google: "Google", github: "GitHub" };

function IntegrationsTab({
  data,
  setData,
}: {
  data: ProfileData;
  setData: (d: ProfileData) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function disconnect(provider: string) {
    setBusy(provider);
    await fetch("/api/profile/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const refreshed = await fetch("/api/profile").then((r) => r.json());
    setData(refreshed);
    setBusy(null);
  }

  return (
    <div className="space-y-3 max-w-sm">
      <IntegrationRow
        label="Email"
        connected
        detail={data.email}
        disabled
      />
      {(["google", "github"] as const).map((provider) => {
        const connected = data.connectedProviders.includes(provider);
        return (
          <IntegrationRow
            key={provider}
            label={PROVIDER_LABELS[provider]}
            connected={connected}
            onConnect={() => signIn(provider, { callbackUrl: "/profile?tab=integrations" })}
            onDisconnect={() => disconnect(provider)}
            busy={busy === provider}
          />
        );
      })}
    </div>
  );
}

function IntegrationRow({
  label,
  connected,
  detail,
  disabled,
  busy,
  onConnect,
  onDisconnect,
}: {
  label: string;
  connected: boolean;
  detail?: string;
  disabled?: boolean;
  busy?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-edge">
      <div>
        <p className="text-sm text-ink">{label}</p>
        {connected && <p className="text-xs text-ink-muted">{detail || "Connected"}</p>}
      </div>
      {connected ? (
        <button
          type="button"
          onClick={onDisconnect}
          disabled={disabled || busy}
          className="h-7 px-3 text-xs rounded-md border border-edge text-ink-secondary hover:border-edge-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {disabled ? "Primary" : busy ? "..." : "Disconnect"}
        </button>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          className="h-7 px-3 text-xs rounded-md bg-ink text-paper hover:bg-ink/90 transition-colors cursor-pointer"
        >
          Connect
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-secondary mb-1.5 font-mono uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}
