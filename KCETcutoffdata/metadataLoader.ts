import { CollegeMetadataMap } from "./types";

let cachedMetadata: CollegeMetadataMap | null = null;
let loadingPromise: Promise<CollegeMetadataMap> | null = null;

export async function loadCollegeMetadata(): Promise<CollegeMetadataMap> {
  if (cachedMetadata) return cachedMetadata;
  if (loadingPromise) return loadingPromise;
  
  loadingPromise = (async () => {
    try {
      console.log("Fetching college metadata from static JSON...");
      const response = await fetch("/collegeMetadata.json");
      if (!response.ok) {
        throw new Error(`Failed to fetch college metadata: ${response.statusText}`);
      }
      const json = await response.json();
      cachedMetadata = json;
      console.log(`Successfully loaded metadata for ${Object.keys(cachedMetadata || {}).length} colleges.`);
      return cachedMetadata!;
    } catch (err) {
      console.error("Error loading college metadata:", err);
      return {};
    }
  })();
  
  return loadingPromise;
}

export function isCollegeMetadataLoaded(): boolean {
  return cachedMetadata !== null;
}

