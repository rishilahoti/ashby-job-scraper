import { SOURCE_LABELS } from "@/lib/providers";

export default function SourceTag({ source }: { source: string }) {
  return (
    <span className="text-xs text-ink-muted font-mono">
      {SOURCE_LABELS[source] || source}
    </span>
  );
}
