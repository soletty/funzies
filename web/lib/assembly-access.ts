import { query } from "@/lib/db";

export type AccessLevel = "owner" | "write" | "read" | null;

export async function getAssemblyAccess(
  assemblyId: string,
  userId: string
): Promise<AccessLevel> {
  const ownerRows = await query(
    "SELECT id FROM assemblies WHERE id = $1 AND user_id = $2",
    [assemblyId, userId]
  );
  if (ownerRows.length > 0) return "owner";

  const shareRows = await query<{ role: string }>(
    "SELECT role FROM assembly_shares WHERE assembly_id = $1 AND user_id = $2",
    [assemblyId, userId]
  );
  if (shareRows.length > 0) return shareRows[0].role as "read" | "write";

  return null;
}

export async function getAssemblyAccessBySlug(
  slug: string,
  userId: string
): Promise<{ access: AccessLevel; assemblyId: string | null }> {
  const rows = await query<{ id: string; user_id: string }>(
    "SELECT id, user_id FROM assemblies WHERE slug = $1 LIMIT 1",
    [slug]
  );
  if (rows.length === 0) return { access: null, assemblyId: null };

  const assembly = rows[0];
  if (assembly.user_id === userId) return { access: "owner", assemblyId: assembly.id };

  const shareRows = await query<{ role: string }>(
    "SELECT role FROM assembly_shares WHERE assembly_id = $1 AND user_id = $2",
    [assembly.id, userId]
  );
  if (shareRows.length > 0) return { access: shareRows[0].role as "read" | "write", assemblyId: assembly.id };

  return { access: null, assemblyId: assembly.id };
}
