import { RawSignal } from "@/lib/pulse/types";

const SEARCH_TERMS = [
  "protest movement",
  "activism",
  "grassroots organizing",
  "social movement",
];

interface BlueskyPost {
  uri: string;
  author: { handle: string };
  record: { text: string };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  indexedAt?: string;
}

async function searchTerm(term: string): Promise<BlueskyPost[]> {
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(term)}&limit=25`
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.posts ?? [];
}

export async function fetchSignals(): Promise<RawSignal[]> {
  try {
    const results = await Promise.allSettled(SEARCH_TERMS.map(searchTerm));
    const allPosts = results.flatMap((r) =>
      r.status === "fulfilled" ? r.value : []
    );

    const seen = new Set<string>();
    const signals: RawSignal[] = [];

    for (const post of allPosts) {
      if (seen.has(post.uri)) continue;
      seen.add(post.uri);

      const engagement = (post.likeCount ?? 0) + (post.repostCount ?? 0) + (post.replyCount ?? 0);
      if (engagement < 5) continue;

      const rkey = post.uri.split("/").pop() ?? "";
      signals.push({
        source: "bluesky",
        sourceId: post.uri,
        title: post.record.text.slice(0, 100),
        content: post.record.text,
        url: `https://bsky.app/profile/${post.author.handle}/post/${rkey}`,
        metadata: {
          author: post.author.handle,
          likeCount: post.likeCount,
          repostCount: post.repostCount,
          replyCount: post.replyCount,
          indexedAt: post.indexedAt,
        },
      });
    }

    return signals;
  } catch {
    return [];
  }
}
