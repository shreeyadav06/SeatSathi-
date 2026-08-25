import Dexie, { Table } from 'dexie';
import { CollegeMetadataRecord } from '../KCETcutoffdata/types';

export interface CollegeRecord {
  id?: number;
  code: string;
  name: string;
  location: string;
  locationKeywords: string[];
}

export interface BranchRecord {
  id?: number;
  collegeCode: string;
  collegeName: string;
  branchName: string;
  branchNormalized: string;
  branchCategory: string;
  isPure: boolean;
  location: string;
}

export interface CutoffRecord {
  id?: number;
  collegeCode: string;
  collegeName: string;
  branchName: string;
  branchNormalized: string;
  branchCategory: string;
  isPure: boolean;
  location: string;
  year: string;
  round: string;
  category: string;
  cutoffRank: number;
}

class SeatSathiDB extends Dexie {
  colleges!: Table<CollegeRecord>;
  branches!: Table<BranchRecord>;
  cutoffs!: Table<CutoffRecord>;
  collegeMetadata!: Table<CollegeMetadataRecord>;

  constructor() {
    super('SeatSathiDB');
    
    this.version(3).stores({
      colleges: '++id, code, name, location, *locationKeywords',
      branches: '++id, collegeCode, branchNormalized, branchCategory, isPure, location, [branchCategory+location], [branchCategory+isPure]',
      cutoffs: '++id, collegeCode, branchNormalized, branchCategory, isPure, location, year, round, category, cutoffRank, [branchCategory+location+category], [branchCategory+category+year], [location+branchCategory+category]',
      collegeMetadata: '++id, code, shortName'
    });

    this.version(2).stores({
      colleges: '++id, code, name, location, *locationKeywords',
      branches: '++id, collegeCode, branchNormalized, branchCategory, isPure, location, [branchCategory+location], [branchCategory+isPure]',
      cutoffs: '++id, collegeCode, branchNormalized, branchCategory, isPure, location, year, round, category, cutoffRank, [branchCategory+location+category], [branchCategory+category+year], [location+branchCategory+category]'
    }).upgrade(async () => {
      await this.colleges.clear();
      await this.branches.clear();
      await this.cutoffs.clear();
    });
    
    this.version(1).stores({
      colleges: '++id, code, name, location, *locationKeywords',
      branches: '++id, collegeCode, branchNormalized, branchCategory, isPure, location, [branchCategory+location], [branchCategory+isPure]',
      cutoffs: '++id, collegeCode, branchNormalized, branchCategory, isPure, location, year, round, category, cutoffRank, [branchCategory+location+category], [branchCategory+category+year], [location+branchCategory+category]'
    });
  }
}

export const db = new SeatSathiDB();

export function extractLocation(collegeName: string): string {
  const name = collegeName.toLowerCase();
  
  if (name.includes('bangalore') || name.includes('bengaluru')) return 'bangalore';
  if (name.includes('mysore') || name.includes('mysuru')) return 'mysore';
  if (name.includes('mangalore') || name.includes('mangaluru')) return 'mangalore';
  if (name.includes('hubli') || name.includes('dharwad')) return 'hubli';
  if (name.includes('belgaum') || name.includes('belagavi')) return 'belgaum';
  if (name.includes('gulbarga') || name.includes('kalaburagi')) return 'gulbarga';
  if (name.includes('davangere') || name.includes('davanagere')) return 'davangere';
  if (name.includes('shimoga') || name.includes('shivamogga')) return 'shimoga';
  if (name.includes('tumkur') || name.includes('tumakuru')) return 'tumkur';
  if (name.includes('hassan')) return 'hassan';
  if (name.includes('mandya')) return 'mandya';
  if (name.includes('raichur')) return 'raichur';
  if (name.includes('bellary') || name.includes('ballari')) return 'bellary';
  if (name.includes('chitradurga')) return 'chitradurga';
  if (name.includes('bidar')) return 'bidar';
  if (name.includes('kolar')) return 'kolar';
  if (name.includes('chikmagalur') || name.includes('chikkamagaluru')) return 'chikmagalur';
  if (name.includes('udupi')) return 'udupi';
  
  return 'karnataka';
}

export function getLocationKeywords(collegeName: string): string[] {
  const keywords: string[] = [];
  const name = collegeName.toLowerCase();
  
  keywords.push(extractLocation(collegeName));
  
  if (name.includes('bangalore') || name.includes('bengaluru')) {
    keywords.push('bangalore', 'bengaluru', 'blr');
  }
  if (name.includes('mysore') || name.includes('mysuru')) {
    keywords.push('mysore', 'mysuru');
  }
  
  return [...new Set(keywords)];
}

export function normalizeBranchName(branchName: string): { normalized: string; category: string; isPure: boolean } {
  const bLower = branchName.toLowerCase();
  
  // CS variants - includes "B Tech in CS", "BTech in CS", patterns ending with " cs" etc.
  if ((bLower.includes('computer science') && bLower.includes('engineering')) ||
      (bLower.startsWith('cs ') && !bLower.includes('ai') && !bLower.includes('cyber') && !bLower.includes('data')) ||
      bLower === 'cs computers' || bLower === 'cse' ||
      (bLower.includes('computer') && !bLower.includes('ai') && !bLower.includes('cyber') && !bLower.includes('data') && !bLower.includes('business')) ||
      (bLower.includes('tech') && bLower.endsWith(' cs')) ||
      (bLower.includes('tech') && bLower.includes(' in cs'))) {
    return { normalized: 'CS-PURE', category: 'CS', isPure: true };
  }
  
  // CS-AIML
  if (bLower.includes('artificial') || bLower.includes('aiml') || bLower.includes('ai ml') || 
      bLower.includes('machine learning') || (bLower.includes('cs') && bLower.includes('ai'))) {
    return { normalized: 'CS-AIML', category: 'CS', isPure: false };
  }
  
  // CS-DATA
  if (bLower.includes('data science') || bLower.includes('data engineering') || 
      (bLower.includes('cs') && bLower.includes('data'))) {
    return { normalized: 'CS-DATA', category: 'CS', isPure: false };
  }
  
  // CS-CYBER
  if (bLower.includes('cyber') || bLower.includes('security')) {
    return { normalized: 'CS-CYBER', category: 'CS', isPure: false };
  }
  
  // CS-BS
  if (bLower.includes('business') || bLower.includes('bs')) {
    return { normalized: 'CS-BS', category: 'CS', isPure: false };
  }
  
  // Information Science
  if (bLower.includes('information science') || bLower.startsWith('is ') || bLower === 'ise' || bLower.includes('information tech')) {
    return { normalized: 'IS-PURE', category: 'IS', isPure: true };
  }
  
  // EC
  if ((bLower.includes('electronics') && bLower.includes('communication')) ||
      bLower.startsWith('ec ') || bLower === 'ece') {
    return { normalized: 'EC-PURE', category: 'EC', isPure: true };
  }
  
  // EE (Electrical)
  if ((bLower.includes('electrical') && !bLower.includes('electronics')) || bLower.startsWith('ee ')) {
    return { normalized: 'EE-PURE', category: 'EE', isPure: true };
  }
  
  // EI (Electronics & Instrumentation)
  if (bLower.includes('instrumentation') || bLower.startsWith('ei ')) {
    return { normalized: 'EI-PURE', category: 'EI', isPure: true };
  }
  
  // ME
  if (bLower.includes('mechanical') || bLower.startsWith('me ')) {
    return { normalized: 'ME-PURE', category: 'ME', isPure: true };
  }
  
  // Civil
  if (bLower.includes('civil') || bLower.startsWith('cv ') || bLower.startsWith('ce ')) {
    return { normalized: 'CV-PURE', category: 'CV', isPure: true };
  }
  
  // Robotics
  if (bLower.includes('robotics') || bLower.includes('automation')) {
    return { normalized: 'ROBOTICS', category: 'ROBOTICS', isPure: true };
  }
  
  // Chemical
  if (bLower.includes('chemical') || bLower.startsWith('ch ')) {
    return { normalized: 'CH-PURE', category: 'CH', isPure: true };
  }
  
  // Biotechnology
  if (bLower.includes('biotech') || bLower.startsWith('bt ')) {
    return { normalized: 'BT-PURE', category: 'BT', isPure: true };
  }
  
  // Aerospace
  if (bLower.includes('aerospace') || bLower.includes('aeronautical')) {
    return { normalized: 'AE-PURE', category: 'AE', isPure: true };
  }
  
  // Architecture
  if (bLower.includes('architecture') || bLower.startsWith('ar ')) {
    return { normalized: 'AR-PURE', category: 'AR', isPure: true };
  }
  
  // Mining
  if (bLower.includes('mining')) {
    return { normalized: 'MINING', category: 'MINING', isPure: true };
  }
  
  // Textile
  if (bLower.includes('textile')) {
    return { normalized: 'TEXTILE', category: 'TEXTILE', isPure: true };
  }
  
  // Default - use sanitized name
  const sanitized = bLower.replace(/[^a-z0-9]/g, '').substring(0, 20);
  return { normalized: sanitized.toUpperCase(), category: sanitized.toUpperCase(), isPure: true };
}

/**
 * Normalize category code
 */
export function normalizeCategory(cat: string): string {
  const c = cat.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (c === 'gm' || c === 'generalmerit' || c === 'general' || c === 'gmk' || c === 'gmr') return c.toUpperCase();
  
  // Category 1 variants
  if (/^1ag$|^1a$|^1g$|^oneag$|^onea$|^oneg$|^category1$|^categoryone$|^1$/.test(c)) return '1G';
  if (/^1ar$|^1r$|^onear$|^oner$/.test(c)) return '1R';
  if (/^1ak$|^1k$|^oneak$|^onek$/.test(c)) return '1K';
  
  // Category 2A variants
  if (/^2ag$|^2a$|^twoag$|^twoa$/.test(c)) return '2AG';
  if (/^2ar$|^twoar$/.test(c)) return '2AR';
  if (/^2ak$|^twoak$/.test(c)) return '2AK';
  
  // Category 2B variants
  if (/^2bg$|^2b$|^twobg$|^twob$/.test(c)) return '2BG';
  if (/^2br$|^twobr$/.test(c)) return '2BR';
  if (/^2bk$|^twobk$/.test(c)) return '2BK';
  
  // Category 3A variants
  if (/^3ag$|^3a$|^threeag$|^threea$/.test(c)) return '3AG';
  if (/^3ar$|^threear$/.test(c)) return '3AR';
  if (/^3ak$|^threeak$/.test(c)) return '3AK';
  
  // Category 3B variants
  if (/^3bg$|^3b$|^threebg$|^threeb$/.test(c)) return '3BG';
  if (/^3br$|^threebr$/.test(c)) return '3BR';
  if (/^3bk$|^threebk$/.test(c)) return '3BK';
  
  // SC/ST variants
  if (/^sc$|^scg$/.test(c)) return 'SCG';
  if (/^scr$/.test(c)) return 'SCR';
  if (/^sck$/.test(c)) return 'SCK';
  
  if (/^st$|^stg$/.test(c)) return 'STG';
  if (/^str$/.test(c)) return 'STR';
  if (/^stk$/.test(c)) return 'STK';
  
  // EWS variants
  if (/^ews$|^ew$|^ewg$/.test(c)) return 'EWG';
  if (/^ewk$/.test(c)) return 'EWK';
  if (/^ewr$/.test(c)) return 'EWR';
  
  // Fallback to returning uppercase original if no match
  return cat.toUpperCase().trim();
}

/**
 * Map user course input to branch category
 */
export function mapCourseToCategory(courseInput: string): string[] {
  const courses = courseInput.split(',').map(c => c.trim()).filter(Boolean);
  
  const mapSingleCourse = (courseStr: string): string[] => {
    const cLower = courseStr.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Return array of matching categories (for broader search)
    if (['cs', 'cse', 'computer', 'computerscience', 'ai', 'aiml', 'artificialintelligence', 'machinelearning', 'data', 'datascience', 'cyber', 'cybersecurity'].includes(cLower)) {
      return ['CS']; // Will match CS-PURE, CS-AIML, CS-DATA, etc.
    }
    if (['is', 'ise', 'it', 'information', 'informationscience'].includes(cLower)) {
      return ['IS'];
    }
    if (['ec', 'ece', 'electronics'].includes(cLower)) {
      return ['EC'];
    }
    if (['ee', 'electrical'].includes(cLower)) {
      return ['EE'];
    }
    if (['me', 'mech', 'mechanical'].includes(cLower)) {
      return ['ME'];
    }
    if (['cv', 'civil', 'ce'].includes(cLower)) {
      return ['CV'];
    }
    if (['robotics', 'automation', 'ra', 'robot'].includes(cLower)) {
      return ['ROBOTICS'];
    }
    if (['bt', 'biotech', 'biotechnology'].includes(cLower)) {
      return ['BT'];
    }
    if (['ch', 'chemical'].includes(cLower)) {
      return ['CH'];
    }
    if (['ae', 'aerospace', 'aeronautical'].includes(cLower)) {
      return ['AE'];
    }
    if (['ar', 'architecture'].includes(cLower)) {
      return ['AR'];
    }
    
    return [cLower.toUpperCase()];
  };

  const allCategories = courses.flatMap(c => mapSingleCourse(c));
  return [...new Set(allCategories)];
}

export async function isDatabasePopulated(): Promise<boolean> {
  const count = await db.cutoffs.count();
  return count > 0;
}

export async function getDatabaseStats(): Promise<{ colleges: number; branches: number; cutoffs: number }> {
  return {
    colleges: await db.colleges.count(),
    branches: await db.branches.count(),
    cutoffs: await db.cutoffs.count()
  };
}

export async function clearDatabase(): Promise<void> {
  await db.colleges.clear();
  await db.branches.clear();
  await db.cutoffs.clear();
  await db.collegeMetadata.clear();
}
