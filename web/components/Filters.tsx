"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export default function Filters({
  companies,
  departments,
  locations,
  tagOptions,
}: {
  companies: string[];
  departments: string[];
  locations: string[];
  tagOptions: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const current = {
    search: searchParams.get("search") || "",
    company: searchParams.get("company") || "",
    remote: searchParams.get("remote") || "",
    employmentType: searchParams.get("employmentType") || "",
    department: searchParams.get("department") || "",
    location: searchParams.get("location") || "",
    tags: (searchParams.get("tags") || "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    sort: searchParams.get("sort") || "score",
  };

  const hasAnyFilter =
    current.search ||
    current.company ||
    current.remote ||
    current.employmentType ||
    current.department ||
    current.location ||
    current.tags.length > 0 ||
    current.sort !== "score";

  const setTags = useCallback(
    (tags: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tags.length > 0) {
        params.set("tags", tags.join(","));
      } else {
        params.delete("tags");
      }
      params.delete("page");
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const setTagFromDropdown = (tag: string) => {
    if (!tag) setTags([]);
    else setTags([tag.toLowerCase()]);
  };

  return (
    <div
      className="flex flex-wrap justify-start items-start gap-2 pt-4 border-b border-edge"
      style={{ paddingBottom: "15px" }}
    >
      {/* Search */}
      <input
        type="text"
        placeholder="Search titles, companies..."
        defaultValue={current.search}
        onKeyDown={(e) => {
          if (e.key === "Enter") setParam("search", e.currentTarget.value);
        }}
        className="h-8 px-3 text-sm bg-surface border border-edge rounded-md placeholder:text-ink-muted focus:outline-none focus:border-edge-strong focus:ring-1 focus:ring-edge-strong w-56 font-body"
      />

      {/* Company */}
      <select
        value={current.company}
        onChange={(e) => setParam("company", e.target.value)}
        className="h-8 max-w-32.5 px-2 text-sm bg-surface border border-edge rounded-md text-ink-secondary focus:outline-none focus:border-edge-strong cursor-pointer"
      >
        <option value="">All companies</option>
        {companies.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {/* Department */}
      <select
        value={current.department}
        onChange={(e) => setParam("department", e.target.value)}
        className="h-8 max-w-32.5 px-2 text-sm bg-surface border border-edge rounded-md text-ink-secondary focus:outline-none focus:border-edge-strong cursor-pointer"
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {/* Location */}
      <select
        value={current.location}
        onChange={(e) => setParam("location", e.target.value)}
        className="h-8 max-w-32.5 px-2 text-sm bg-surface border border-edge rounded-md
                   text-ink-secondary focus:outline-none focus:border-edge-strong cursor-pointer"
      >
        <option value="">All locations</option>
        {locations.map((loc) => (
          <option key={loc} value={loc}>{loc}</option>
        ))}
      </select>

      {/* Tags dropdown — single selection */}
      <select
        value={current.tags[0]?.toLowerCase() ?? ""}
        onChange={(e) => setTagFromDropdown(e.target.value)}
        className="h-8 max-w-32.5 px-2 text-sm bg-surface border border-edge rounded-md text-ink-secondary focus:outline-none focus:border-edge-strong cursor-pointer"
      >
        <option value="">All tags</option>
        {tagOptions.map((tag) => (
          <option key={tag} value={tag.toLowerCase()}>{tag}</option>
        ))}
      </select>

      {/* Remote Toggle */}
      <button
        onClick={() => setParam("remote", current.remote === "true" ? "" : "true")}
        className={`h-8 max-w-32.5 px-3 text-xs font-mono rounded-md border transition-colors cursor-pointer
          ${current.remote === "true"
            ? "bg-ink text-paper border-ink"
            : "bg-surface border-edge text-ink-secondary hover:border-edge-strong"
          }`}
      >
        REMOTE
      </button>

      {/* Employment Type */}
      <select
        value={current.employmentType}
        onChange={(e) => setParam("employmentType", e.target.value)}
        className="h-8 max-w-32.5 px-2 text-sm bg-surface border border-edge rounded-md
                   text-ink-secondary focus:outline-none focus:border-edge-strong cursor-pointer"
      >
        <option value="">All types</option>
        <option value="FullTime">Full Time</option>
        <option value="Intern">Intern</option>
        <option value="Contract">Contract</option>
        <option value="PartTime">Part Time</option>
      </select>

      {/* Sort: only Score, Newest, Oldest */}
      <select
        value={current.sort}
        onChange={(e) => setParam("sort", e.target.value)}
        className="h-8 max-w-32.5 px-2 text-sm bg-surface border border-edge rounded-md
                   text-ink-secondary focus:outline-none focus:border-edge-strong cursor-pointer"
      >
        <option value="score">Score</option>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>

      {/* Clear */}
      {hasAnyFilter && (
        <button
          onClick={() => router.push("?")}
          className="h-8 px-3 text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
