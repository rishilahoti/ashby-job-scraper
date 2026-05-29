export interface Job {
  id: number;
  jobId: string;
  company: string;
  title: string;
  location: string;
  team: string | null;
  department: string | null;
  employmentType: string | null;
  remote: boolean;
  description: string;
  applyUrl: string;
  jobUrl: string;
  publishedAt: string;
  scrapedAt: string;
  compensationSummary: string | null;
  contentHash: string;
  isActive: boolean;
  status: "new" | "applied" | "ignored";
  createdAt: string;
  updatedAt: string;
}

export interface JobWithScore extends Job {
  score: number;
  matchedKeywords: string[];
}

export interface JobFilters {
  search?: string;
  company?: string;
  remote?: boolean;
  minScore?: number;
  employmentType?: string;
  department?: string;
  team?: string;
  location?: string;
  tags?: string[];
  sort?: "score" | "newest" | "oldest";
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export type JobRow = {
  id: number;
  job_id: string;
  company: string;
  title: string;
  location: string;
  team: string | null;
  department: string | null;
  employment_type: string | null;
  remote: boolean;
  description: string;
  apply_url: string;
  job_url: string;
  published_at: string;
  scraped_at: string;
  compensation_summary: string | null;
  content_hash: string;
  is_active: boolean;
  status: string | null;
  created_at: string;
  updated_at: string;
};
