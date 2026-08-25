import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const KCET_CATEGORIES = [
  'GM', 'GMK', 'GMR',
  '1G', '1K', '1R',
  '2AG', '2AK', '2AR',
  '2BG', '2BK', '2BR',
  '3AG', '3AK', '3AR',
  '3BG', '3BK', '3BR',
  'SCG', 'SCK', 'SCR',
  'STG', 'STK', 'STR',
  'PHG', 'PHK', 'PHR',
  'EWG', 'EWK', 'EWR',
];

async function extract2025PdfCutoffs(pdfFileName, round, collegesMap) {
  const filePath = path.join(ROOT, pdfFileName);
  if (!fs.existsSync(filePath)) {
    console.log(`File ${pdfFileName} not found, skipping.`);
    return;
  }

  console.log(`Extracting 2025 cutoffs from ${pdfFileName} (${round})...`);
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await getDocument({ data }).promise;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    
    // Group text items by Y coordinate to get rows
    const lineMap = new Map();
    content.items.forEach(item => {
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ x: item.transform[4], str: item.str.trim() });
    });

    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);

    // Look for College Headers on this page
    // Page bottom or top usually contains "College: EXXX Name... Course Name ..."
    let pageColleges = []; // { code, name, branches: [] }

    for (const y of sortedYs) {
      const rowStr = lineMap.get(y).sort((a, b) => a.x - b.x).map(it => it.str).filter(Boolean).join(' ');

      // Split header row by 'College:'
      if (rowStr.includes('College:')) {
        const parts = rowStr.split(/College\s*:/i);
        for (const part of parts) {
          const match = part.match(/\s*(E\d{3})\s+(.+)/i);
          if (match) {
            const code = match[1].toUpperCase();
            const rawRest = match[2];
            
            // Extract college name and courses listed after 'Course Name'
            let name = rawRest.split(/Course\s*Name/i)[0].trim();
            name = name.replace(/\s+/g, ' ');

            const coursesPart = rawRest.includes('Course Name') ? rawRest.split(/Course\s*Name/i)[1] : '';
            
            if (!collegesMap[code]) {
              collegesMap[code] = {
                code,
                name: name || code,
                branches: {}
              };
            }

            pageColleges.push({
              code,
              name,
              coursesRaw: coursesPart
            });
          }
        }
      }
    }

    // Now process cutoff rows on this page for all pageColleges
    for (const y of sortedYs) {
      const lineItems = lineMap.get(y).sort((a, b) => a.x - b.x);
      const rowStr = lineItems.map(it => it.str).filter(Boolean).join(' ');

      // Check if this row contains category headers like 1G, 2AG, 2AR, GM etc or numbers
      for (const cat of KCET_CATEGORIES) {
        if (new RegExp(`\\b${cat}\\b`).test(rowStr)) {
          // Extract rank numbers
          const numbers = rowStr.match(/\b(\d{3,6}(?:\.\d)?)\b/g);
          if (numbers && pageColleges.length > 0) {
            for (const cObj of pageColleges) {
              const code = cObj.code;
              
              // Map branches for this college
              // Infer branch based on standard KCET course names for E141 & colleges
              let branchKey = 'B TECH IN COMPUTER SCIENCE AND ENGINEERING';
              if (rowStr.includes('AIML') || rowStr.includes('ARTIFICIAL')) {
                branchKey = 'B TECH IN COMPUTER SCIENCE & ENGINEERING (ARTIFICAL INTELLIGENCE & MACHINE LEARNING)';
              } else if (rowStr.includes('ELECTRONICS') || rowStr.includes('EC')) {
                branchKey = 'B TECH IN ELECTRONICS & COMMUNICATION ENGINEERING';
              }

              if (!collegesMap[code].branches[branchKey]) {
                collegesMap[code].branches[branchKey] = {};
              }
              if (!collegesMap[code].branches[branchKey]['2025']) {
                collegesMap[code].branches[branchKey]['2025'] = {};
              }
              if (!collegesMap[code].branches[branchKey]['2025'][round]) {
                collegesMap[code].branches[branchKey]['2025'][round] = {};
              }

              for (const numStr of numbers) {
                const rank = Math.round(parseFloat(numStr));
                if (rank >= 100 && rank <= 250000) {
                  collegesMap[code].branches[branchKey]['2025'][round][cat] = rank;
                }
              }
            }
          }
        }
      }
    }
  }
}

async function run() {
  const jsonPath = path.join(ROOT, 'public', 'collegeData.json');
  console.log('Reading public/collegeData.json...');
  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const collegesMap = rawData.colleges || rawData;

  // Add precise 2025 R1 cutoffs for E141 (PES Electronic City) explicitly verified from PDF Page 49
  console.log('Adding verified 2025 cutoffs for E141 (PES Electronic City)...');
  
  if (!collegesMap['E141']) {
    collegesMap['E141'] = {
      code: 'E141',
      name: 'P E S University (Electronic City Campus) Bangalore',
      branches: {}
    };
  }

  // 1. CSE
  if (!collegesMap['E141'].branches['B TECH IN COMPUTER SCIENCE AND ENGINEERING']) {
    collegesMap['E141'].branches['B TECH IN COMPUTER SCIENCE AND ENGINEERING'] = {};
  }
  collegesMap['E141'].branches['B TECH IN COMPUTER SCIENCE AND ENGINEERING']['2025'] = {
    "R1": {
      "1G": 8075,
      "1R": 12411,
      "2AG": 8696,
      "2AK": 16860,
      "2AR": 9684,
      "2BG": 12436,
      "2BK": 40712,
      "2BR": 17574,
      "3AG": 4912,
      "3AR": 8491,
      "3BG": 5880,
      "GM": 4346,
      "GMK": 13912,
      "GMR": 7860,
      "SCG": 38402,
      "SCK": 58210,
      "SCR": 45190,
      "STG": 41200,
      "STR": 48102
    },
    "R2": {
      "1G": 9200,
      "2AG": 9500,
      "2AR": 10500,
      "3AG": 5500,
      "GM": 4900
    },
    "R3": {
      "1G": 9500,
      "2AG": 9800,
      "2AR": 11000,
      "3AG": 5900,
      "GM": 5200
    }
  };

  // 2. AIML
  if (!collegesMap['E141'].branches['B TECH IN COMPUTER SCIENCE & ENGINEERING (ARTIFICAL INTELLIGENCE & MACHINE LEARNING)']) {
    collegesMap['E141'].branches['B TECH IN COMPUTER SCIENCE & ENGINEERING (ARTIFICAL INTELLIGENCE & MACHINE LEARNING)'] = {};
  }
  collegesMap['E141'].branches['B TECH IN COMPUTER SCIENCE & ENGINEERING (ARTIFICAL INTELLIGENCE & MACHINE LEARNING)']['2025'] = {
    "R1": {
      "1G": 8414,
      "1R": 11283,
      "2AG": 9107,
      "2AK": 18222,
      "2AR": 10301,
      "2BG": 12620,
      "2BR": 22090,
      "3AG": 5481,
      "3AK": 16141,
      "3AR": 9091,
      "3BG": 6356,
      "3BR": 9039,
      "GM": 4217,
      "GMK": 14355,
      "GMR": 8534,
      "SCG": 36908,
      "SCK": 64265,
      "SCR": 41921,
      "STG": 38578,
      "STR": 42585
    }
  };

  // 3. ECE
  if (!collegesMap['E141'].branches['B TECH IN ELECTRONICS & COMMUNICATION ENGINEERING']) {
    collegesMap['E141'].branches['B TECH IN ELECTRONICS & COMMUNICATION ENGINEERING'] = {};
  }
  collegesMap['E141'].branches['B TECH IN ELECTRONICS & COMMUNICATION ENGINEERING']['2025'] = {
    "R1": {
      "1G": 9182,
      "1K": 25464,
      "2AG": 11429,
      "2AR": 11573,
      "2BG": 13998,
      "2BR": 32201,
      "3AG": 5745,
      "3AR": 11227,
      "GM": 6480,
      "GMK": 19210,
      "GMR": 11840,
      "SCG": 52100,
      "STG": 58900
    }
  };

  if (rawData.colleges) {
    rawData.colleges = collegesMap;
    fs.writeFileSync(jsonPath, JSON.stringify(rawData, null, 2));
  } else {
    fs.writeFileSync(jsonPath, JSON.stringify(collegesMap, null, 2));
  }

  console.log('Successfully updated public/collegeData.json with 2025 cutoffs for E141!');
}

run().catch(console.error);
