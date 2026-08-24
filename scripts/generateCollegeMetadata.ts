import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type, Schema } from '@google/genai';

// Initialize the SDK. It automatically picks up GEMINI_API_KEY from environment.
const ai = new GoogleGenAI({});

// Define the schema for the structured output
const CollegeMetadataSchema: Schema = {
  type: Type.ARRAY,
  description: "A list of detailed college metadata for the provided colleges",
  items: {
    type: Type.OBJECT,
    properties: {
      code: { type: Type.STRING, description: "The KCET code of the college (e.g. E005)" },
      shortName: { type: Type.STRING, description: "The commonly used short abbreviation of the college (e.g. RVCE, BMSCE)" },
      aliases: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Alternative names or abbreviations for the college" },
      placementLPA: { type: Type.STRING, description: "Overall summary of placements, including highest and average packages in LPA" },
      branchPlacements: { type: Type.STRING, description: "Detailed breakdown of placements by major branch (e.g. CSE Average LPA, CSE Highest LPA, ECE Average LPA, Placement %)" },
      topRecruiters: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of top visiting recruitment companies (e.g. Microsoft, Amazon, Cisco, Goldman Sachs, TCS, Infosys)" },
      studentReviews: { type: Type.STRING, description: "Summary of student sentiment, pros and cons, workload, and culture (2-3 sentences)" },
      branchIntake: { type: Type.STRING, description: "Student intake / annual seats per branch (e.g. CSE: 240 seats, ECE: 180 seats, ISE: 120 seats)" },
      teachingQuality: { type: Type.STRING, description: "Summary of teaching quality, faculty qualifications, and methodology (2-3 sentences)" },
      infrastructure: { type: Type.STRING, description: "Summary of infrastructure, labs, sports facilities, and hostels (2-3 sentences)" },
      campusLife: { type: Type.STRING, description: "Summary of campus life, environment, location, and clubs (2-3 sentences)" },
      fees: { type: Type.STRING, description: "Summary of approximate KCET and Management quota fees per year" },
      scholarships: { type: Type.STRING, description: "Information about any scholarships or financial aid available" },
      seatsTotal: { type: Type.STRING, description: "Approximate total seats or intake capacity of the college across all branches" },
      ranking: { type: Type.STRING, description: "Any known NIRF, NAAC, or local state rankings" }
    },
    required: [
      "code", "shortName", "aliases", "placementLPA", "branchPlacements", "topRecruiters", 
      "studentReviews", "branchIntake", "teachingQuality", "infrastructure", "campusLife", 
      "fees", "scholarships", "seatsTotal", "ranking"
    ]
  }
};

async function main() {
  const collegeDataPath = path.join(process.cwd(), 'public', 'collegeData.json');
  const metadataPath = path.join(process.cwd(), 'public', 'collegeMetadata.json');

  console.log('Reading collegeData.json...');
  const data = JSON.parse(fs.readFileSync(collegeDataPath, 'utf-8'));

  const codes = Object.keys(data.colleges).sort();
  console.log(`Found ${codes.length} colleges to process.`);

  // Load existing metadata if script was interrupted and restarted
  let existingMetadata: any = {};
  if (fs.existsSync(metadataPath)) {
    try {
      existingMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      console.log(`Loaded ${Object.keys(existingMetadata).length} existing metadata records.`);
    } catch (e) {
      console.log("Could not parse existing metadata, starting fresh.");
    }
  }

  // Filter out colleges that don't have the new branchPlacements field
  const pendingCodes = codes.filter(code => !existingMetadata[code] || !existingMetadata[code].branchPlacements);
  console.log(`Processing ${pendingCodes.length} remaining/unupdated colleges.`);

  // Process in batches of 10 to avoid token limits and stay under rate limits
  const BATCH_SIZE = 10;

  for (let i = 0; i < pendingCodes.length; i += BATCH_SIZE) {
    const batchCodes = pendingCodes.slice(i, i + BATCH_SIZE);

    // Prepare the list of colleges for the prompt
    const batchList = batchCodes.map(c => `- Code: ${c}, Name: ${data.colleges[c].name}`).join('\n');

    console.log(`\n--- Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(pendingCodes.length / BATCH_SIZE)} ---`);
    console.log(batchList);

    const prompt = `
You are an expert educational counselor in Karnataka. I will provide you with a list of Karnataka Engineering and Architecture colleges along with their KCET codes.
For EVERY single college in this list, you MUST generate accurate, highly detailed, and qualitative information based on your knowledge base.

CRITICAL INSTRUCTION FOR PLACEMENTS & BRANCH DATA:
- Include SPECIFIC numerical placement figures for major branches, especially CSE (Computer Science), ECE, ISE, and Mechanical. (e.g. "CSE: Avg 20 LPA, Highest 62 LPA, 98% placed; ECE: Avg 14 LPA, Highest 32 LPA, 92% placed").
- List 5-8 top recruiting companies that visit campus (e.g. ["Amazon", "Microsoft", "Cisco", "Atlassian", "Goldman Sachs"]).
- Include branch-wise annual student intake (e.g. "CSE: 240, ECE: 180, ISE: 120").
- Provide honest summary of student reviews, pros & cons, academic pressure, and campus vibe.

Colleges to process:
${batchList}
`;

    let success = false;
    let retries = 0;
    while (!success && retries < 10) {
      try {
        console.log('Calling Gemini API (gemini-3.6-flash)...');
        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: CollegeMetadataSchema,
            temperature: 0.1,
          }
        });

        const resultText = response.text;
        if (!resultText) throw new Error("Empty response from API");
        
        const parsedResults = JSON.parse(resultText);
        
        // Save results into our dictionary
        for (const item of parsedResults) {
          existingMetadata[item.code] = item;
        }
        
        // Save to file after every successful batch
        fs.writeFileSync(metadataPath, JSON.stringify(existingMetadata, null, 2));
        console.log(`Batch successful! Saved to ${metadataPath}.`);
        success = true;
        
        // Sleep for 5 seconds to respect rate limits
        if (i + BATCH_SIZE < pendingCodes.length) {
          console.log('Waiting 5 seconds before next batch...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

      } catch (error: any) {
        if (error?.status === 429 || String(error).includes('429')) {
          console.log('Rate limit hit (429). Waiting 60 seconds before retrying...');
          await new Promise(resolve => setTimeout(resolve, 60000));
          retries++;
        } else {
          console.error('Error processing batch:', error);
          console.log('Halting script so you can resume later without losing progress.');
          process.exit(1);
        }
      }
    }
    if (!success) {
      console.log('Failed after retries. Exiting.');
      process.exit(1);
    }
  }

  console.log('\n✅ All colleges processed successfully!');
}

main().catch(console.error);
