export interface CloDocument {
  name: string;
  type: string;
  size: number;
  base64: string;
}

export interface ExtractedConstraints {
  eligibleCollateral?: string;
  concentrationLimits?: Record<string, string>;
  coverageTests?: Record<string, string>;
  warfLimit?: number;
  wasMinimum?: number;
  walMaximum?: number;
  diversityScoreMinimum?: number;
  reinvestmentPeriod?: { start?: string; end?: string };
  nonCallPeriod?: { end?: string };
  waterfallSummary?: string;
  ratingThresholds?: string;
  otherConstraints?: string[];
  additionalProvisions?: string;
}

export interface PortfolioHolding {
  issuer: string;
  notional: number;
  rating: string;
  spread: number;
  sector: string;
  maturity: string;
  loanType: string;
}

export interface ComplianceTest {
  name: string;
  actual: number;
  trigger: number;
  passing: boolean;
  cushion: number;
}

export interface PortfolioMetric {
  name: string;
  current: number;
  limit: number;
  direction: "max" | "min";
  passing: boolean;
}

export interface ConcentrationBreakdown {
  category: string;
  percentage: number;
  limit?: number;
}

export interface ExtractedPortfolio {
  holdings: PortfolioHolding[];
  testResults: ComplianceTest[];
  metrics: PortfolioMetric[];
  cccBucket: { current: number; limit: number; holdings: string[] };
  concentrations: {
    bySector: ConcentrationBreakdown[];
    byRating: ConcentrationBreakdown[];
    topExposures: ConcentrationBreakdown[];
  };
  reportDate?: string;
}

export interface CloProfile {
  id: string;
  userId: string;
  fundStrategy: string;
  targetSectors: string;
  riskAppetite: "conservative" | "moderate" | "aggressive";
  portfolioSize: string;
  reinvestmentPeriod: string;
  concentrationLimits: string;
  covenantPreferences: string;
  ratingThresholds: string;
  spreadTargets: string;
  regulatoryConstraints: string;
  portfolioDescription: string;
  beliefsAndBiases: string;
  rawQuestionnaire: Record<string, unknown>;
  documents: CloDocument[];
  extractedConstraints: ExtractedConstraints;
  extractedPortfolio: ExtractedPortfolio | null;
  createdAt: string;
  updatedAt: string;
}

export interface PanelMember {
  number: number;
  name: string;
  role: string;
  background: string;
  investmentPhilosophy: string;
  specializations: string[];
  decisionStyle: string;
  riskPersonality: string;
  notablePositions: string[];
  blindSpots: string[];
  fullProfile: string;
  avatarUrl: string;
}

export interface Panel {
  id: string;
  profileId: string;
  status: "queued" | "generating" | "active" | "error";
  members: PanelMember[];
  avatarMappings: Record<string, string>;
  rawFiles: Record<string, string>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanAnalysis {
  id: string;
  panelId: string;
  analysisType: "buy" | "switch";
  title: string;
  borrowerName: string;
  sector: string;
  loanType: string;
  spreadCoupon: string;
  rating: string;
  maturity: string;
  facilitySize: string;
  leverage: string;
  interestCoverage: string;
  covenantsSummary: string;
  ebitda: string;
  revenue: string;
  companyDescription: string;
  notes: string;
  switchBorrowerName?: string;
  switchSector?: string;
  switchLoanType?: string;
  switchSpreadCoupon?: string;
  switchRating?: string;
  switchMaturity?: string;
  switchFacilitySize?: string;
  switchLeverage?: string;
  switchInterestCoverage?: string;
  switchCovenantsSummary?: string;
  switchEbitda?: string;
  switchRevenue?: string;
  switchCompanyDescription?: string;
  switchNotes?: string;
  status: "queued" | "running" | "complete" | "error";
  currentPhase: string;
  rawFiles: Record<string, string>;
  parsedData: ParsedAnalysis;
  dynamicSpecialists: PanelMember[];
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ParsedAnalysis {
  memo?: CreditMemo;
  riskAssessment?: CreditRiskAssessment;
  recommendation?: CreditRecommendation;
  debate?: CloDebateRound[];
  individualAssessments?: IndividualCreditAssessment[];
  premortem?: string;
}

export interface CreditMemo {
  title: string;
  sections: { heading: string; content: string }[];
  raw: string;
}

export interface CreditRiskAssessment {
  overallRisk: "low" | "moderate" | "high" | "very-high";
  categories: { name: string; level: string; analysis: string }[];
  mitigants: string[];
  raw: string;
}

export type CreditVerdict = "strong_buy" | "buy" | "hold" | "pass" | "strong_pass";

export interface CreditVoteRecord {
  memberName: string;
  vote: CreditVerdict;
  conviction: string;
  rationale: string;
}

export interface CreditRecommendation {
  verdict: CreditVerdict;
  votes: CreditVoteRecord[];
  dissents: string[];
  conditions: string[];
  raw: string;
}

export interface CloDebateRound {
  round: number;
  exchanges: { speaker: string; content: string }[];
}

export interface IndividualCreditAssessment {
  memberName: string;
  position: string;
  keyPoints: string[];
  concerns: string[];
  raw: string;
}

export interface CloFollowUp {
  id: string;
  analysisId: string;
  question: string;
  mode: "ask-panel" | "ask-member" | "debate" | "analyst";
  targetMember?: string;
  responseMd: string;
  createdAt: string;
}

export interface CloConversation {
  id: string;
  profileId: string;
  messages: { role: "user" | "assistant"; content: string; timestamp: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface ScreeningSession {
  id: string;
  panelId: string;
  focusArea: string;
  status: "queued" | "running" | "complete" | "error";
  currentPhase?: string;
  rawFiles: Record<string, string>;
  parsedData: ParsedScreening;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface LoanIdea {
  title: string;
  thesis: string;
  sector: string;
  loanType: string;
  riskLevel: string;
  expectedSpread: string;
  rationale: string;
  keyRisks: string[];
  implementationSteps: string[];
}

export interface ParsedScreening {
  ideas: LoanIdea[];
  gapAnalysis?: string;
  raw: string;
}

export interface QuestionnaireStep {
  id: string;
  title: string;
  description: string;
  fields: QuestionnaireField[];
}

export interface QuestionnaireField {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "multiselect" | "radio";
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
}
