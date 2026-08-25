const SOURCE_LABELS: Record<string, string> = {
  ashby: "Ashby",
  lever: "Lever",
  greenhouse: "Greenhouse",
};

export default function SourceTag({ source }: { source: string }) {
  return (
    <span className="text-xs text-ink-muted font-mono">
      {SOURCE_LABELS[source] || source}
    </span>
  );
}
