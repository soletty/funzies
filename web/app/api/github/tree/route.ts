import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getUserGithubToken } from "@/lib/github";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await getUserGithubToken(user.id);
  if (!token) {
    return NextResponse.json({ error: "GitHub not connected" }, { status: 400 });
  }

  const { searchParams } = request.nextUrl;
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const branch = searchParams.get("branch") || "main";
  const path = searchParams.get("path") || "";

  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo required" }, { status: 400 });
  }

  const apiPath = path
    ? `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`
    : `/repos/${owner}/${repo}/contents?ref=${branch}`;

  const res = await fetch(`https://api.github.com${apiPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "IntellectualAssembly",
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch tree" }, { status: 502 });
  }

  const data = await res.json();
  const entries = Array.isArray(data) ? data : [];

  const mapped = entries.map((e: { name: string; path: string; type: string; size: number }) => ({
    name: e.name,
    path: e.path,
    type: e.type,
    size: e.size,
  }));

  return NextResponse.json(mapped);
}
