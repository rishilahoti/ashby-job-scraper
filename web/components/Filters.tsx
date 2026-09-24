"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PROVIDERS } from "@/lib/providers";
import { parseLocationValues } from "@/lib/location-filter";

function ChecklistDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const selectedSet = new Set(selected);
  const searchTerm = search.trim().toLowerCase();
  const visibleOptions = options
    .filter(({ label: optionLabel }) =>
      !searchTerm || optionLabel.toLowerCase().includes(searchTerm)
    )
    .sort((a, b) => {
      const selectedOrder = Number(selectedSet.has(b.value)) - Number(selectedSet.has(a.value));
      return selectedOrder || a.label.localeCompare(b.label);
    });

  const buttonLabel =
    selected.length === 0
      ? label
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? label
        : `${label} (${selected.length})`;

  return (
    <div ref={ref} className="relative inline-flex h-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`max-w-32.5 px-2 text-sm bg-surface border rounded-md focus:outline-none
                    focus:border-edge-strong cursor-pointer flex items-center justify-between gap-1.5
          ${selected.length > 0 ? "border-edge-strong text-ink" : "border-edge text-ink-secondary hover:border-edge-strong"}`}
      >
        <span className="truncate">{buttonLabel}</span>
        <svg
          className="w-4 h-4 shrink-0 opacity-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={4}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-56 max-w-[calc(100vw-1rem)] rounded-md border border-edge
                     bg-paper shadow-xl overflow-hidden p-1"
        >
          <input
            type="search"
            placeholder={`Search ${label.toLowerCase()}...`}
            aria-label={`Search ${label.toLowerCase()}`}
            className="mb-1 h-8 w-full rounded border border-edge bg-surface px-2 text-sm
                       text-ink placeholder:text-ink-muted focus:outline-none focus:border-edge-strong"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <div className="max-h-64 overflow-y-auto overscroll-contain">
          {visibleOptions.map(({ value, label: optLabel }) => (
            <label
              key={value}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-ink-secondary
                         hover:bg-surface hover:text-ink cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(value)}
                onChange={() => toggle(value)}
                className="cursor-pointer"
              />
              <span className="min-w-0 truncate">{optLabel}</span>
            </label>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

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

  const currentLocations = parseLocationValues(searchParams.get("location"));

  const current = {
    search: searchParams.get("search") || "",
    company: searchParams.get("company") || "",
    source: (searchParams.get("source") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    remote: searchParams.get("remote") || "",
    employmentType: searchParams.get("employmentType") || "",
    department: searchParams.get("department") || "",
    locations: currentLocations,
    tags: (searchParams.get("tags") || "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    sort: searchParams.get("sort") || "score",
  };

  const hasAnyFilter =
    current.search ||
    current.company ||
    current.source.length > 0 ||
    current.remote ||
    current.employmentType ||
    current.department ||
    current.locations.length > 0 ||
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

  const setSources = useCallback(
    (sources: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (sources.length > 0) {
        params.set("source", sources.join(","));
      } else {
        params.delete("source");
      }
      params.delete("page");
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const setLocations = useCallback(
    (locations: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (locations.length > 0) {
        params.set("location", locations.join(","));
      } else {
        params.delete("location");
      }
      params.delete("page");
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

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

      {/* Source — checklist dropdown */}
      <ChecklistDropdown
        label="All providers"
        options={PROVIDERS}
        selected={current.source}
        onChange={setSources}
      />

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

      {/* Location — searchable checklist */}
      <ChecklistDropdown
        label="All locations"
        options={locations.map((location) => ({ value: location, label: location }))}
        selected={current.locations}
        onChange={setLocations}
      />

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
