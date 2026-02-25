export type MovementStage =
  | "detected"
  | "verified"
  | "growing"
  | "trending"
  | "peaked"
  | "declining"
  | "dormant";

export type SignalSource =
  | "reddit"
  | "gdelt"
  | "bluesky"
  | "wikipedia"
  | "news"
  | "mastodon";

export type ScanTrigger = "manual" | "scheduled";
export type ScanStatus = "queued" | "running" | "complete" | "error";

export interface Movement {
  id: string;
  name: string;
  slug: string;
  description: string;
  geography: string;
  stage: MovementStage;
  keySlogans: string[];
  keyPhrases: string[];
  categories: string[];
  estimatedSize: string;
  momentumScore: number;
  sentiment: string;
  merchPotentialScore: number;
  analysisSummary: string;
  rawAnalysis: Record<string, unknown>;
  firstDetectedAt: string;
  lastSignalAt: string;
  peakMomentumScore: number;
  peakAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Signal {
  id: string;
  movementId: string | null;
  scanId: string | null;
  source: SignalSource;
  sourceId: string;
  title: string;
  content: string;
  url: string;
  metadata: Record<string, unknown>;
  relevanceScore: number | null;
  createdAt: string;
}

export interface Scan {
  id: string;
  triggerType: ScanTrigger;
  status: ScanStatus;
  currentPhase: string | null;
  rawFiles: Record<string, string>;
  signalsFound: number;
  movementsCreated: number;
  movementsUpdated: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface RawSignal {
  source: SignalSource;
  sourceId: string;
  title: string;
  content: string;
  url: string;
  metadata: Record<string, unknown>;
}

export interface MovementProfile {
  name: string;
  slug: string;
  description: string;
  geography: string;
  keySlogans: string[];
  keyPhrases: string[];
  categories: string[];
  estimatedSize: string;
  momentumScore: number;
  sentiment: string;
  merchPotentialScore: number;
  analysisSummary: string;
}

export interface SignalGroup {
  signals: RawSignal[];
  movementName: string;
  confidence: number;
  rejectionReason?: string;
}

export interface ClassificationResult {
  groups: SignalGroup[];
  rejected: { signal: RawSignal; reason: string }[];
}

export interface DeduplicationMatch {
  newProfileIndex: number;
  existingMovementId: string;
  confidence: number;
}
