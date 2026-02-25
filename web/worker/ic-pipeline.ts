import Anthropic from "@anthropic-ai/sdk";
import { Pool } from "pg";
import { parseCommitteeMembers } from "../lib/ic/parsers/committee-members.js";
import {
  parseMemo,
  parseRiskAssessment,
  parseRecommendation,
  parseDebate,
  parseIndividualAssessments,
} from "../lib/ic/parsers/evaluation.js";
import { getRecentEvaluationSummaries } from "../lib/ic/history.js";
import type { InvestorProfile, CommitteeMember } from "../lib/ic/types.js";
import {
  profileAnalysisPrompt,
  committeeGenerationPrompt,
  avatarMappingPrompt,
  opportunityAnalysisPrompt,
  dynamicSpecialistPrompt,
  individualAssessmentsPrompt,
  evaluationDebatePrompt,
  premortemPrompt,
  investmentMemoPrompt,
  riskAssessmentPrompt,
  recommendationPrompt,
  portfolioGapAnalysisPrompt,
  ideaDebatePrompt,
  ideaSynthesisPrompt,
} from "./ic-prompts.js";

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
  model: string = "claude-sonnet-4-20250514",
  documents?: Array<{ name: string; type: string; base64: string }>
): Promise<string> {
  try {
    const content: Anthropic.MessageCreateParams["messages"][0]["content"] =
      documents && documents.length > 0
        ? [
            ...documents.map((doc) => {
              if (doc.type === "application/pdf") {
                return {
                  type: "document" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "application/pdf" as const,
                    data: doc.base64,
                  },
                };
              }
              return {
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: doc.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: doc.base64,
                },
              };
            }),
            { type: "text" as const, text: userMessage },
          ]
        : userMessage;

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
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
        throw new Error("Anthropic API is temporarily overloaded. Your assembly will be retried.");
      }
    }
    throw err;
  }
}

function attachAvatars(members: CommitteeMember[], rawAvatarJson: string) {
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
    console.warn("[ic-pipeline] Failed to parse avatar-mapping.json, skipping avatars");
  }
}

function rowToProfile(row: Record<string, unknown>): InvestorProfile {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    investmentPhilosophy: (row.investment_philosophy as string) || "",
    riskTolerance: (row.risk_tolerance as InvestorProfile["riskTolerance"]) || "moderate",
    assetClasses: (row.asset_classes as string[]) || [],
    currentPortfolio: (row.current_portfolio as string) || "",
    geographicPreferences: (row.geographic_preferences as string) || "",
    esgPreferences: (row.esg_preferences as string) || "",
    decisionStyle: (row.decision_style as string) || "",
    aumRange: (row.aum_range as string) || "",
    timeHorizons: (row.time_horizons as Record<string, string>) || {},
    beliefsAndBiases: (row.beliefs_and_biases as string) || "",
    rawQuestionnaire: (row.raw_questionnaire as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ─── Committee Pipeline ──────────────────────────────────────────────

export async function runCommitteePipeline(
  pool: Pool,
  profileId: string,
  apiKey: string,
  initialRawFiles: Record<string, string>,
  callbacks: PipelineCallbacks
): Promise<{ members: CommitteeMember[] }> {
  const client = new Anthropic({ apiKey });
  const rawFiles: Record<string, string> = { ...initialRawFiles };

  // Fetch profile
  const profileRows = await pool.query(
    "SELECT * FROM investor_profiles WHERE id = $1",
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

  // Phase 2: Committee Generation
  if (!rawFiles["committee-generation.md"]) {
    await callbacks.updatePhase("committee-generation");
    const prompt = committeeGenerationPrompt(rawFiles["profile-analysis.md"], profile);
    const result = await callClaude(client, prompt.system, prompt.user, 16384);
    rawFiles["committee-generation.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
  }

  // Parse members
  const members = parseCommitteeMembers(rawFiles["committee-generation.md"]);
  if (members.length === 0) {
    throw new Error("Committee generation produced no members — output may be malformed");
  }

  // Phase 3: Avatar Mapping
  if (!rawFiles["avatar-mapping.json"]) {
    await callbacks.updatePhase("avatar-mapping");
    const result = await callClaude(
      client,
      "You are a visual character designer. Return only a valid JSON array mapping each person to DiceBear Adventurer avatar parameters.",
      avatarMappingPrompt(rawFiles["committee-generation.md"]),
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

// ─── Evaluation Pipeline ─────────────────────────────────────────────

export async function runEvaluationPipeline(
  pool: Pool,
  evaluationId: string,
  apiKey: string,
  initialRawFiles: Record<string, string>,
  callbacks: PipelineCallbacks
): Promise<void> {
  const client = new Anthropic({ apiKey });
  const rawFiles: Record<string, string> = { ...initialRawFiles };

  // Fetch evaluation, committee, and profile
  const evalRows = await pool.query(
    `SELECT e.*, c.members, c.profile_id, c.id as committee_id
     FROM ic_evaluations e
     JOIN ic_committees c ON e.committee_id = c.id
     WHERE e.id = $1`,
    [evaluationId]
  );
  if (evalRows.rows.length === 0) {
    throw new Error(`Evaluation ${evaluationId} not found`);
  }
  const evalRow = evalRows.rows[0];
  const members: CommitteeMember[] = evalRow.members || [];
  const dynamicSpecialists: CommitteeMember[] = evalRow.dynamic_specialists || [];

  const profileRows = await pool.query(
    "SELECT * FROM investor_profiles WHERE id = $1",
    [evalRow.profile_id]
  );
  if (profileRows.rows.length === 0) {
    throw new Error(`Profile ${evalRow.profile_id} not found`);
  }
  const profile = rowToProfile(profileRows.rows[0]);

  const evalDetails = evalRow.details || {};
  const documents: Array<{ name: string; type: string; base64: string }> =
    evalDetails.documents || [];

  const evaluation = {
    title: evalRow.title,
    opportunityType: evalRow.opportunity_type,
    companyName: evalRow.company_name,
    thesis: evalRow.thesis,
    terms: evalRow.terms,
    details: evalDetails,
  };

  const parsedData: Record<string, unknown> = evalRow.parsed_data || {};

  // Re-derive parsed data from existing raw files if missing (handles partial failure resume)
  if (rawFiles["individual-assessments.md"] && !parsedData.individualAssessments) {
    parsedData.individualAssessments = parseIndividualAssessments(rawFiles["individual-assessments.md"]);
  }
  if (rawFiles["debate.md"] && !parsedData.debate) {
    parsedData.debate = parseDebate(rawFiles["debate.md"]);
  }
  if (rawFiles["memo.md"] && !parsedData.memo) {
    parsedData.memo = parseMemo(rawFiles["memo.md"]);
  }
  if (rawFiles["risk-assessment.md"] && !parsedData.riskAssessment) {
    parsedData.riskAssessment = parseRiskAssessment(rawFiles["risk-assessment.md"]);
  }
  if (rawFiles["premortem.md"] && !parsedData.premortem) {
    parsedData.premortem = rawFiles["premortem.md"];
  }
  if (rawFiles["recommendation.md"] && !parsedData.recommendation) {
    parsedData.recommendation = parseRecommendation(rawFiles["recommendation.md"]);
  }

  // Phase 1: Opportunity Analysis
  if (!rawFiles["opportunity-analysis.md"]) {
    await callbacks.updatePhase("opportunity-analysis");
    const prompt = opportunityAnalysisPrompt(evaluation, profile);
    const result = await callClaude(client, prompt.system, prompt.user, 8192, undefined, documents);
    rawFiles["opportunity-analysis.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
  }

  // Phase 2: Dynamic Specialists
  if (!rawFiles["dynamic-specialists.md"]) {
    await callbacks.updatePhase("dynamic-specialists");
    const prompt = dynamicSpecialistPrompt(
      rawFiles["opportunity-analysis.md"],
      members,
      profile
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["dynamic-specialists.md"] = result;
    await callbacks.updateRawFiles(rawFiles);

    if (!result.includes("NO_ADDITIONAL_SPECIALISTS_NEEDED")) {
      const specialists = parseCommitteeMembers(result);
      if (specialists.length > 0) {
        // Avoid duplication on retry: only add specialists not already present
        const existingNames = new Set(dynamicSpecialists.map((s) => s.name.toLowerCase()));
        const newSpecialists = specialists.filter((s) => !existingNames.has(s.name.toLowerCase()));
        if (newSpecialists.length > 0) {
          dynamicSpecialists.push(...newSpecialists);
          await pool.query(
            "UPDATE ic_evaluations SET dynamic_specialists = $1::jsonb WHERE id = $2",
            [JSON.stringify(dynamicSpecialists), evaluationId]
          );
        }
      }
    }
  }

  const allMembers = [...members, ...dynamicSpecialists];

  // Phase 3: Individual Assessments
  if (!rawFiles["individual-assessments.md"]) {
    await callbacks.updatePhase("individual-assessments");
    const history = await getRecentEvaluationSummaries(pool, evalRow.committee_id);
    const prompt = individualAssessmentsPrompt(
      allMembers,
      rawFiles["opportunity-analysis.md"],
      profile,
      history
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192, undefined, documents);
    rawFiles["individual-assessments.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.individualAssessments = parseIndividualAssessments(result);
    await callbacks.updateParsedData(parsedData);
  }

  // Phase 4: Debate
  if (!rawFiles["debate.md"]) {
    await callbacks.updatePhase("debate");
    const prompt = evaluationDebatePrompt(
      allMembers,
      rawFiles["individual-assessments.md"],
      rawFiles["opportunity-analysis.md"],
      profile
    );
    const result = await callClaude(client, prompt.system, prompt.user, 16384, undefined, documents);
    rawFiles["debate.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.debate = parseDebate(result);
    await callbacks.updateParsedData(parsedData);
  }

  // Phase 5: Pre-Mortem
  if (!rawFiles["premortem.md"]) {
    await callbacks.updatePhase("premortem");
    const prompt = premortemPrompt(
      allMembers,
      rawFiles["debate.md"],
      rawFiles["opportunity-analysis.md"],
      profile
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["premortem.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.premortem = result;
    await callbacks.updateParsedData(parsedData);
  }

  // Phase 6: Investment Memo
  if (!rawFiles["memo.md"]) {
    await callbacks.updatePhase("memo");
    const prompt = investmentMemoPrompt(
      rawFiles["debate.md"],
      rawFiles["individual-assessments.md"],
      rawFiles["opportunity-analysis.md"],
      profile,
      evaluation.title,
      rawFiles["premortem.md"]
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["memo.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.memo = parseMemo(result);
    await callbacks.updateParsedData(parsedData);
  }

  // Phase 7: Risk Assessment
  if (!rawFiles["risk-assessment.md"]) {
    await callbacks.updatePhase("risk-assessment");
    const prompt = riskAssessmentPrompt(
      rawFiles["debate.md"],
      rawFiles["opportunity-analysis.md"],
      profile,
      rawFiles["premortem.md"]
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["risk-assessment.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.riskAssessment = parseRiskAssessment(result);
    await callbacks.updateParsedData(parsedData);
  }

  // Phase 8: Recommendation
  if (!rawFiles["recommendation.md"]) {
    await callbacks.updatePhase("recommendation");
    const prompt = recommendationPrompt(
      rawFiles["memo.md"],
      rawFiles["risk-assessment.md"],
      rawFiles["debate.md"],
      allMembers,
      profile,
      rawFiles["premortem.md"]
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["recommendation.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.recommendation = parseRecommendation(result);
    await callbacks.updateParsedData(parsedData);
  }
}

// ─── Idea Pipeline ───────────────────────────────────────────────────

export async function runIdeaPipeline(
  pool: Pool,
  ideaId: string,
  apiKey: string,
  initialRawFiles: Record<string, string>,
  callbacks: PipelineCallbacks
): Promise<void> {
  const client = new Anthropic({ apiKey });
  const rawFiles: Record<string, string> = { ...initialRawFiles };

  // Fetch idea, committee, and profile
  const ideaRows = await pool.query(
    `SELECT i.*, c.members, c.profile_id, c.id as committee_id
     FROM ic_ideas i
     JOIN ic_committees c ON i.committee_id = c.id
     WHERE i.id = $1`,
    [ideaId]
  );
  if (ideaRows.rows.length === 0) {
    throw new Error(`Idea ${ideaId} not found`);
  }
  const ideaRow = ideaRows.rows[0];
  const members: CommitteeMember[] = ideaRow.members || [];

  const profileRows = await pool.query(
    "SELECT * FROM investor_profiles WHERE id = $1",
    [ideaRow.profile_id]
  );
  if (profileRows.rows.length === 0) {
    throw new Error(`Profile ${ideaRow.profile_id} not found`);
  }
  const profile = rowToProfile(profileRows.rows[0]);

  const focusArea = ideaRow.focus_area || "";
  const parsedData: Record<string, unknown> = ideaRow.parsed_data || {};

  // Re-derive parsed data from existing raw files if missing (handles partial failure resume)
  if (rawFiles["gap-analysis.md"] && !parsedData.gapAnalysis) {
    parsedData.gapAnalysis = rawFiles["gap-analysis.md"];
  }
  if (rawFiles["idea-synthesis.md"] && !parsedData.ideas) {
    parsedData.ideas = parseIdeas(rawFiles["idea-synthesis.md"]);
    parsedData.raw = rawFiles["idea-synthesis.md"];
  }

  // Phase 1: Gap Analysis
  if (!rawFiles["gap-analysis.md"]) {
    await callbacks.updatePhase("gap-analysis");
    const recentEvals = await getRecentEvaluationSummaries(pool, ideaRow.committee_id);
    const prompt = portfolioGapAnalysisPrompt(profile, recentEvals);
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["gap-analysis.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
    parsedData.gapAnalysis = result;
    await callbacks.updateParsedData(parsedData);
  }

  // Phase 2: Idea Debate
  if (!rawFiles["idea-debate.md"]) {
    await callbacks.updatePhase("idea-debate");
    const prompt = ideaDebatePrompt(
      members,
      rawFiles["gap-analysis.md"],
      focusArea,
      profile
    );
    const result = await callClaude(client, prompt.system, prompt.user, 16384);
    rawFiles["idea-debate.md"] = result;
    await callbacks.updateRawFiles(rawFiles);
  }

  // Phase 3: Idea Synthesis
  if (!rawFiles["idea-synthesis.md"]) {
    await callbacks.updatePhase("idea-synthesis");
    const prompt = ideaSynthesisPrompt(
      rawFiles["idea-debate.md"],
      rawFiles["gap-analysis.md"],
      profile
    );
    const result = await callClaude(client, prompt.system, prompt.user, 8192);
    rawFiles["idea-synthesis.md"] = result;
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
      assetClass: getSection("Asset Class"),
      timeHorizon: getSection("Time Horizon"),
      riskLevel: getSection("Risk Level"),
      expectedReturn: getSection("Expected Return"),
      rationale: getSection("Rationale"),
      keyRisks: getBulletList("Key Risks"),
      implementationSteps: getNumberedList("Implementation Steps"),
    });
  }

  return ideas;
}
