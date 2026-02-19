import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { AssemblyProvider } from "@/lib/assembly-context";
import type { Topic, FollowUp, FollowUpInsight } from "@/lib/types";
import { AssemblyNav } from "./assembly-nav";
import AssemblyErrorBoundary from "@/components/AssemblyErrorBoundary";

interface AssemblyRow {
  id: string;
  slug: string;
  topic_input: string;
  status: string;
  parsed_data: Topic | null;
}

interface FollowUpRow {
  id: string;
  question: string;
  mode: string;
  response_md: string;
  context_page: string;
  created_at: string;
  insight: FollowUpInsight | null;
}

export default async function AssemblyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [rows, followUpRows] = await Promise.all([
    query<AssemblyRow>(
      "SELECT id, slug, topic_input, status, parsed_data FROM assemblies WHERE slug = $1 LIMIT 1",
      [slug]
    ),
    query<FollowUpRow>(
      `SELECT f.id, f.question, f.mode, f.response_md, f.context_page, f.created_at, f.insight
       FROM follow_ups f JOIN assemblies a ON f.assembly_id = a.id
       WHERE a.slug = $1 ORDER BY f.created_at ASC`,
      [slug]
    ),
  ]);

  if (rows.length === 0) {
    notFound();
  }

  const topic: Topic | null = rows[0].parsed_data;
  const isComplete = rows[0].status === "complete";

  if (topic) {
    topic.followUps = followUpRows.map((row): FollowUp => ({
      id: row.id,
      timestamp: row.created_at,
      question: row.question,
      context: row.context_page || "",
      mode: row.mode,
      responses: [],
      raw: row.response_md || "",
      insight: row.insight || undefined,
    }));
    (topic as Topic & { isComplete?: boolean }).isComplete = isComplete;
  }

  if (!topic) {
    return (
      <AssemblyErrorBoundary>
        <main className="no-nav">{children}</main>
      </AssemblyErrorBoundary>
    );
  }

  return (
    <AssemblyProvider topic={topic} assemblyId={rows[0].id}>
      <AssemblyNav topic={topic} slug={slug} />
      <div className="nav-overlay" />
      <AssemblyErrorBoundary>
        <main>{children}</main>
      </AssemblyErrorBoundary>
    </AssemblyProvider>
  );
}
