import { RawSignal } from "@/lib/pulse/types";

const MOVEMENT_KEYWORDS = [
  "protest",
  "movement",
  "revolution",
  "uprising",
  "strike",
  "boycott",
  "march",
  "rally",
  "activism",
];

function isMovementRelated(title: string): boolean {
  const lower = title.toLowerCase();
  return MOVEMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

interface PageviewArticle {
  article: string;
  views: number;
  rank: number;
}

interface RecentChange {
  title: string;
  timestamp: string;
  user: string;
}

async function fetchPageviews(): Promise<RawSignal[]> {
  const date = getYesterday();
  const res = await fetch(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${date}`
  );
  if (!res.ok) return [];

  const json = await res.json();
  const articles: PageviewArticle[] = json.items?.[0]?.articles ?? [];

  return articles
    .filter((a) => isMovementRelated(a.article))
    .map((a) => ({
      source: "wikipedia" as const,
      sourceId: a.article,
      title: a.article.replace(/_/g, " "),
      content: `Wikipedia article with ${a.views.toLocaleString()} views yesterday (ranked #${a.rank} overall). High view count suggests significant public interest.`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
      metadata: { views: a.views, rank: a.rank },
    }));
}

async function fetchRecentChanges(): Promise<RawSignal[]> {
  const res = await fetch(
    "https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcnamespace=0&rclimit=50&rctype=new&rcprop=title|timestamp|user&format=json"
  );
  if (!res.ok) return [];

  const json = await res.json();
  const changes: RecentChange[] = json.query?.recentchanges ?? [];

  return changes
    .filter((c) => isMovementRelated(c.title))
    .map((c) => ({
      source: "wikipedia" as const,
      sourceId: c.title,
      title: c.title,
      content: `New Wikipedia page created at ${c.timestamp} by ${c.user}. New page creation often signals emerging public awareness.`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(c.title)}`,
      metadata: { type: "new_page", timestamp: c.timestamp },
    }));
}

export async function fetchSignals(): Promise<RawSignal[]> {
  try {
    const results = await Promise.allSettled([
      fetchPageviews(),
      fetchRecentChanges(),
    ]);
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  } catch {
    return [];
  }
}
