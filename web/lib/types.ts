export interface Topic {
  slug: string;
  title: string;
  characters: Character[];
  iterations: Iteration[];
  synthesis: Synthesis | null;
  deliverables: Deliverable[];
  verification: VerificationReport[];
  referenceLibrary: string | null;
  parsedReferenceLibrary: ReferenceLibrary | null;
  researchFiles: ResearchFile[];
  followUps: FollowUp[];
}

export interface Character {
  number: number;
  name: string;
  tag: string;
  biography: string;
  framework: string;
  frameworkName: string;
  specificPositions: string[];
  blindSpot: string;
  heroes: string[];
  rhetoricalTendencies: string;
  relationships: string[];
  fullProfile: string;
}

export interface Iteration {
  number: number;
  structure: string;
  synthesis: Synthesis | null;
  transcriptRaw: string | null;
  rounds: DebateRound[];
}

export interface Synthesis {
  raw: string;
  title: string;
  convergence: ConvergencePoint[];
  divergence: DivergencePoint[];
  emergentIdeas: string[];
  knowledgeGaps: string[];
  recommendations: string[];
  unexpectedAlliances: string[];
  sections: SynthesisSection[];
}

export interface SynthesisSection {
  heading: string;
  level: number;
  content: string;
}

export interface ConvergencePoint {
  claim: string;
  confidence: "high" | "medium" | "low" | "medium-high" | "unknown";
  evidence: string;
}

export interface DivergencePoint {
  issue: string;
  content: string;
}

export interface DebateRound {
  title: string;
  exchanges: DebateExchange[];
  assemblyReactions: DebateExchange[];
  socrate: DebateExchange[];
}

export interface DebateExchange {
  speaker: string;
  content: string;
}

export interface Deliverable {
  slug: string;
  title: string;
  content: string;
}

export interface VerificationReport {
  type: string;
  title: string;
  content: string;
}

export interface ResearchFile {
  slug: string;
  title: string;
  content: string;
}

export interface FollowUp {
  timestamp: string;
  question: string;
  context: string;
  mode: string;
  responses: FollowUpResponse[];
  raw: string;
}

export interface FollowUpResponse {
  speaker: string;
  content: string;
}

export interface ReferenceLibrary {
  sections: ReferenceSection[];
  crossReadings: CrossReading[];
}

export interface ReferenceSection {
  title: string;
  subsections: ReferenceSubsection[];
}

export interface ReferenceSubsection {
  title: string;
  character: string | null;
  tag: string | null;
  entries: ReferenceEntry[];
}

export interface ReferenceEntry {
  author: string;
  work: string;
  year: string | null;
  description: string;
}

export interface CrossReading {
  character: string;
  assignment: string;
}
