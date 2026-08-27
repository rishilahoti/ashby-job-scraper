export interface Job {
  id: number;
  jobId: string;
  company: string;
  source: string;
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
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  compensationInterval: string | null;
  contentHash: string;
  isActive: boolean;
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
  source: string;
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
  compensation_min: string | null; // NUMERIC column — pg returns as string
  compensation_max: string | null;
  compensation_currency: string | null;
  compensation_interval: string | null;
  content_hash: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
