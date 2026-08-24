import { db, normalizeCategory, mapCourseToCategory, CutoffRecord } from './database';
import { CollegeRecommendation } from '../types';
import { CollegeMetadataRecord } from '../KCETcutoffdata/types';

export interface QueryResult {
  recommendations: CollegeRecommendation[];
  queryTimeMs: number;
  totalRecordsScanned: number;
}

export async function findMatchingCollegesFast(
  rank: number,
  category: string,
  course: string,
  location: string
): Promise<QueryResult> {
  const startTime = performance.now();
  
  // Split category string by comma and normalize each
  const categories = category.split(',').map(c => normalizeCategory(c.trim())).filter(Boolean);
  const courseCategories = mapCourseToCategory(course);
  const normLocs = location.split(',').map(l => l.toLowerCase().trim()).filter(Boolean);
  
  // Build query based on filters
  let query = db.cutoffs.where('branchCategory').anyOf(courseCategories);
  
  // Location filter (if not "anywhere" or "karnataka")
  const isAnywhere = normLocs.length === 0 || normLocs.includes('karnataka') || normLocs.includes('anywhere');
  const filterByLocation = !isAnywhere;
  
  // Get matching cutoffs from database
  let cutoffs: CutoffRecord[];
  
  if (filterByLocation) {
    // Use compound index for location + category
    // Check if stored location matches or contains the search term
    cutoffs = await db.cutoffs
      .where('branchCategory')
      .anyOf(courseCategories)
      .and((record: CutoffRecord) => normLocs.some(loc => record.location === loc || record.location.includes(loc) || loc.includes(record.location)))
      .and((record: CutoffRecord) => categories.includes(record.category))
      .toArray();
  } else {
    // Just filter by course and category
    cutoffs = await db.cutoffs
      .where('branchCategory')
      .anyOf(courseCategories)
      .and((record: CutoffRecord) => categories.includes(record.category))
      .toArray();
  }
  
  // STRICT COURSE FILTERING: Ensure "AI" doesn't return all "CS" branches
  const searchCourses = course.split(',').map(c => c.toLowerCase().trim().replace(/[^a-z0-9]/g, '')).filter(Boolean);
  if (searchCourses.length > 0) {
    cutoffs = cutoffs.filter(record => {
      return searchCourses.some(search => {
        if (['cs', 'cse', 'computer', 'computerscience'].includes(search)) return record.branchNormalized === 'CS-PURE';
        if (['ai', 'aiml', 'artificialintelligence', 'machinelearning'].includes(search)) return record.branchNormalized === 'CS-AIML';
        if (['data', 'datascience'].includes(search)) return record.branchNormalized === 'CS-DATA';
        if (['cyber', 'cybersecurity'].includes(search)) return record.branchNormalized === 'CS-CYBER';
        if (['bs', 'business'].includes(search)) return record.branchNormalized === 'CS-BS';
        // For other branches, if they matched the branchCategory, we keep them
        return true; 
      });
    });
  }
  
  const totalRecordsScanned = cutoffs.length;
  
  // Group cutoffs by college+branch+category to get best cutoff per college-branch-category trio
  const collegeMap = new Map<string, {
    collegeName: string;
    branchName: string;
    branchNormalized: string;
    category: string;
    baseCourse: string;
    isPure: boolean;
    location: string;
    cutoffs2024: number[];
    cutoffs2025: number[];
  }>();
  
  cutoffs.forEach(record => {
    const key = `${record.collegeCode}|${record.branchNormalized}|${record.category}`;
    
    if (!collegeMap.has(key)) {
      let displayCourse = record.branchNormalized;
      if (displayCourse.endsWith('-PURE')) {
        displayCourse = displayCourse.split('-')[0]; // e.g. 'CS-PURE' -> 'CS'
      } else if (displayCourse.includes('-')) {
        displayCourse = displayCourse.split('-')[1]; // e.g. 'CS-AIML' -> 'AIML'
      }

      collegeMap.set(key, {
        collegeName: record.collegeName,
        branchName: record.branchName,
        branchNormalized: record.branchNormalized,
        category: record.category,
        baseCourse: displayCourse,
        isPure: record.isPure,
        location: record.location,
        cutoffs2024: [],
        cutoffs2025: []
      });
    }
    
    const entry = collegeMap.get(key)!;
    if (record.year === '2024') {
      entry.cutoffs2024.push(record.cutoffRank);
    } else if (record.year === '2025') {
      entry.cutoffs2025.push(record.cutoffRank);
    }
  });
  
  // Convert to recommendations
  const recommendations: CollegeRecommendation[] = [];
  
  collegeMap.forEach((data, key) => {
    // Calculate cutoff ranges
    const getCutoffRange = (cutoffs: number[]): { range: string; sortValue: number } => {
      if (cutoffs.length === 0) return { range: 'N/A', sortValue: 999999 };
      const min = Math.min(...cutoffs);
      const max = Math.max(...cutoffs);
      return {
        range: min === max ? `${min}` : `${min} - ${max}`,
        sortValue: min
      };
    };
    
    const cutoff2024 = getCutoffRange(data.cutoffs2024);
    const cutoff2025 = getCutoffRange(data.cutoffs2025);
    
    // Need at least one cutoff
    if (cutoff2024.sortValue === 999999 && cutoff2025.sortValue === 999999) return;
    
    // Calculate chance
    const refCutoff = cutoff2025.sortValue !== 999999 ? cutoff2025.sortValue : cutoff2024.sortValue;
    const diff = refCutoff - rank;
    let chance: 'Safe' | 'Moderate' | 'Reach' = 'Reach';
    if (diff >= 1000) {
      chance = 'Safe';
    } else if (diff >= -1000 && diff < 1000) {
      chance = 'Moderate';
    }
    
    // Derive location display
    const locationDisplay = data.location === 'bangalore' ? 'Bangalore' : 
                           data.location.charAt(0).toUpperCase() + data.location.slice(1);
    
    recommendations.push({
      collegeName: data.collegeName,
      branch: data.branchName,
      cutoff2025: cutoff2025.range,
      cutoff2024: cutoff2024.range,
      chance,
      location: locationDisplay,
      category: data.category,
      baseCourse: data.baseCourse,
      isPure: data.isPure,
      collegeCode: data.collegeName.match(/\((E\d+)\)/)?.[1] || undefined
    });
  });
  
  // Sort: Pure branches first, then by chance
  recommendations.sort((a, b) => {
    // Priority 1: Pure branches first
    const aIsPure = (a as any).isPure ? 1 : 0;
    const bIsPure = (b as any).isPure ? 1 : 0;
    if (aIsPure !== bIsPure) return bIsPure - aIsPure;
    
    // Priority 2: Higher chance first
    const chanceOrder = { 'Safe': 0, 'Moderate': 1, 'Reach': 2 };
    const chanceDiff = chanceOrder[a.chance] - chanceOrder[b.chance];
    if (chanceDiff !== 0) return chanceDiff;
    
    // Priority 3: Alphabetical by college name
    return a.collegeName.localeCompare(b.collegeName);
  });
  
  const endTime = performance.now();
  
  return {
    recommendations,
    queryTimeMs: Math.round((endTime - startTime) * 100) / 100,
    totalRecordsScanned
  };
}

/**
 * Get specific college cutoff using fast indexed query
 */
export async function getSpecificCollegeCutoffFast(
  collegeName: string,
  category: string,
  course: string
): Promise<any> {
  const startTime = performance.now();
  
  const normCat = normalizeCategory(category);
  const courseCategories = mapCourseToCategory(course);
  const searchName = collegeName.toLowerCase();
  
  // Find college by name (partial match)
  const cutoffs = await db.cutoffs
    .where('branchCategory')
    .anyOf(courseCategories)
    .and((record: CutoffRecord) => record.collegeName.toLowerCase().includes(searchName))
    .and((record: CutoffRecord) => record.category === normCat)
    .toArray();
  
  if (cutoffs.length === 0) {
    return { error: `No data found for ${collegeName} in ${course}` };
  }
  
  // Group by branch
  const branchMap = new Map<string, { branch: string; cutoffs2024: number[]; cutoffs2025: number[] }>();
  
  cutoffs.forEach(record => {
    if (!branchMap.has(record.branchName)) {
      branchMap.set(record.branchName, { branch: record.branchName, cutoffs2024: [], cutoffs2025: [] });
    }
    const entry = branchMap.get(record.branchName)!;
    if (record.year === '2024') entry.cutoffs2024.push(record.cutoffRank);
    if (record.year === '2025') entry.cutoffs2025.push(record.cutoffRank);
  });
  
  const results = Array.from(branchMap.values()).map(data => {
    const getRange = (arr: number[]) => {
      if (arr.length === 0) return 'N/A';
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      return min === max ? `${min}` : `${min} - ${max}`;
    };
    
    return {
      branch: data.branch,
      cutoff2025: getRange(data.cutoffs2025),
      cutoff2024: getRange(data.cutoffs2024)
    };
  });
  
  const endTime = performance.now();
  
  return {
    collegeName: cutoffs[0]?.collegeName || collegeName,
    category: normCat,
    data: results,
    queryTimeMs: Math.round((endTime - startTime) * 100) / 100
  };
}

/**
 * Get detailed metadata info about a specific college by name or code
 */
export async function getCollegeInfoFast(collegeIdentifier: string): Promise<any> {
  const startTime = performance.now();
  const query = collegeIdentifier.toLowerCase().trim();
  const cleanQuery = query.replace(/college|institute|university|of|technology|engineering|bengaluru|bangalore/gi, '').trim();
  
  const allMetadata = await db.collegeMetadata.toArray();

  let metadata: CollegeMetadataRecord | undefined;

  if (allMetadata.length > 0) {
    // 1. Try to find by code first (exact match)
    metadata = allMetadata.find(r => r.code.toUpperCase() === collegeIdentifier.toUpperCase());
      
    // 2. Try shortName exact or substring match
    if (!metadata) {
      metadata = allMetadata.find(r => {
        const sName = r.shortName.toLowerCase();
        return sName === query || sName.includes(query) || (cleanQuery.length >= 2 && sName.includes(cleanQuery));
      });
    }

    // 3. Try aliases match
    if (!metadata) {
      metadata = allMetadata.find(record => {
        try {
          const aliases: string[] = Array.isArray(record.aliases) 
            ? record.aliases 
            : JSON.parse(record.aliases as unknown as string) || [];
          return aliases.some(alias => {
            const aLower = alias.toLowerCase();
            return aLower.includes(query) || query.includes(aLower) || (cleanQuery.length >= 2 && aLower.includes(cleanQuery));
          });
        } catch(e) {
          return false;
        }
      });
    }

    // 4. Fallback: look up in colleges table first, then map by code
    if (!metadata) {
      const allColleges = await db.colleges.toArray();
      const match = allColleges.find(record => {
        const cName = record.name.toLowerCase();
        return cName.includes(query) || (cleanQuery.length >= 2 && cName.includes(cleanQuery));
      });
      if (match) {
        metadata = allMetadata.find(r => r.code === match.code);
      }
    }
  }

  // 5. Hard Fallback: If Dexie returned no metadata, fetch directly from static JSON loader
  if (!metadata) {
    try {
      const { loadCollegeMetadata } = await import('../KCETcutoffdata/metadataLoader');
      const staticData = await loadCollegeMetadata();
      if (staticData) {
        // Direct code match
        metadata = staticData[collegeIdentifier.toUpperCase()];
        if (!metadata) {
          // Search static data values
          const values = Object.values(staticData);
          metadata = values.find(r => {
            const sName = r.shortName.toLowerCase();
            if (sName === query || sName.includes(query) || (cleanQuery.length >= 2 && sName.includes(cleanQuery))) return true;
            const aliases = Array.isArray(r.aliases) ? r.aliases : [];
            return aliases.some(a => a.toLowerCase().includes(query) || (cleanQuery.length >= 2 && a.toLowerCase().includes(cleanQuery)));
          });
        }
      }
    } catch (e) {
      console.warn("Static metadata fallback failed:", e);
    }
  }
  
  const endTime = performance.now();
  
  if (!metadata) {
    return {
      error: `Could not find detailed information for '${collegeIdentifier}'.`
    };
  }
  
  return {
    ...metadata,
    queryTimeMs: Math.round((endTime - startTime) * 100) / 100
  };
}

