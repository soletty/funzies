import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getUserGithubToken } from "@/lib/github";

const MAX_FILE_SIZE = 100_000;

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
  const path = searchParams.get("path");

  if (!owner || !repo || !path) {
    return NextResponse.json({ error: "owner, repo, and path required" }, { status: 400 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "IntellectualAssembly",
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 502 });
  }

  const data = await res.json();
  if (data.encoding !== "base64" || !data.content) {
    return NextResponse.json({ error: "Unsupported file encoding" }, { status: 400 });
  }

  const content = Buffer.from(data.content, "base64").toString("utf-8");
  const truncated = content.slice(0, MAX_FILE_SIZE);

  return NextResponse.json({
    path: data.path,
    content: truncated,
    truncated: content.length > MAX_FILE_SIZE,
    size: data.size,
  });
}
