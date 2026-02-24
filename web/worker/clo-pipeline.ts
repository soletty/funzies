import Anthropic from "@anthropic-ai/sdk";
import { Pool } from "pg";
import { parsePanelMembers } from "../lib/clo/parsers/panel-members.js";
import {
  parseCreditMemo,
  parseCreditRiskAssessment,
  parseCreditRecommendation,
  parseDebate,
  parseIndividualAssessments,
} from "../lib/clo/parsers/analysis.js";
import { getRecentAnalysisSummaries } from "../lib/clo/history.js";
import type { CloProfile, PanelMember } from "../lib/clo/types.js";
import {
  profileAnalysisPrompt,
  panelGenerationPrompt,
  avatarMappingPrompt,
  creditAnalysisPrompt,
  dynamicSpecialistPrompt,
  individualAssessmentsPrompt,
  analysisDebatePrompt,
  creditMemoPrompt,
  riskAssessmentPrompt,
  recommendationPrompt,
  portfolioGapAnalysisPrompt,
  screeningDebatePrompt,
  screeningSynthesisPrompt,
} from "./clo-prompts.js";

export interface PipelineCallbacks {
  updatePhase: (phase: string) => Promise<void>;
  updateRawFiles: (files: Record<string, string>) => Promise<void>;
  updateParsedData: (data: unknown) => Promise<void>;
}

async function callClaude(
  client: Anthropic,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  model: string = "claude-sonnet-4-20250514"
): Promise<string> {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) {
      const apiErr = err as { status: number; message?: string };
      if (apiErr.status === 401) {
        throw new Error("Invalid API key. Please update your key in Settings.");
      }
      if (apiErr.status === 429) {
        throw new Error("Rate limited by Anthropic. Please wait and try again, or check your API plan limits.");
      }
      if (apiErr.status === 529) {
        throw new Error("Anthropic API is temporarily overloaded. Your analysis will be retried.");
      }
    }
    throw err;
  }
}

function attachAvatars(members: PanelMember[], rawAvatarJson: string) {
  try {
    const avatarMapping = JSON.parse(rawAvatarJson) as Array<{
      name: string;
      skinColor: string;
      hair: string;
      hairColor: string;
      eyes: string;
      eyebrows: string;
      mouth: string;
      glasses: string;
      features: string;
    }>;
    for (const member of members) {
      const mapping = avatarMapping.find(
        (m) => m.name.toLowerCase() === member.name.toLowerCase()
      );
      if (mapping) {
        const params = new URLSearchParams({
          seed: mapping.name,
          skinColor: mapping.skinColor,
          hair: mapping.hair,
          hairColor: mapping.hairColor,
          eyes: mapping.eyes,
          eyebrows: mapping.eyebrows,
          mouth: mapping.mouth,
        });
        if (mapping.glasses !== "none") {
          params.set("glasses", mapping.glasses);
          params.set("glassesProbability", "100");
        } else {
          params.set("glassesProbability", "0");
        }
        if (mapping.features !== "none") {
          params.set("features", mapping.features);
          params.set("featuresProbability", "100");
        } else {
          params.set("featuresProbability", "0");
        }
        member.avatarUrl = `https://api.dicebear.com/9.x/adventurer/svg?${params.toString()}`;
      }
    }
  } catch {
    console.warn("[clo-pipeline] Failed to parse avatar-mapping.json, skipping avatars");
  }
}

function rowToProfile(row: Record<string, unknown>): CloProfile {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    fundStrategy: (row.fund_strategy as string) || "",
    targetSectors: (row.target_sectors as string) || "",
    riskAppetite: (row.risk_appetite as CloProfile["riskAppetite"]) || "moderate",
    portfolioSize: (row.portfolio_size as string) || "",
    reinvestmentPeriod: (row.reinvestment_period as string) || "",
    concentrationLimits: (row.concentration_limits as string) || "",
    covenantPreferences: (row.covenant_preferences as string) || "",
    ratingThresholds: (row.rating_thresholds as string) || "",
    spreadTargets: (row.spread_targets as string) || "",
    regulatoryConstraints: (row.regulatory_constraints as string) || "",
    portfolioDescription: (row.portfolio_description as string) || "",
    beliefsAndBiases: (row.beliefs_and_biases as string) || "",
    rawQuestionnaire: (row.raw_questionnaire as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ─── Panel Pipeline ──────────────────────────────────────────────────

export async function runPanelPipeline(
  pool: Pool,
  profileId: string,
  apiKey: string,
  initialRawFiles: Record<string, string>,
  callbacks: PipelineCallbacks
): Promise<{ members: PanelMember[] }> {
  const client = new Anthropic({ apiKey });
  const rawFiles: Record<string, string> = { ...initialRawFiles };

  // Fetch profile
  const profileRows = await pool.query(
    "SELECT * FROM clo_profiles WHERE id = $1",
    [profileId]
  );
  if (profileRows.rows.length === 0) {
    throw new Error(`Profile ${profileId} not found`);
  }
  const profile = rowToProfile(profileRows.rows[0]);

  // Phase 1: Profile Analysis
  if (!rawFiles["profile-analysis.md"]) {
    await callbacks.updatePhase("profile-analysis");
    const prompt = profileAnalysisPrompt(profile);
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["profile-analysis.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
  }

  // Phase 2: Panel Generation
  if (!rawFiles["panel-generation.md"]) {
    await callbacks.updatePhase("panel-generation");
    const prompt = panelGenerationPrompt(rawFiles["profile-analysis.md"], profile);
    const result = await callClaude(client, prompt.system, prompt.user, 16384);
    rawFiles["panel-generation.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
  }

  // Parse members
  const members = parsePanelMembers(rawFiles["panel-generation.md"]);
  if (members.length === 0) {
    throw new Error("Panel generation produced no members — output may be malformed");
  }

  // Phase 3: Avatar Mapping
  if (!rawFiles["avatar-mapping.json"]) {
    await callbacks.updatePhase("avatar-mapping");
    const result = await callClaude(
      client,
      "You are a visual character designer. Return only a valid JSON array mapping each person to DiceBear Adventurer avatar parameters.",
      avatarMappingPrompt(rawFiles["panel-generation.md"]),
      4096,
      "claude-haiku-4-5-20251001"
    );
    const cleaned = result.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    rawFiles["avatar-mapping.json"] = cleaned;
    await callbacks.updateRawFiles(rawFiles);
  }

  attachAvatars(members, rawFiles["avatar-mapping.json"]);
  await callbacks.updateParsedData({ members });

  return { members };
}

// ─── Analysis Pipeline ───────────────────────────────────────────────

export async function runAnalysisPipeline(
  pool: Pool,
  analysisId: string,
  apiKey: string,
  initialRawFiles: Record<string, string>,
  callbacks: PipelineCallbacks
): Promise<void> {
  const client = new Anthropic({ apiKey });
  const rawFiles: Record<string, string> = { ...initialRawFiles };

  // Fetch analysis, panel, and profile
  const analysisRows = await pool.query(
    `SELECT a.*, p.members, p.profile_id, p.id as panel_id
     FROM clo_analyses a
     JOIN clo_panels p ON a.panel_id = p.id
     WHERE a.id = $1`,
    [analysisId]
  );
  if (analysisRows.rows.length === 0) {
    throw new Error(`Analysis ${analysisId} not found`);
  }
  const analysisRow = analysisRows.rows[0];
  const members: PanelMember[] = analysisRow.members || [];
  const dynamicSpecialists: PanelMember[] = analysisRow.dynamic_specialists || [];

  const profileRows = await pool.query(
    "SELECT * FROM clo_profiles WHERE id = $1",
    [analysisRow.profile_id]
  );
  if (profileRows.rows.length === 0) {
    throw new Error(`Profile ${analysisRow.profile_id} not found`);
  }
  const profile = rowToProfile(profileRows.rows[0]);

  const analysis = {
    title: analysisRow.title,
    analysisType: analysisRow.analysis_type,
    borrowerName: analysisRow.borrower_name,
    sector: analysisRow.sector,
    loanType: analysisRow.loan_type,
    spreadCoupon: analysisRow.spread_coupon,
    rating: analysisRow.rating,
    maturity: analysisRow.maturity,
    facilitySize: analysisRow.facility_size,
    leverage: analysisRow.leverage,
    interestCoverage: analysisRow.interest_coverage,
    covenantsSummary: analysisRow.covenants_summary,
    ebitda: analysisRow.ebitda,
    revenue: analysisRow.revenue,
    companyDescription: analysisRow.company_description,
    notes: analysisRow.notes,
    switchBorrowerName: analysisRow.switch_borrower_name,
    switchSector: analysisRow.switch_sector,
    switchLoanType: analysisRow.switch_loan_type,
    switchSpreadCoupon: analysisRow.switch_spread_coupon,
    switchRating: analysisRow.switch_rating,
    switchMaturity: analysisRow.switch_maturity,
    switchFacilitySize: analysisRow.switch_facility_size,
    switchLeverage: analysisRow.switch_leverage,
    switchInterestCoverage: analysisRow.switch_interest_coverage,
    switchCovenantsSummary: analysisRow.switch_covenants_summary,
    switchEbitda: analysisRow.switch_ebitda,
    switchRevenue: analysisRow.switch_revenue,
    switchCompanyDescription: analysisRow.switch_company_description,
    switchNotes: analysisRow.switch_notes,
  };

  const parsedData: Record<string, unknown> = analysisRow.parsed_data || {};

  // Re-derive parsed data from existing raw files if missing (handles partial failure resume)
  if (rawFiles["individual-assessments.md"] && !parsedData.individualAssessments) {
    parsedData.individualAssessments = parseIndividualAssessments(rawFiles["individual-assessments.md"]);
  }
  if (rawFiles["debate.md"] && !parsedData.debate) {
    parsedData.debate = parseDebate(rawFiles["debate.md"]);
  }
  if (rawFiles["memo.md"] && !parsedData.memo) {
    parsedData.memo = parseCreditMemo(rawFiles["memo.md"]);
  }
  if (rawFiles["risk-assessment.md"] && !parsedData.riskAssessment) {
    parsedData.riskAssessment = parseCreditRiskAssessment(rawFiles["risk-assessment.md"]);
  }
  if (rawFiles["recommendation.md"] && !parsedData.recommendation) {
    parsedData.recommendation = parseCreditRecommendation(rawFiles["recommendation.md"]);
  }

  // Phase 1: Credit Analysis
  if (!rawFiles["credit-analysis.md"]) {
    await callbacks.updatePhase("credit-analysis");
    const prompt = creditAnalysisPrompt(analysis, profile);
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["credit-analysis.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
  }

  // Phase 2: Dynamic Specialists
  if (!rawFiles["dynamic-specialists.md"]) {
    await callbacks.updatePhase("dynamic-specialists");

    // Re-fetch from DB in case of retry after partial phase-2 completion
    const freshRow = await pool.query(
      "SELECT dynamic_specialists FROM clo_analyses WHERE id = $1",
      [analysisId]
    );
    const currentSpecialists: PanelMember[] = freshRow.rows[0]?.dynamic_specialists || [];
    dynamicSpecialists.length = 0;
    dynamicSpecialists.push(...currentSpecialists);

    const prompt = dynamicSpecialistPrompt(
      rawFiles["credit-analysis.md"],
      members,
      profile
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["dynamic-specialists.md"] = result;
    await callbacks.updateRawFiles(rawFiles);

    if (!result.includes("NO_ADDITIONAL_SPECIALISTS_NEEDED")) {
      const specialists = parsePanelMembers(result);
      if (specialists.length > 0) {
        const existingNames = new Set(dynamicSpecialists.map((s) => s.name.toLowerCase()));
        const newSpecialists = specialists.filter((s) => !existingNames.has(s.name.toLowerCase()));
        if (newSpecialists.length > 0) {
          dynamicSpecialists.push(...newSpecialists);
          await pool.query(
            "UPDATE clo_analyses SET dynamic_specialists = $1::jsonb WHERE id = $2",
            [JSON.stringify(dynamicSpecialists), analysisId]
          );
        }
      }
    }
  }

  const allMembers = [...members, ...dynamicSpecialists];

  // Phase 3: Individual Assessments
  if (!rawFiles["individual-assessments.md"]) {
    await callbacks.updatePhase("individual-assessments");
    const history = await getRecentAnalysisSummaries(pool, analysisRow.panel_id);
    const prompt = individualAssessmentsPrompt(
      allMembers,
      rawFiles["credit-analysis.md"],
      profile,
      history
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["individual-assessments.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.individualAssessments = parseIndividualAssessments(result);
    await callbacks.updateParsedData(parsedData);
  }

  // Phase 4: Debate
  if (!rawFiles["debate.md"]) {
    await callbacks.updatePhase("debate");
    const prompt = analysisDebatePrompt(
      allMembers,
      rawFiles["individual-assessments.md"],
      rawFiles["credit-analysis.md"],
      profile
    );
    const result = await callClaude(client, prompt.system, prompt.user, 16384);
    rawFiles["debate.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.debate = parseDebate(result);
    await callbacks.updateParsedData(parsedData);
  }

  // Phase 5: Credit Memo
  if (!rawFiles["memo.md"]) {
    await callbacks.updatePhase("memo");
    const prompt = creditMemoPrompt(
      rawFiles["debate.md"],
      rawFiles["individual-assessments.md"],
      rawFiles["credit-analysis.md"],
      profile,
      analysis.title
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["memo.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.memo = parseCreditMemo(result);
    await callbacks.updateParsedData(parsedData);
  }

  // Phase 6: Risk Assessment
  if (!rawFiles["risk-assessment.md"]) {
    await callbacks.updatePhase("risk-assessment");
    const prompt = riskAssessmentPrompt(
      rawFiles["debate.md"],
      rawFiles["credit-analysis.md"],
      profile
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["risk-assessment.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.riskAssessment = parseCreditRiskAssessment(result);
    await callbacks.updateParsedData(parsedData);
  }

  // Phase 7: Recommendation
  if (!rawFiles["recommendation.md"]) {
    await callbacks.updatePhase("recommendation");
    const prompt = recommendationPrompt(
      rawFiles["memo.md"],
      rawFiles["risk-assessment.md"],
      rawFiles["debate.md"],
      allMembers,
      profile
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["recommendation.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.recommendation = parseCreditRecommendation(result);
    await callbacks.updateParsedData(parsedData);
  }
}

// ─── Screening Pipeline ─────────────────────────────────────────────

export async function runScreeningPipeline(
  pool: Pool,
  screeningId: string,
  apiKey: string,
  initialRawFiles: Record<string, string>,
  callbacks: PipelineCallbacks
): Promise<void> {
  const client = new Anthropic({ apiKey });
  const rawFiles: Record<string, string> = { ...initialRawFiles };

  // Fetch screening, panel, and profile
  const screeningRows = await pool.query(
    `SELECT s.*, p.members, p.profile_id, p.id as panel_id
     FROM clo_screenings s
     JOIN clo_panels p ON s.panel_id = p.id
     WHERE s.id = $1`,
    [screeningId]
  );
  if (screeningRows.rows.length === 0) {
    throw new Error(`Screening ${screeningId} not found`);
  }
  const screeningRow = screeningRows.rows[0];
  const members: PanelMember[] = screeningRow.members || [];

  const profileRows = await pool.query(
    "SELECT * FROM clo_profiles WHERE id = $1",
    [screeningRow.profile_id]
  );
  if (profileRows.rows.length === 0) {
    throw new Error(`Profile ${screeningRow.profile_id} not found`);
  }
  const profile = rowToProfile(profileRows.rows[0]);

  const focusArea = screeningRow.focus_area || "";
  const parsedData: Record<string, unknown> = screeningRow.parsed_data || {};

  // Re-derive parsed data from existing raw files if missing (handles partial failure resume)
  if (rawFiles["gap-analysis.md"] && !parsedData.gapAnalysis) {
    parsedData.gapAnalysis = rawFiles["gap-analysis.md"];
  }
  if (rawFiles["screening-synthesis.md"] && !parsedData.ideas) {
    parsedData.ideas = parseIdeas(rawFiles["screening-synthesis.md"]);
    parsedData.raw = rawFiles["screening-synthesis.md"];
  }

  // Phase 1: Gap Analysis
  if (!rawFiles["gap-analysis.md"]) {
    await callbacks.updatePhase("gap-analysis");
    const recentAnalyses = await getRecentAnalysisSummaries(pool, screeningRow.panel_id);
    const prompt = portfolioGapAnalysisPrompt(profile, recentAnalyses);
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["gap-analysis.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.gapAnalysis = result;
    await callbacks.updateParsedData(parsedData);
  }

  // Phase 2: Screening Debate
  if (!rawFiles["screening-debate.md"]) {
    await callbacks.updatePhase("screening-debate");
    const prompt = screeningDebatePrompt(
      members,
      rawFiles["gap-analysis.md"],
      focusArea,
      profile
    );
    const result = await callClaude(client, prompt.system, prompt.user, 16384);
    rawFiles["screening-debate.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
  }

  // Phase 3: Screening Synthesis
  if (!rawFiles["screening-synthesis.md"]) {
    await callbacks.updatePhase("screening-synthesis");
    const prompt = screeningSynthesisPrompt(
      rawFiles["screening-debate.md"],
      rawFiles["gap-analysis.md"],
      profile
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["screening-synthesis.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.ideas = parseIdeas(result);
    parsedData.raw = result;
    await callbacks.updateParsedData(parsedData);
  }
}

function parseIdeas(raw: string): Array<Record<string, unknown>> {
  const ideas: Array<Record<string, unknown>> = [];
  const ideaBlocks = raw.split(/(?=^## Idea\s+\d+)/mi);

  for (const block of ideaBlocks) {
    const titleMatch = block.match(/^## Idea\s+\d+:\s*(.+)$/mi);
    if (!titleMatch) continue;

    const title = titleMatch[1].trim();
    const getSection = (name: string): string => {
      const pattern = new RegExp(`### ${name}\\s*\\n([\\s\\S]*?)(?=### |$)`, "i");
      const match = block.match(pattern);
      return match ? match[1].trim() : "";
    };
    const getBulletList = (name: string): string[] => {
      const text = getSection(name);
      return text
        .split("\n")
        .filter((l) => /^[-*]\s/.test(l.trim()))
        .map((l) => l.trim().replace(/^[-*]\s*/, ""));
    };
    const getNumberedList = (name: string): string[] => {
      const text = getSection(name);
      return text
        .split("\n")
        .filter((l) => /^\d+\.\s/.test(l.trim()))
        .map((l) => l.trim().replace(/^\d+\.\s*/, ""));
    };

    ideas.push({
      title,
      thesis: getSection("Thesis"),
      sector: getSection("Sector"),
      loanType: getSection("Loan Type"),
      riskLevel: getSection("Risk Level"),
      expectedSpread: getSection("Expected Spread"),
      rationale: getSection("Rationale"),
      keyRisks: getBulletList("Key Risks"),
      implementationSteps: getNumberedList("Implementation Steps"),
    });
  }

  return ideas;
}
