import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { AssemblyProvider } from "@/lib/assembly-context";
import type { Topic } from "@/lib/types";
import { AssemblyNav } from "./assembly-nav";

interface AssemblyRow {
  id: string;
  slug: string;
  topic_input: string;
  parsed_data: Topic | null;
}

export default async function AssemblyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const rows = await query<AssemblyRow>(
    "SELECT id, slug, topic_input, parsed_data FROM assemblies WHERE slug = $1 LIMIT 1",
    [slug]
  );

  if (rows.length === 0) {
    notFound();
  }

  const topic: Topic | null = rows[0].parsed_data;

  if (!topic) {
    return <main>{children}</main>;
  }

  return (
    <AssemblyProvider topic={topic}>
      <AssemblyNav topic={topic} slug={slug} />
      <div className="nav-overlay" />
      <main>{children}</main>
    </AssemblyProvider>
  );
}
