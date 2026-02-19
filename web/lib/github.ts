import { query } from "./db";
import { decryptApiKey } from "./crypto";

const GITHUB_API = "https://api.github.com";

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".mp3", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".pyc", ".class", ".o", ".obj",
  ".sqlite", ".db",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out",
  "__pycache__", ".cache", "coverage", ".turbo", "vendor",
  ".venv", "venv", "env",
]);

const LOCK_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "Gemfile.lock", "Cargo.lock", "poetry.lock", "composer.lock",
]);

const CONFIG_FILES = [
  "package.json", "Cargo.toml", "pyproject.toml", "go.mod",
  "build.gradle", "pom.xml", "Gemfile", "composer.json",
];

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export async function getUserGithubToken(userId: string): Promise<string | null> {
  const rows = await query<{ encrypted_token: Buffer; token_iv: Buffer }>(
    "SELECT encrypted_token, token_iv FROM github_connections WHERE user_id = $1",
    [userId]
  );
  if (!rows[0]) return null;
  return decryptApiKey(
    Buffer.from(rows[0].encrypted_token),
    Buffer.from(rows[0].token_iv)
  );
}

async function githubFetch(token: string, path: string): Promise<Response> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "IntellectualAssembly",
    },
  });
  if (res.status === 401) {
    throw new Error("GitHub token expired or revoked");
  }
  return res;
}

function shouldSkipPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  const filename = parts[parts.length - 1];
  if (LOCK_FILES.has(filename)) return true;
  const ext = filename.includes(".") ? "." + filename.split(".").pop()!.toLowerCase() : "";
  if (BINARY_EXTENSIONS.has(ext)) return true;
  return false;
}

export async function fetchRepoTree(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<string[]> {
  const res = await githubFetch(
    token,
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  );
  if (!res.ok) throw new Error(`Failed to fetch tree: ${res.status}`);
  const data = await res.json();
  const entries = (data.tree as TreeEntry[]) || [];
  return entries
    .filter((e) => e.type === "blob" && !shouldSkipPath(e.path))
    .map((e) => e.path);
}

export async function fetchFileContents(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  paths: string[]
): Promise<Map<string, string>> {
  const MAX_TOTAL_SIZE = 200_000;
  const result = new Map<string, string>();
  let totalSize = 0;

  for (const path of paths) {
    if (totalSize >= MAX_TOTAL_SIZE) break;
    const res = await githubFetch(
      token,
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`
    );
    if (!res.ok) continue;
    const data = await res.json();
    if (data.encoding !== "base64" || !data.content) continue;
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    const trimmed = content.slice(0, MAX_TOTAL_SIZE - totalSize);
    result.set(path, trimmed);
    totalSize += trimmed.length;
  }

  return result;
}

function findConfigFile(paths: string[]): string | null {
  for (const cfg of CONFIG_FILES) {
    if (paths.includes(cfg)) return cfg;
  }
  return null;
}

export async function buildCodeContext(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  topic: string,
  apiKey: string
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");

  const tree = await fetchRepoTree(token, owner, repo, branch);

  const contextFiles: string[] = [];
  const readmePath = tree.find(
    (p) => p.toLowerCase() === "readme.md" || p.toLowerCase() === "readme"
  );
  if (readmePath) contextFiles.push(readmePath);
  const configPath = findConfigFile(tree);
  if (configPath) contextFiles.push(configPath);

  const contextData = await fetchFileContents(
    token, owner, repo, branch, contextFiles
  );

  const readmeContent = readmePath ? contextData.get(readmePath) || "" : "";

  const client = new Anthropic({ apiKey });
  const selectionResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: codeFileSelectionPrompt(topic, tree, readmeContent),
    messages: [{ role: "user", content: "Select the most relevant files." }],
  });

  const selectionText = selectionResponse.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");

  let selectedPaths: string[];
  try {
    const cleaned = selectionText.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    selectedPaths = JSON.parse(cleaned);
  } catch {
    selectedPaths = tree.slice(0, 20);
  }

  const validPaths = selectedPaths.filter((p) => tree.includes(p));
  const fileContents = await fetchFileContents(
    token, owner, repo, branch, validPaths
  );

  let result = `## Repository: ${owner}/${repo} (${branch})\n\n`;
  for (const [path, content] of contextData) {
    if (!validPaths.includes(path)) {
      const ext = path.split(".").pop() || "";
      result += `### File: ${path}\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
    }
  }
  for (const [path, content] of fileContents) {
    const ext = path.split(".").pop() || "";
    result += `### File: ${path}\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
  }

  return result;
}

function codeFileSelectionPrompt(
  topic: string,
  tree: string[],
  readme: string
): string {
  const treeList = tree.slice(0, 2000).join("\n");
  return `You are a code analyst. Given a repository file tree, a README, and a discussion topic, select the 20-30 most relevant files that would provide useful context for an intellectual debate about the topic.

Focus on:
- Files directly related to the topic's domain (e.g., auth files for auth topics)
- Core architecture files (main entry points, config, key modules)
- Skip test files, generated files, and boilerplate unless directly relevant

Return ONLY a JSON array of file paths. No explanation.

## Topic
${topic}

## README
${readme || "(no README found)"}

## File Tree
${treeList}`;
}
