import { RawSignal } from "../types";

const HASHTAGS = ["protest", "activism", "solidarity", "movement"];

const MOVEMENT_KEYWORDS = [
  "protest",
  "activism",
  "solidarity",
  "movement",
  "march",
  "rally",
  "boycott",
  "strike",
  "rights",
  "justice",
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

interface MastodonTag {
  name: string;
  history: { uses: string }[];
}

interface MastodonStatus {
  id: string;
  content: string;
  url: string;
  account: { acct: string };
  favourites_count: number;
  reblogs_count: number;
  replies_count: number;
}

async function fetchTrendingTags(): Promise<string[]> {
  const res = await fetch("https://mastodon.social/api/v1/trends/tags");
  if (!res.ok) return [];

  const tags: MastodonTag[] = await res.json();
  return tags
    .filter((t) =>
      MOVEMENT_KEYWORDS.some((kw) => t.name.toLowerCase().includes(kw))
    )
    .map((t) => t.name);
}

async function fetchHashtagTimeline(hashtag: string): Promise<RawSignal[]> {
  const res = await fetch(
    `https://mastodon.social/api/v1/timelines/tag/${hashtag}?limit=20`
  );
  if (!res.ok) return [];

  const statuses: MastodonStatus[] = await res.json();

  return statuses
    .filter((s) => (s.favourites_count + s.reblogs_count + s.replies_count) >= 3)
    .map((s) => {
      const text = stripHtml(s.content);
      return {
        source: "mastodon" as const,
        sourceId: s.id,
        title: text.slice(0, 100),
        content: text,
        url: s.url,
        metadata: {
          account: s.account.acct,
          favouritesCount: s.favourites_count,
          reblogsCount: s.reblogs_count,
          repliesCount: s.replies_count,
        },
      };
    });
}

export async function fetchSignals(): Promise<RawSignal[]> {
  try {
    const trendingTags = await fetchTrendingTags();
    const allTags = [...new Set([...HASHTAGS, ...trendingTags])];

    const results = await Promise.allSettled(allTags.map(fetchHashtagTimeline));
    const signals = results.flatMap((r) =>
      r.status === "fulfilled" ? r.value : []
    );

    const seen = new Set<string>();
    return signals.filter((s) => {
      if (seen.has(s.sourceId)) return false;
      seen.add(s.sourceId);
      return true;
    });
  } catch {
    return [];
  }
}
