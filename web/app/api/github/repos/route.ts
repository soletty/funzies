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

  const q = request.nextUrl.searchParams.get("q") || "";
  const page = request.nextUrl.searchParams.get("page") || "1";

  const url = q
    ? `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}+user:@me&per_page=20&page=${page}`
    : `https://api.github.com/user/repos?sort=updated&per_page=20&page=${page}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "IntellectualAssembly",
    },
  });

  if (res.status === 401) {
    return NextResponse.json({ error: "GitHub token expired" }, { status: 401 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch repos" }, { status: 502 });
  }

  const data = await res.json();
  const repos = (q ? data.items : data) || [];

  const mapped = repos.map((r: { full_name: string; name: string; owner: { login: string }; default_branch: string; description: string | null; private: boolean }) => ({
    fullName: r.full_name,
    name: r.name,
    owner: r.owner.login,
    defaultBranch: r.default_branch,
    description: r.description,
    private: r.private,
  }));

  return NextResponse.json(mapped);
}
