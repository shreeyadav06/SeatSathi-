// PDF extractor script for KCET cutoff data
// Run with: node --input-type=module scripts/extractPdf.mjs

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// All KCET categories
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

async function extractPdfText(filePath) {
  const data = new Uint8Array(readFileSync(filePath));
  const doc = await getDocument({ data }).promise;
  
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    
    // Group items by Y position to reconstruct lines
    const items = content.items;
    const lines = new Map();
    
    items.forEach(item => {
      const y = Math.round(item.transform[5]); // Y coordinate
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push({ x: item.transform[4], text: item.str });
    });
    
    // Sort lines top to bottom (higher Y = higher on page)
    const sortedYs = [...lines.keys()].sort((a, b) => b - a);
    
    for (const y of sortedYs) {
      const lineItems = lines.get(y).sort((a, b) => a.x - b.x);
      const lineText = lineItems.map(i => i.text).join(' ');
      fullText += lineText + '\n';
    }
    
    fullText += '\n---PAGE_BREAK---\n';
  }
  
  return fullText;
}

function parseKCETCutoffText(text, year, round) {
  // Ensure every 'College: EXXX' header is separated onto its own line
  text = text.replace(/(.)(College\s*:\s*E\d{3})/gi, '$1\n$2');
  
  const entries = [];
  let currentCollegeCode = null;
  let currentCollegeName = null;
  let currentBranch = null;

  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === '---PAGE_BREAK---') continue;
    
    // Detect college header: "College: EXXX Name..."
    const collegeMatch = line.match(/College\s*:\s*(E\d{3})\s+(.+)/i);
    if (collegeMatch) {
      currentCollegeCode = collegeMatch[1];
      currentCollegeName = collegeMatch[2].replace(/\s+/g, ' ').trim();
      currentBranch = null;
      continue;
    }
    
    // Detect standalone E-code at start of line
    const eCodeMatch = line.match(/^(E\d{3})\s+(.+)/);
    if (eCodeMatch && !currentCollegeCode) {
      currentCollegeCode = eCodeMatch[1];
      currentCollegeName = eCodeMatch[2].replace(/\s+/g, ' ').trim();
      currentBranch = null;
      continue;
    }
    
    // Detect "Course Name" header - next significant text is the branch
    if (/Course\s*Name/i.test(line)) {
      // Branch name is usually on the same line or next line
      const branchInLine = line.replace(/Course\s*Name\s*/i, '').trim();
      if (branchInLine.length > 2) {
        currentBranch = branchInLine;
      }
      continue;
    }
    
    // Detect branch name lines (all caps, contains engineering keywords)
    if (currentCollegeCode && !currentBranch) {
      const isBranchLine = /^[A-Z\s&.\-()]+$/.test(line) && line.length > 5 &&
        (line.includes('ENGINEERING') || line.includes('SCIENCE') || line.includes('TECHNOLOGY') ||
         line.includes('COMPUTER') || line.includes('ELECTRONICS') || line.includes('MECHANICAL') ||
         line.includes('CIVIL') || line.includes('ELECTRICAL') || line.includes('ARTIFICIAL') ||
         line.includes('DATA') || line.includes('INFORMATION') || line.includes('ROBOTICS') ||
         line.includes('ARCHITECTURE') || line.includes('AEROSPACE') || line.includes('BIOTECH') ||
         line.includes('CHEMICAL'));
      
      if (isBranchLine) {
        currentBranch = line.replace(/\s+/g, ' ').trim();
        continue;
      }
    }
    
    if (!currentCollegeCode) continue;
    
    // Parse cutoff lines: look for category codes followed by numbers
    for (const cat of KCET_CATEGORIES) {
      const catRegex = new RegExp(`\\b${cat}\\b`);
      if (catRegex.test(line)) {
        // Extract all numbers that look like ranks (4-6 digits)
        const numbers = line.match(/\b(\d{3,6})\b/g);
        if (numbers) {
          for (const numStr of numbers) {
            const rank = parseInt(numStr);
            if (rank >= 100 && rank <= 250000) {
              entries.push({
                code: currentCollegeCode,
                name: currentCollegeName || currentCollegeCode,
                branch: currentBranch || 'Engineering',
                category: cat,
                cutoffRank: rank,
                year,
                round
              });
            }
          }
        }
      }
    }
  }
  
  // Deduplicate
  const seen = new Set();
  return entries.filter(e => {
    const key = `${e.code}|${e.branch}|${e.category}|${e.cutoffRank}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const pdfFiles = [
    { file: 'KCET 2025 r1 cutoff.pdf', year: '2025', round: 'R1' },
    { file: 'KCET 2025 r2 cutoff.pdf', year: '2025', round: 'R2' },
    { file: 'KCET 2025 r3 cutoff.pdf', year: '2025', round: 'R3' },
    { file: 'KCET 2024 r1 cutoff.pdf', year: '2024', round: 'R1' },
    { file: 'KCET 2024 r2 cutoff.pdf', year: '2024', round: 'R2' },
    { file: 'KCET 2024 r3 cutoff.pdf', year: '2024', round: 'R3' },
  ];
  
  const allEntries = [];
  
  for (const { file, year, round } of pdfFiles) {
    const filePath = join(ROOT, file);
    console.log(`\nProcessing: ${file}...`);
    
    try {
      const text = await extractPdfText(filePath);
      
      // Save raw text for debugging
      writeFileSync(join(ROOT, 'scripts', `${year}_${round}_raw.txt`), text);
      
      const entries = parseKCETCutoffText(text, year, round);
      console.log(`  Extracted ${entries.length} cutoff entries`);
      
      // Count unique colleges
      const colleges = new Set(entries.map(e => e.code));
      console.log(`  Unique colleges: ${colleges.size}`);
      console.log(`  Sample:`, entries.slice(0, 3));
      
      allEntries.push(...entries);
    } catch (err) {
      console.error(`  Error processing ${file}:`, err.message);
    }
  }
  
  console.log(`\n===== TOTAL: ${allEntries.length} entries from all PDFs =====`);
  
  // Save to JSON for inspection
  writeFileSync(
    join(ROOT, 'scripts', 'extracted_cutoffs.json'), 
    JSON.stringify(allEntries, null, 2)
  );
  console.log('Saved to scripts/extracted_cutoffs.json');
}

main().catch(console.error);
