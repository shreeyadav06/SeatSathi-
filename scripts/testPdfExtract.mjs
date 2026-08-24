import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

async function testE141() {
  const data = new Uint8Array(fs.readFileSync('KCET 2025 r1 cutoff.pdf'));
  const doc = await getDocument({ data }).promise;
  console.log('Total pages in 2025 R1 PDF:', doc.numPages);

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.map(item => item.str).join(' ');
    
    if (items.includes('E141') || items.includes('Electronic City Campus')) {
      console.log(`\n=== FOUND E141 ON PAGE ${i} ===`);
      console.log('Item count:', content.items.length);
      
      // Group items by Y coordinate
      const lineMap = new Map();
      content.items.forEach(item => {
        const y = Math.round(item.transform[5]);
        if (!lineMap.has(y)) lineMap.set(y, []);
        lineMap.get(y).push({ x: item.transform[4], str: item.str });
      });

      const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
      for (const y of sortedYs) {
        const row = lineMap.get(y).sort((a, b) => a.x - b.x).map(it => it.str).join(' | ');
        if (row.includes('E141') || row.includes('COMPUTER') || row.includes('8696') || row.includes('8414') || row.includes('8075')) {
          console.log(`Y=${y}: ${row}`);
        }
      }
    }
  }
}

testE141();
