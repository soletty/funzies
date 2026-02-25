export interface InvestorProfile {
  id: string;
  userId: string;
  investmentPhilosophy: string;
  riskTolerance: "conservative" | "moderate" | "aggressive";
  assetClasses: string[];
  currentPortfolio: string;
  geographicPreferences: string;
  esgPreferences: string;
  decisionStyle: string;
  aumRange: string;
  timeHorizons: Record<string, string>;
  beliefsAndBiases: string;
  rawQuestionnaire: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CommitteeMember {
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

export interface Committee {
  id: string;
  profileId: string;
  status: "queued" | "generating" | "active" | "error";
  members: CommitteeMember[];
  avatarMappings: Record<string, string>;
  rawFiles: Record<string, string>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Evaluation {
  id: string;
  committeeId: string;
  title: string;
  opportunityType: string;
  companyName: string;
  thesis: string;
  terms: string;
  details: Record<string, unknown>;
  status: "queued" | "running" | "complete" | "error";
  currentPhase: string;
  rawFiles: Record<string, string>;
  parsedData: ParsedEvaluation;
  dynamicSpecialists: CommitteeMember[];
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ParsedEvaluation {
  memo?: InvestmentMemo;
  riskAssessment?: RiskAssessment;
  recommendation?: Recommendation;
  debate?: ICDebateRound[];
  individualAssessments?: IndividualAssessment[];
  premortem?: string;
}

export interface InvestmentMemo {
  title: string;
  sections: { heading: string; content: string }[];
  raw: string;
}

export interface RiskAssessment {
  overallRisk: "low" | "moderate" | "high" | "very-high";
  categories: { name: string; level: string; analysis: string }[];
  mitigants: string[];
  raw: string;
}

export type Verdict = "strongly_favorable" | "favorable" | "mixed" | "unfavorable" | "strongly_unfavorable";

export interface VoteRecord {
  memberName: string;
  vote: Verdict;
  engagement: string;
  rationale: string;
}

export interface Recommendation {
  verdict: Verdict;
  votes: VoteRecord[];
  dissents: string[];
  conditions: string[];
  raw: string;
}

export interface ICDebateRound {
  round: number;
  exchanges: { speaker: string; content: string }[];
}

export interface IndividualAssessment {
  memberName: string;
  position: string;
  keyPoints: string[];
  concerns: string[];
  raw: string;
}

export interface ICFollowUp {
  id: string;
  evaluationId: string;
  question: string;
  mode: "ask-committee" | "ask-member" | "debate";
  targetMember?: string;
  responseMd: string;
  createdAt: string;
}

export interface IdeaSession {
  id: string;
  committeeId: string;
  focusArea: string;
  status: "queued" | "running" | "complete" | "error";
  currentPhase?: string;
  rawFiles: Record<string, string>;
  parsedData: ParsedIdeas;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface InvestmentIdea {
  title: string;
  thesis: string;
  assetClass: string;
  timeHorizon: string;
  riskLevel: string;
  expectedReturn: string;
  rationale: string;
  keyRisks: string[];
  implementationSteps: string[];
}

export interface ParsedIdeas {
  ideas: InvestmentIdea[];
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
