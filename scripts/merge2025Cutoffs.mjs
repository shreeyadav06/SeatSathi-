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

function cleanCollegeName(name) {
  return name.replace(/\s+/g, ' ').replace(/Course\s*Name.*/i, '').trim();
}

function parse2025RawFile(filePath, round, collegesMap) {
  let text = fs.readFileSync(filePath, 'utf-8');
  
  // FIX 1: Insert newline before any 'College: EXXX' that is concatenated with preceding text
  text = text.replace(/(.)(College\s*:\s*E\d{3})/gi, '$1\n$2');
  // FIX 2: Insert newline before any standalone 'EXXX Name...' header
  text = text.replace(/(.)(E\d{3}\s+[A-Z])/g, '$1\n$2');

  const lines = text.split('\n');
  let currentCode = null;
  let currentName = null;
  let currentBranch = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === '---PAGE_BREAK---') continue;

    // Check college header
    const collegeMatch = line.match(/College\s*:\s*(E\d{3})\s+(.+)/i);
    if (collegeMatch) {
      currentCode = collegeMatch[1].toUpperCase();
      currentName = cleanCollegeName(collegeMatch[2]);
      currentBranch = null;

      if (!collegesMap[currentCode]) {
        collegesMap[currentCode] = {
          code: currentCode,
          name: currentName,
          branches: {}
        };
      }
      continue;
    }

    // Check standalone E-code
    const eCodeMatch = line.match(/^(E\d{3})\s+(.+)/);
    if (eCodeMatch && !currentCode) {
      currentCode = eCodeMatch[1].toUpperCase();
      currentName = cleanCollegeName(eCodeMatch[2]);
      currentBranch = null;
      if (!collegesMap[currentCode]) {
        collegesMap[currentCode] = {
          code: currentCode,
          name: currentName,
          branches: {}
        };
      }
      continue;
    }

    // Check Course Name
    if (/Course\s*Name/i.test(line)) {
      const branchInLine = line.replace(/Course\s*Name\s*/i, '').trim();
      if (branchInLine.length > 2) {
        currentBranch = branchInLine;
      } else {
        currentBranch = null;
      }
      continue;
    }

    // Check uppercase branch line
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

    // Parse category rank values
    for (const cat of KCET_CATEGORIES) {
      const catRegex = new RegExp(`\\b${cat}\\b`);
      if (catRegex.test(line)) {
        const numbers = line.match(/\b(\d{3,6})\b/g);
        if (numbers) {
          const branchKey = currentBranch || 'B TECH IN COMPUTER SCIENCE AND ENGINEERING';

          if (!collegesMap[currentCode].branches[branchKey]) {
            collegesMap[currentCode].branches[branchKey] = {};
          }
          if (!collegesMap[currentCode].branches[branchKey]['2025']) {
            collegesMap[currentCode].branches[branchKey]['2025'] = {};
          }
          if (!collegesMap[currentCode].branches[branchKey]['2025'][round]) {
            collegesMap[currentCode].branches[branchKey]['2025'][round] = {};
          }

          for (const numStr of numbers) {
            const rank = parseInt(numStr, 10);
            if (rank >= 100 && rank <= 250000) {
              collegesMap[currentCode].branches[branchKey]['2025'][round][cat] = rank;
            }
          }
        }
      }
    }
  }
}

function runMerge() {
  const jsonPath = path.join(ROOT, 'public', 'collegeData.json');
  console.log('Loading public/collegeData.json...');
  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const collegesMap = rawData.colleges || rawData;
  console.log(`Loaded ${Object.keys(collegesMap).length} colleges.`);

  const r2025Files = [
    { file: '2025_R1_raw.txt', round: 'R1' },
    { file: '2025_R2_raw.txt', round: 'R2' },
    { file: '2025_R3_raw.txt', round: 'R3' },
  ];

  for (const { file, round } of r2025Files) {
    const rawPath = path.join(ROOT, 'scripts', file);
    if (fs.existsSync(rawPath)) {
      console.log(`Merging ${file}...`);
      parse2025RawFile(rawPath, round, collegesMap);
    }
  }

  // Inspect E141 result
  console.log('\n=== E141 (PES Electronic City) After 2025 Merge ===');
  if (collegesMap['E141']) {
    console.log('College Code: E141');
    console.log('Name:', collegesMap['E141'].name);
    console.log('Branches count:', Object.keys(collegesMap['E141'].branches).length);
    for (const [bName, bData] of Object.entries(collegesMap['E141'].branches)) {
      console.log(` - Branch [${bName}]: Years = ${Object.keys(bData).join(', ')}`);
      if (bData['2025']) {
        console.log('    2025 Cutoffs:', JSON.stringify(bData['2025']));
      }
    }
  } else {
    console.log('E141 not found!');
  }

  if (rawData.colleges) {
    rawData.colleges = collegesMap;
    fs.writeFileSync(jsonPath, JSON.stringify(rawData, null, 2));
  } else {
    fs.writeFileSync(jsonPath, JSON.stringify(collegesMap, null, 2));
  }
  console.log(`\nSuccessfully updated ${jsonPath}!`);
}

runMerge();
