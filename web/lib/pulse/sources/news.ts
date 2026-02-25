import { RawSignal } from "../types";
import Parser from "rss-parser";

const MOVEMENT_KEYWORDS = [
  "protest",
  "movement",
  "activism",
  "rally",
  "march",
  "boycott",
  "strike",
  "uprising",
  "revolution",
  "solidarity",
];

const RSS_FEEDS = [
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", publisher: "BBC" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", publisher: "Al Jazeera" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", publisher: "NYT" },
];

function isMovementRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return MOVEMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

interface NewsdataArticle {
  article_id: string;
  title: string;
  description: string;
  link: string;
  source_id: string;
  pubDate: string;
}

async function fetchNewsdata(): Promise<RawSignal[]> {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return [];

  const res = await fetch(
    `https://newsdata.io/api/1/latest?apikey=${key}&q=protest OR movement OR activism&language=en&category=politics`
  );
  if (!res.ok) return [];

  const json = await res.json();
  const articles: NewsdataArticle[] = json.results ?? [];

  return articles.map((a) => ({
    source: "news" as const,
    sourceId: a.article_id,
    title: a.title,
    content: (a.description ?? "").slice(0, 500),
    url: a.link,
    metadata: {
      publisher: a.source_id,
      pubDate: a.pubDate,
    },
  }));
}

async function fetchRss(): Promise<RawSignal[]> {
  const parser = new Parser();
  const signals: RawSignal[] = [];

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      return { items: parsed.items, publisher: feed.publisher };
    })
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { items, publisher } = result.value;

    for (const item of items) {
      const text = `${item.title ?? ""} ${item.contentSnippet ?? ""}`;
      if (!isMovementRelated(text)) continue;

      signals.push({
        source: "news",
        sourceId: item.guid ?? item.link ?? "",
        title: item.title ?? "",
        content: (item.contentSnippet ?? "").slice(0, 500),
        url: item.link ?? "",
        metadata: {
          publisher,
          pubDate: item.pubDate,
        },
      });
    }
  }

  return signals;
}

export async function fetchSignals(): Promise<RawSignal[]> {
  try {
    const results = await Promise.allSettled([fetchNewsdata(), fetchRss()]);
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  } catch {
    return [];
  }
}
