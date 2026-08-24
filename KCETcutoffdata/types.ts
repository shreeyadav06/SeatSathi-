
export interface CollegeRecommendation {
  collegeName: string;
  branch: string;
  cutoff2025: string; // Changed to string to support ranges (e.g., "12000 - 15000")
  cutoff2024: string; // Changed to string
  chance: 'High' | 'Medium' | 'Low';
  location: string;
}

export type VisualizerState = 'idle' | 'listening' | 'speaking' | 'processing';

export interface LogMessage {
  type: 'user' | 'agent' | 'system';
  text: string;
  timestamp: Date;
}

// KCET Data Types

export interface Cutoffs {
  [category: string]: number;
}

export interface RoundData {
  R1?: Cutoffs;
  R2?: Cutoffs;
  R3?: Cutoffs;
}

export interface YearData {
  [year: string]: RoundData;
}

export interface Branch {
  [branchName: string]: YearData;
}

export interface College {
  code: string;
  name: string;
  branches: Branch;
  location?: string; // Optional to satisfy legacy College interface if needed
  courses?: any[];   // Optional legacy
}

export interface Colleges {
  [code: string]: College;
}

export interface Metadata {
  extracted_at: string;
  total_entries: number;
  years: number[];
  rounds: number[];
  categories: string[];
  files_processed: {
    file: string;
    year: number;
    round: number;
    count: number;
    format: string;
  }[];
}

export interface KCETData {
  metadata: Metadata;
  colleges: Colleges;
}

// Alias for backward compatibility if needed by existing code
export type KcetData = KCETData;
export type CollegeNode = College;
export type BranchNode = YearData;

export const KCET_CATEGORIES = [
  '1G', '1K', '1R', '2AG', '2AK', '2AR', '2BG', '2BK', '2BR',
  '3AG', '3AK', '3AR', '3BG', '3BK', '3BR', 'GM', 'GMK', 'GMP', 'GMR',
  'NRI', 'OPN', 'OTH', 'SCG', 'SCK', 'SCR', 'STG', 'STK', 'STR'
] as const;

export type CategoryCode = typeof KCET_CATEGORIES[number];

export interface CollegeMetadataRecord {
  id?: number;
  code: string;
  shortName: string;
  aliases: string[];
  placementLPA: string;
  teachingQuality: string;
  infrastructure: string;
  campusLife: string;
  fees: string;
  scholarships: string;
  seatsTotal: string;
  ranking: string;
}

export interface CollegeMetadataMap {
  [code: string]: CollegeMetadataRecord;
}

