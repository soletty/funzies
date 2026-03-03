import type { CloDocument } from "../types";
import { mapDocument } from "./document-mapper";
import { extractAllSectionTexts } from "./text-extractor";
import { extractAllSections } from "./section-extractor";
import { normalizePpmSectionResults } from "./normalizer";

export async function runSectionPpmExtraction(
  apiKey: string,
  documents: CloDocument[],
): Promise<{ extractedConstraints: Record<string, unknown>; rawOutputs: Record<string, string> }> {
  const pdfDoc = documents.find((d) => d.type === "application/pdf");
  if (!pdfDoc) throw new Error("No PDF document found");

  // Phase 1: Map document structure
  const documentMap = await mapDocument(apiKey, documents);

  // Phase 2: Transcribe sections to markdown (parallel)
  const sectionTexts = await extractAllSectionTexts(apiKey, pdfDoc, documentMap);

  // Phase 3: Extract structured data per section (parallel)
  const sectionResults = await extractAllSections(apiKey, sectionTexts, documentMap.documentType);

  // Build sections map and raw outputs
  const sections: Record<string, Record<string, unknown> | null> = {};
  const rawOutputs: Record<string, string> = {};

  for (let i = 0; i < sectionResults.length; i++) {
    const result = sectionResults[i];
    sections[result.sectionType] = result.data;
    rawOutputs[result.sectionType] = sectionTexts[i]?.markdown ?? "";
  }

  // Merge into extractedConstraints format
  const extractedConstraints = normalizePpmSectionResults(sections);

  extractedConstraints._extractionPasses = sectionResults.length;
  extractedConstraints._sectionBasedExtraction = true;

  return { extractedConstraints, rawOutputs };
}
