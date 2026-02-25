import { RawSignal } from "../types";

const SUBREDDITS = [
  "activism",
  "protest",
  "worldnews",
  "environment",
  "labor",
  "climate",
  "climatechange",
  "progressive",
  "grassroots",
];

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  permalink: string;
  score: number;
  num_comments: number;
  upvote_ratio: number;
  subreddit: string;
}

async function fetchSubreddit(subreddit: string): Promise<RawSignal[]> {
  const res = await fetch(
    `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`,
    { headers: { "User-Agent": "web:pulse-movement-detector:v1.0 (movement research tool)" } }
  );
  if (!res.ok) return [];

  const json = await res.json();
  const posts: RedditPost[] = json.data.children.map(
    (c: { data: RedditPost }) => c.data
  );

  return posts
    .filter((p) => p.score > 50 || p.num_comments > 20)
    .map((p) => ({
      source: "reddit" as const,
      sourceId: `t3_${p.id}`,
      title: p.title,
      content: p.selftext.slice(0, 500),
      url: `https://reddit.com${p.permalink}`,
      metadata: {
        subreddit: p.subreddit,
        score: p.score,
        numComments: p.num_comments,
        upvoteRatio: p.upvote_ratio,
      },
    }));
}

export async function fetchSignals(): Promise<RawSignal[]> {
  try {
    const results = await Promise.allSettled(
      SUBREDDITS.map(fetchSubreddit)
    );
    const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

    const seen = new Set<string>();
    return all.filter((s) => {
      if (seen.has(s.sourceId)) return false;
      seen.add(s.sourceId);
      return true;
    });
  } catch {
    return [];
  }
}
