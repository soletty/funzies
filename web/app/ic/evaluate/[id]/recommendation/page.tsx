import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { verifyEvaluationAccess } from "@/lib/ic/access";
import type { ParsedEvaluation, CommitteeMember } from "@/lib/ic/types";
import RecommendationBadge from "@/components/ic/RecommendationBadge";

const VOTE_LABELS: Record<string, string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  pass: "Pass",
  strong_pass: "Strong Pass",
};

export default async function RecommendationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const { id } = await params;

  const hasAccess = await verifyEvaluationAccess(id, session.user.id);
  if (!hasAccess) notFound();

  const rows = await query<{
    parsed_data: ParsedEvaluation | null;
    committee_id: string;
    dynamic_specialists: CommitteeMember[] | null;
  }>(
    "SELECT parsed_data, committee_id, dynamic_specialists FROM ic_evaluations WHERE id = $1",
    [id]
  );

  if (rows.length === 0) {
    notFound();
  }

  const rec = rows[0].parsed_data?.recommendation;
  if (!rec) {
    return <p style={{ color: "var(--color-text-muted)" }}>Recommendation not yet available.</p>;
  }

  const committees = await query<{ members: CommitteeMember[] }>(
    "SELECT members FROM ic_committees WHERE id = $1",
    [rows[0].committee_id]
  );
  const standingMembers = (committees[0]?.members || []) as CommitteeMember[];
  const dynamicSpecialists = (rows[0].dynamic_specialists || []) as CommitteeMember[];
  const members = [...standingMembers, ...dynamicSpecialists];
  const avatarMap = new Map(members.map((m) => [m.name, m.avatarUrl]));

  return (
    <div className="ic-recommendation">
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <RecommendationBadge verdict={rec.verdict} />
      </div>

      {rec.votes?.length > 0 && (
        <div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", marginBottom: "1rem" }}>
            Vote Tally
          </h3>
          <div className="ic-vote-grid">
            {rec.votes.map((vote, i) => {
              const avatar = avatarMap.get(vote.memberName);
              return (
                <div key={i} className="ic-vote-card">
                  <div className="ic-vote-header">
                    {avatar ? (
                      <img src={avatar} alt={vote.memberName} className="ic-vote-avatar" />
                    ) : (
                      <div className="ic-member-avatar-placeholder" style={{ width: 28, height: 28, fontSize: "0.7rem" }}>
                        {vote.memberName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{vote.memberName}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                        {VOTE_LABELS[vote.vote] || vote.vote}
                        {vote.conviction && ` (${vote.conviction})`}
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                    {vote.rationale}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rec.dissents?.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", marginBottom: "0.75rem" }}>
            Dissents
          </h3>
          {rec.dissents.map((d, i) => (
            <p key={i} style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: "0.5rem" }}>
              {d}
            </p>
          ))}
        </div>
      )}

      {rec.conditions?.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", marginBottom: "0.75rem" }}>
            Conditions for Investment
          </h3>
          <ul style={{ paddingLeft: "1.25rem" }}>
            {rec.conditions.map((c, i) => (
              <li key={i} style={{ fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "0.4rem", color: "var(--color-text-secondary)" }}>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
