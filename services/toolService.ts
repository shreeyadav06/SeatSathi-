import { CollegeRecommendation, KcetData } from "../types";
import { findMatchingCollegesFast, getSpecificCollegeCutoffFast, getCollegeInfoFast } from "./dbQuery";
import { ensureDatabaseReady } from "./dbPopulate";
import { db } from "./database";
import { parsePdfCollegeData, searchPdfColleges, searchPdfByCollegeName, hasPdfData, getPdfCollegeCount } from "./pdfCollegeSearch";

let useDatabase = false;
let dbInitPromise: Promise<boolean> | null = null;
let cachedKCETData: KcetData | null = null;

async function getKCETData(): Promise<KcetData> {
  if (cachedKCETData) return cachedKCETData;
  const { loadKCETData } = await import('../KCETcutoffdata/collegeDataLazy');
  cachedKCETData = await loadKCETData() as KcetData;
  return cachedKCETData;
}

let currentPdfText: string = '';

export function setPdfTextForSearch(text: string): number {
  currentPdfText = text;
  const parsed = parsePdfCollegeData(text);
  console.log(`Parsed ${parsed.length} entries from PDF for search`);
  return parsed.length;
}

export async function initDatabase(): Promise<boolean> {
  if (dbInitPromise) return dbInitPromise;
  
  dbInitPromise = ensureDatabaseReady();
  useDatabase = await dbInitPromise;
  console.log(`Database mode: ${useDatabase ? 'ENABLED (fast)' : 'DISABLED (fallback)'}`);
  return useDatabase;
}

const normalizeLocation = (loc: string): string => loc.toLowerCase().trim();
const normalizeCategory = (cat: string): string => {
  const c = cat.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (c === 'gm' || c === 'generalmerit' || c === 'general' || c === 'gmk' || c === 'gmr') return c.toUpperCase();
  
  if (/^1ag$|^1a$|^1g$|^oneag$|^onea$|^oneg$|^category1$|^categoryone$|^1$/.test(c)) return '1G';
  if (/^1ar$|^1r$|^onear$|^oner$/.test(c)) return '1R';
  if (/^1ak$|^1k$|^oneak$|^onek$/.test(c)) return '1K';
  
  if (/^2ag$|^2a$|^twoag$|^twoa$/.test(c)) return '2AG';
  if (/^2ar$|^twoar$/.test(c)) return '2AR';
  if (/^2ak$|^twoak$/.test(c)) return '2AK';
  
  if (/^2bg$|^2b$|^twobg$|^twob$/.test(c)) return '2BG';
  if (/^2br$|^twobr$/.test(c)) return '2BR';
  if (/^2bk$|^twobk$/.test(c)) return '2BK';
  
  if (/^3ag$|^3a$|^threeag$|^threea$/.test(c)) return '3AG';
  if (/^3ar$|^threear$/.test(c)) return '3AR';
  if (/^3ak$|^threeak$/.test(c)) return '3AK';
  
  if (/^3bg$|^3b$|^threebg$|^threeb$/.test(c)) return '3BG';
  if (/^3br$|^threebr$/.test(c)) return '3BR';
  if (/^3bk$|^threebk$/.test(c)) return '3BK';
  
  if (/^sc$|^scg$/.test(c)) return 'SCG';
  if (/^scr$/.test(c)) return 'SCR';
  if (/^sck$/.test(c)) return 'SCK';
  
  if (/^st$|^stg$/.test(c)) return 'STG';
  if (/^str$/.test(c)) return 'STR';
  if (/^stk$/.test(c)) return 'STK';
  
  if (/^ews$|^ew$|^ewg$/.test(c)) return 'EWG';
  if (/^ewk$/.test(c)) return 'EWK';
  if (/^ewr$/.test(c)) return 'EWR';
  
  return cat.toUpperCase().trim();
};

// Remove special characters, spaces, dots for fuzzy matching
const normalizeForSearch = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

// Normalize branch names to standard codes for grouping same courses
const normalizeBranchName = (branchName: string): string => {
  const bLower = branchName.toLowerCase();
  
  // Pure CS variants - includes "B Tech in CS", "BTech in CS", patterns ending with " cs" etc.
  if ((bLower.includes('computer science') && bLower.includes('engineering')) ||
      (bLower.startsWith('cs ') && !bLower.includes('ai') && !bLower.includes('cyber') && !bLower.includes('data')) ||
      bLower === 'cs computers' || bLower === 'cse' ||
      (bLower.includes('computer') && !bLower.includes('ai') && !bLower.includes('cyber') && !bLower.includes('data') && !bLower.includes('business')) ||
      (bLower.includes('tech') && bLower.endsWith(' cs')) ||
      (bLower.includes('tech') && bLower.includes(' in cs'))) {
    return 'CS-PURE';
  }
  
  // CS with AI/ML
  if (bLower.includes('artificial') || bLower.includes('aiml') || bLower.includes('ai ml') || 
      bLower.includes('machine learning') || (bLower.includes('cs') && bLower.includes('ai'))) {
    return 'CS-AIML';
  }
  
  // CS with Data Science
  if (bLower.includes('data science') || bLower.includes('data engineering') || 
      (bLower.includes('cs') && bLower.includes('data'))) {
    return 'CS-DATA';
  }
  
  // CS Cyber Security
  if (bLower.includes('cyber') || bLower.includes('security')) {
    return 'CS-CYBER';
  }
  
  // CS Business Systems
  if (bLower.includes('business') || bLower.includes('bs')) {
    return 'CS-BS';
  }
  
  // Information Science
  if (bLower.includes('information science') || bLower.startsWith('is ') || bLower === 'ise') {
    return 'IS-PURE';
  }
  
  // Pure EC
  if ((bLower.includes('electronics') && bLower.includes('communication')) ||
      bLower.startsWith('ec ') || bLower === 'ece') {
    return 'EC-PURE';
  }
  
  // Pure ME
  if (bLower.includes('mechanical') || bLower.startsWith('me ')) {
    return 'ME-PURE';
  }
  
  // Civil
  if (bLower.includes('civil') || bLower.startsWith('cv ')) {
    return 'CV-PURE';
  }
  
  // Electrical
  if (bLower.includes('electrical') && !bLower.includes('electronics')) {
    return 'EE-PURE';
  }
  
  // Robotics
  if (bLower.includes('robotics') || bLower.includes('automation')) {
    return 'ROBOTICS';
  }
  
  return bLower; // Return normalized lowercase for other branches
};

// Check if branch is a "pure" version of the requested course
const isPureBranch = (branchName: string, courseInput: string): boolean => {
  const normalized = normalizeBranchName(branchName);
  const cLower = courseInput.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (['cs', 'cse', 'computer', 'computerscience'].includes(cLower)) {
    return normalized === 'CS-PURE';
  }
  if (['is', 'ise', 'it', 'information', 'informationscience'].includes(cLower)) {
    return normalized === 'IS-PURE';
  }
  if (['ec', 'ece', 'electronics'].includes(cLower)) {
    return normalized === 'EC-PURE';
  }
  if (['me', 'mech', 'mechanical'].includes(cLower)) {
    return normalized === 'ME-PURE';
  }
  if (['cv', 'civil', 'ce'].includes(cLower)) {
    return normalized === 'CV-PURE';
  }
  if (['ee', 'electrical'].includes(cLower)) {
    return normalized === 'EE-PURE';
  }
  if (['robotics', 'automation', 'ra'].includes(cLower)) {
    return normalized === 'ROBOTICS';
  }
  return true; // Default to true for unknown courses
};

// Helper to determine if a branch matches the user's course request
const isBranchMatch = (branchName: string, courseInput: string): boolean => {
  const bLower = branchName.toLowerCase();
  const cLower = courseInput.toLowerCase().replace(/[^a-z0-9]/g, '');

  // CS / Computer Science matchers
  if (['cs', 'cse', 'computer', 'computerscience'].includes(cLower)) {
    return (
      bLower.startsWith('cs ') || 
      bLower.includes('computer') || 
      bLower.includes('computing') || 
      bLower.includes('artificial') || 
      bLower.includes('data') || 
      bLower.includes('cyber') ||
      bLower.includes('information science') ||
      bLower.startsWith('is ') || 
      bLower.startsWith('it ') ||
      (bLower.includes('cs') && bLower.includes('tech')) ||
      bLower.endsWith(' cs') ||
      bLower.includes(' in cs')
    );
  }

  // IS / Information Science
  if (['is', 'ise', 'it', 'information', 'informationscience'].includes(cLower)) {
    return bLower.startsWith('is ') || bLower.startsWith('it ') || bLower.includes('information');
  }

  // EC / Electronics
  if (['ec', 'ece', 'electronics'].includes(cLower)) {
    return (
      bLower.startsWith('ec ') || 
      bLower.startsWith('ee ') || 
      bLower.includes('electronics') || 
      bLower.includes('communication') ||
      bLower.includes('telecommunication')
    );
  }

  // Mech - but NOT robotics on its own (robotics is separate course)
  if (['me', 'mech', 'mechanical'].includes(cLower)) {
    // Match mechanical but not robotics-specific courses
    return bLower.startsWith('me ') || bLower.includes('mechanical') || bLower.includes('automobile');
  }

  // Civil
  if (['cv', 'civil', 'ce'].includes(cLower)) {
    return bLower.startsWith('cv ') || bLower.startsWith('ce ') || bLower.includes('civil') || bLower.includes('construction');
  }

  // Robotics and Automation
  if (['robotics', 'automation', 'ra', 'robot'].includes(cLower)) {
    return bLower.includes('robotics') || bLower.includes('automation') || bLower.includes('robot');
  }

  // Default fuzzy match
  return bLower.includes(cLower) || bLower.includes(courseInput.toLowerCase());
};

// Helper to get range string (e.g., "12000 - 15400") from R1, R2, R3
const getCutoffRange = (branchData: any, year: string, category: string): { range: string, sortValue: number } => {
  if (!branchData || !branchData[year]) return { range: "N/A", sortValue: 999999 };
  
  const cutoffs: number[] = [];
  const rounds = ['R1', 'R2', 'R3'];
  
  rounds.forEach(r => {
    if (branchData[year][r] && branchData[year][r][category]) {
      cutoffs.push(branchData[year][r][category]);
    }
  });

  if (cutoffs.length === 0) return { range: "N/A", sortValue: 999999 };

  const min = Math.min(...cutoffs);
  const max = Math.max(...cutoffs);

  // Return best rank for sorting logic
  const sortValue = min; 

  if (min === max) return { range: `${min}`, sortValue };
  return { range: `${min} - ${max}`, sortValue };
};

/**
 * Find matching colleges - uses IndexedDB for fast queries when available
 * Falls back to in-memory iteration if database not ready
 * Also searches PDF data if available
 * Supports multiple courses and locations (comma-separated)
 */
export const findMatchingColleges = async (
  rank: number,
  category: string,
  course: string,
  location: string
): Promise<CollegeRecommendation[]> => {
  const startTime = performance.now();
  
  // Parse multiple courses, locations, and categories
  const categories = category.split(',').map(c => c.trim()).filter(c => c.length > 0);
  const courses = course.split(',').map(c => c.trim()).filter(c => c.length > 0);
  const locations = location.split(',').map(l => l.trim()).filter(l => l.length > 0);
  
  console.log(`Searching for categories: [${categories.join(', ')}], courses: [${courses.join(', ')}] in locations: [${locations.join(', ')}]`);
  
  // Collect results from all category/course/location combinations
  const allResults: CollegeRecommendation[] = [];
  const seenKeys = new Set<string>();
  
  for (const singleCategory of categories) {
    for (const singleCourse of courses) {
      for (const singleLocation of locations) {
        let results: CollegeRecommendation[] = [];
        
        // Try to use database for fast queries
        if (useDatabase) {
          try {
            const result = await findMatchingCollegesFast(rank, singleCategory, singleCourse, singleLocation);
            console.log(`[DB Query] Found ${result.recommendations.length} colleges for ${singleCategory}/${singleCourse}/${singleLocation} in ${result.queryTimeMs}ms`);
            results = result.recommendations;
          } catch (error) {
            console.warn('Database query failed, falling back to in-memory:', error);
            results = await findMatchingCollegesLegacy(rank, singleCategory, singleCourse, singleLocation);
          }
        } else {
          results = await findMatchingCollegesLegacy(rank, singleCategory, singleCourse, singleLocation);
        }
        
        // Also search PDF data if available
        if (hasPdfData()) {
          const pdfResults = searchPdfColleges(rank, singleCategory, singleCourse, singleLocation);
          console.log(`[PDF Search] Found ${pdfResults.length} additional colleges from uploaded PDF`);
          results = [...results, ...pdfResults];
        }
        
        // Add unique results, tagging with course and location
        for (const rec of results) {
          const uniqueKey = `${rec.collegeName}|${rec.branch}|${rec.cutoff2025}|${singleCategory}`;
          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            // Add course/location/category metadata for filtering
            allResults.push({
              ...rec,
              searchCourse: singleCourse,
              searchLocation: singleLocation,
              searchCategory: singleCategory
            } as CollegeRecommendation & { searchCourse: string; searchLocation: string; searchCategory: string; });
          }
        }
      }
    }
  }
  
  // Sort combined results
  const sorted = allResults.sort((a, b) => {
    const getMin = (rangeStr: string) => {
      if(rangeStr === "N/A") return 999999;
      const parts = rangeStr.split(' - ');
      return parseInt(parts[0]);
    };
    
    // Pure branches first
    const aIsPure = (a as any).isPure ? 1 : 0;
    const bIsPure = (b as any).isPure ? 1 : 0;
    if (aIsPure !== bIsPure) return bIsPure - aIsPure;
    
    // Higher chance first
    const chanceOrder: Record<string, number> = { 'Safe': 0, 'Moderate': 1, 'Reach': 2 };
    const chanceDiff = chanceOrder[a.chance] - chanceOrder[b.chance];
    if (chanceDiff !== 0) return chanceDiff;

    const valA = getMin(a.cutoff2025) !== 999999 ? getMin(a.cutoff2025) : getMin(a.cutoff2024);
    const valB = getMin(b.cutoff2025) !== 999999 ? getMin(b.cutoff2025) : getMin(b.cutoff2024);
    
    const diffA = valA - rank;
    const diffB = valB - rank;

    return Math.abs(diffA) - Math.abs(diffB);
  });
  
  console.log(`Total unique results: ${sorted.length} in ${(performance.now() - startTime).toFixed(2)}ms`);
  return sorted;
};

/**
 * Legacy in-memory search (fallback)
 */
const findMatchingCollegesLegacy = async (
  rank: number,
  category: string,
  course: string,
  location: string
): Promise<CollegeRecommendation[]> => {
  const normLoc = normalizeLocation(location);
  const normCat = normalizeCategory(category);
  
  const recommendations: CollegeRecommendation[] = [];
  const seenColleges = new Map<string, CollegeRecommendation>(); // Track unique college+branch combos
  const data = await getKCETData();

  Object.values(data.colleges || {}).forEach((college) => {
    if (!college || !college.name) return;

    // Location Filter
    if (normLoc && normLoc !== 'karnataka' && normLoc !== 'anywhere') {
        if (!college.name.toLowerCase().includes(normLoc)) return;
    }

    // Group branches by normalized name to merge same courses
    const branchGroups = new Map<string, { branchData: any, originalName: string }[]>();
    
    Object.entries(college.branches || {}).forEach(([branchName, branchData]) => {
        if (!isBranchMatch(branchName, course)) return;
        
        const normalizedBranch = normalizeBranchName(branchName);
        if (!branchGroups.has(normalizedBranch)) {
          branchGroups.set(normalizedBranch, []);
        }
        branchGroups.get(normalizedBranch)!.push({ branchData, originalName: branchName });
    });
    
    // Process each branch group - merge data from same-type branches
    branchGroups.forEach((branches, normalizedBranch) => {
        // Collect all cutoff data from all variants of this branch
        let best2025: { range: string, sortValue: number } = { range: "N/A", sortValue: 999999 };
        let best2024: { range: string, sortValue: number } = { range: "N/A", sortValue: 999999 };
        let displayBranchName = branches[0].originalName;
        
        branches.forEach(({ branchData, originalName }) => {
            const data2025 = getCutoffRange(branchData, '2025', normCat);
            const data2024 = getCutoffRange(branchData, '2024', normCat);
            
            // Take the best (lowest rank) cutoff for each year
            if (data2025.sortValue < best2025.sortValue) {
              best2025 = data2025;
              if (data2025.sortValue !== 999999) displayBranchName = originalName;
            }
            if (data2024.sortValue < best2024.sortValue) {
              best2024 = data2024;
              if (best2025.sortValue === 999999 && data2024.sortValue !== 999999) {
                displayBranchName = originalName;
              }
            }
        });

        // We need at least one cutoff to recommend
        if (best2025.sortValue === 999999 && best2024.sortValue === 999999) return;

        const refCutoff = best2025.sortValue !== 999999 ? best2025.sortValue : best2024.sortValue;
        
        // Updated chance calculation based on new logic
        // refCutoff is the college's cutoff rank (lower is better/harder)
        // rank is the user's rank
        const diff = refCutoff - rank; // positive means college cutoff > user rank (easier to get)
        let chance: 'Safe' | 'Moderate' | 'Reach' = 'Reach';
  
        // Safe: if college cutoff is 1000+ higher than user's rank (user has better rank than needed)
        // Example: user rank 15000, college cutoff 16000+ -> Safe chance
        if (diff >= 1000) {
          chance = 'Safe';
        }
        // Moderate: if college cutoff is within 1000 above to 1000 below user's rank
        // Example: user rank 10000, college cutoff 9000-11000 -> Moderate chance
        else if (diff >= -1000 && diff < 1000) {
          chance = 'Moderate';
        }
        // Reach: if college cutoff is more than 1000 lower than user's rank
        // Example: user rank 10000, college cutoff < 9000 -> Reach chance (college is too competitive)
        else {
          chance = 'Reach';
        }
        
        // Check if this is a pure branch
        const isPure = isPureBranch(displayBranchName, course);

        // Create unique key for deduplication
        const uniqueKey = `${college.name}|${normalizedBranch}`;
        
        if (!seenColleges.has(uniqueKey)) {
          const rec: CollegeRecommendation = {
              collegeName: college.name,
              branch: displayBranchName,
              cutoff2025: best2025.range,
              cutoff2024: best2024.range,
              chance,
              location: college.name.includes("Bangalore") ? "Bangalore" : "Karnataka",
              isPure // Add flag for sorting
          };
          seenColleges.set(uniqueKey, rec);
          recommendations.push(rec);
        }
    });
  });

  // Sort: Pure branches first, then by chance (High > Medium > Low), then by closeness to rank
  return recommendations.sort((a, b) => {
     // Helper to parse min value from string "1000 - 2000" or "1000"
     const getMin = (rangeStr: string) => {
        if(rangeStr === "N/A") return 999999;
        const parts = rangeStr.split(' - ');
        return parseInt(parts[0]);
     };
     
     // Priority 1: Pure branches first
     const aIsPure = (a as any).isPure ? 1 : 0;
     const bIsPure = (b as any).isPure ? 1 : 0;
     if (aIsPure !== bIsPure) return bIsPure - aIsPure; // Pure first
     
     // Priority 2: Higher chance first
     const chanceOrder = { 'Safe': 0, 'Moderate': 1, 'Reach': 2 };
     const chanceDiff = chanceOrder[a.chance] - chanceOrder[b.chance];
     if (chanceDiff !== 0) return chanceDiff;

     const valA = getMin(a.cutoff2025) !== 999999 ? getMin(a.cutoff2025) : getMin(a.cutoff2024);
     const valB = getMin(b.cutoff2025) !== 999999 ? getMin(b.cutoff2025) : getMin(b.cutoff2024);
     
     const diffA = valA - rank;
     const diffB = valB - rank;

     return Math.abs(diffA) - Math.abs(diffB);
  });
};

/**
 * Get specific college cutoff - uses IndexedDB for fast queries when available
 */
export const getSpecificCollegeCutoff = async (collegeName: string, category: string, course: string): Promise<any> => {
    // Try database first
    if (useDatabase) {
      try {
        const result = await getSpecificCollegeCutoffFast(collegeName, category, course);
        if (!result.error) {
          console.log(`[DB Query] College cutoff found in ${result.queryTimeMs}ms`);
          return result;
        }
      } catch (error) {
        console.warn('Database query failed, falling back to in-memory:', error);
      }
    }
    
    // Fallback to in-memory
    return await getSpecificCollegeCutoffLegacy(collegeName, category, course);
};

/**
 * Legacy in-memory college cutoff lookup (fallback)
 */
const getSpecificCollegeCutoffLegacy = async (collegeName: string, category: string, course: string): Promise<any> => {
    const searchName = normalizeForSearch(collegeName);
    const normCat = normalizeCategory(category);
    
    const data = await getKCETData();
    const college = Object.values(data.colleges).find(c => normalizeForSearch(c.name).includes(searchName));
    
    if (!college) return { error: `College '${collegeName}' not found.` };

    const matchingBranches = Object.entries(college.branches).filter(([bName]) => 
        isBranchMatch(bName, course)
    );

    if (matchingBranches.length === 0) return { error: `No data for ${course} in ${college.name}` };

    const results = matchingBranches.map(([bName, bData]) => {
        return {
            branch: bName,
            cutoff2025: getCutoffRange(bData, '2025', normCat).range,
            cutoff2024: getCutoffRange(bData, '2024', normCat).range
        };
    });

    return {
        collegeName: college.name,
        category: normCat,
        data: results
    };
}

/**
 * Get qualitative information about a college (placements, teaching, infrastructure)
 */
export const getCollegeInfo = async (collegeName: string): Promise<any> => {
    if (useDatabase) {
      try {
        const result = await getCollegeInfoFast(collegeName);
        if (!result.error) {
          console.log(`[DB Query] College info found in ${result.queryTimeMs}ms`);
          return result;
        }
      } catch (error) {
        console.warn('Database query failed for college info:', error);
      }
    }
    
    return { error: `Could not fetch detailed information for ${collegeName}. Data might not be loaded yet.` };
};

export const toolsDeclaration: any[] = [
  {
    functionDeclarations: [
      {
        name: "extract_pdf_data",
        description: "Checks if a PDF is loaded.",
        parameters: {
          type: "OBJECT",
          properties: {
            fileName: { type: "STRING", description: "The name of the file." }
          },
          required: ["fileName"]
        }
      },
      {
        name: "find_matching_colleges",
        description: "ONLY call this tool when user EXPLICITLY asks for college recommendations/list. Finds colleges based on rank, category, course and location. ONLY provide parameters that the user has explicitly stated. If a user hasn't mentioned a new rank/category/etc, DO NOT provide it in the arguments (leave it undefined) and the system will use their previously established values.",
        parameters: {
          type: "OBJECT",
          properties: {
            rank: { type: "NUMBER", description: "Student's KCET rank - ONLY use when user provides a specific rank" },
            category: { type: "STRING", description: "Student's category (e.g., GM, 2AG, 3BG)" },
            course: { type: "STRING", description: "Preferred branch codes or names, comma-separated for multiple (e.g. 'CS' or 'CS,ME,AIML' for multiple courses)" },
            location: { type: "STRING", description: "Preferred locations, comma-separated for multiple (e.g., 'Bangalore' or 'Bangalore,Mysore')" }
          }
        }
      },
      {
        name: "get_specific_college_cutoff",
        description: "Gets cutoff information for a SPECIFIC college. Use this when user asks about a particular college like 'tell me about RV College', 'what is the cutoff for BMS', 'can I get into PES with my rank'. This does NOT update the college list UI.",
        parameters: {
          type: "OBJECT",
          properties: {
            collegeName: { type: "STRING", description: "Name of the college (e.g., 'RV College', 'BMS', 'PES University')" },
            category: { type: "STRING", description: "Student category" },
            course: { type: "STRING", description: "Course branch" }
          },
          required: ["collegeName", "category", "course"]
        }
      },
      {
        name: "get_college_info",
        description: "Gets detailed qualitative information about a specific college (e.g., placements, teaching, infrastructure, campus life, fees, ranking). Use this when the user asks for details about a college, reviews, or specific parameters like 'how are placements at BMS' or 'tell me about RVCE infrastructure'.",
        parameters: {
          type: "OBJECT",
          properties: {
            collegeName: { type: "STRING", description: "Name or KCET code of the college (e.g., 'RVCE', 'BMS College', 'E005')" }
          },
          required: ["collegeName"]
        }
      }
    ]
  }
];
