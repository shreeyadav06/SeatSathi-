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

function cleanName(name) {
  return name.replace(/\s+/g, ' ').replace(/Course\s*Name.*/i, '').trim();
}

function parseRawCutoffs(filePath, year, round, collegesMap) {
  let text = fs.readFileSync(filePath, 'utf-8');
  
  // CRITICAL FIX: Separate merged College: EXXX headers onto separate lines
  text = text.replace(/(.)(College\s*:\s*E\d{3})/gi, '$1\n$2');
  
  const lines = text.split('\n');
  let currentCode = null;
  let currentName = null;
  let currentBranch = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === '---PAGE_BREAK---') continue;

    // Detect college header: "College: EXXX Name..."
    const collegeMatch = line.match(/College\s*:\s*(E\d{3})\s+(.+)/i);
    if (collegeMatch) {
      currentCode = collegeMatch[1].toUpperCase();
      currentName = cleanName(collegeMatch[2]);
      currentBranch = null;
      
      if (!collegesMap[currentCode]) {
        collegesMap[currentCode] = {
          code: currentCode,
          name: currentName,
          branches: {}
        };
      } else if (currentName.length > collegesMap[currentCode].name.length) {
        collegesMap[currentCode].name = currentName;
      }
      continue;
    }

    // Detect "Course Name" header
    if (/Course\s*Name/i.test(line)) {
      const branchInLine = line.replace(/Course\s*Name\s*/i, '').trim();
      if (branchInLine.length > 2) {
        currentBranch = branchInLine;
      }
      continue;
    }

    // Detect Branch lines (uppercase engineering strings)
    if (currentCode && !currentBranch) {
      const isBranch = /^[A-Z\s&.\-()]+$/.test(line) && line.length > 3 &&
        (line.includes('ENGINEERING') || line.includes('SCIENCE') || line.includes('TECHNOLOGY') ||
         line.includes('COMPUTER') || line.includes('ELECTRONICS') || line.includes('MECHANICAL') ||
         line.includes('CIVIL') || line.includes('ELECTRICAL') || line.includes('ARTIFICIAL') ||
         line.includes('DATA') || line.includes('INFORMATION') || line.includes('ROBOTICS') ||
         line.includes('ARCHITECTURE') || line.includes('AEROSPACE') || line.includes('BIOTECH') ||
         line.includes('CHEMICAL') || line.includes('B TECH') || line.includes('BE '));
      if (isBranch) {
        currentBranch = line.replace(/\s+/g, ' ').trim();
        continue;
      }
    }

    if (!currentCode) continue;

    // Parse category numbers on this line
    for (const cat of KCET_CATEGORIES) {
      const catRegex = new RegExp(`\\b${cat}\\b`);
      if (catRegex.test(line)) {
        const numbers = line.match(/\b(\d{3,6})\b/g);
        if (numbers) {
          const branchKey = currentBranch || 'Engineering';
          
          if (!collegesMap[currentCode].branches[branchKey]) {
            collegesMap[currentCode].branches[branchKey] = {};
          }
          if (!collegesMap[currentCode].branches[branchKey][year]) {
            collegesMap[currentCode].branches[branchKey][year] = {};
          }
          if (!collegesMap[currentCode].branches[branchKey][year][round]) {
            collegesMap[currentCode].branches[branchKey][year][round] = {};
          }

          for (const numStr of numbers) {
            const rank = parseInt(numStr, 10);
            if (rank >= 100 && rank <= 250000) {
              // Store cutoff rank under category
              collegesMap[currentCode].branches[branchKey][year][round][cat] = rank;
            }
          }
        }
      }
    }
  }
}

function rebuild() {
  console.log('Rebuilding collegeData.json from raw text files strictly by KCET Code...');
  
  const existingPath = path.join(ROOT, 'public', 'collegeData.json');
  let collegesMap = {};
  if (fs.existsSync(existingPath)) {
    collegesMap = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
    console.log(`Loaded ${Object.keys(collegesMap).length} existing colleges from collegeData.json.`);
  }

  const rawFiles = [
    { file: '2025_R1_raw.txt', year: '2025', round: 'R1' },
    { file: '2025_R2_raw.txt', year: '2025', round: 'R2' },
    { file: '2025_R3_raw.txt', year: '2025', round: 'R3' },
    { file: '2024_R1_raw.txt', year: '2024', round: 'R1' },
    { file: '2024_R2_raw.txt', year: '2024', round: 'R2' },
    { file: '2024_R3_raw.txt', year: '2024', round: 'R3' },
  ];

  for (const { file, year, round } of rawFiles) {
    const rawPath = path.join(ROOT, 'scripts', file);
    if (fs.existsSync(rawPath)) {
      console.log(`Parsing ${file}...`);
      parseRawCutoffs(rawPath, year, round, collegesMap);
    }
  }

  console.log(`Finished parsing. Total colleges: ${Object.keys(collegesMap).length}`);

  // Inspect E141
  if (collegesMap['E141']) {
    console.log('\n--- E141 (PES Electronic City) Rebuilt Output ---');
    console.log('Name:', collegesMap['E141'].name);
    console.log('Branches:', Object.keys(collegesMap['E141'].branches));
    for (const [bName, bData] of Object.entries(collegesMap['E141'].branches)) {
      console.log(`  Branch [${bName}]: Years = ${Object.keys(bData).join(', ')}`);
    }
  } else {
    console.log('E141 not found in collegesMap!');
  }

  // Write back to public/collegeData.json
  fs.writeFileSync(existingPath, JSON.stringify(collegesMap, null, 2));
  console.log(`Updated ${existingPath} successfully!`);
}

rebuild();
