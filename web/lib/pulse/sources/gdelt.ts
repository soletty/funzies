import { RawSignal } from "@/lib/pulse/types";

const GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=protest OR rally OR grassroots OR activism OR march OR boycott OR movement&mode=ArtList&maxrecords=75&format=json&timespan=60min";

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language: string;
  socialimage: string;
}

export async function fetchSignals(): Promise<RawSignal[]> {
  try {
    const res = await fetch(GDELT_URL);
    if (!res.ok) return [];

    const json = await res.json();
    const articles: GdeltArticle[] = json.articles ?? [];

    return articles.map((a) => ({
      source: "gdelt" as const,
      sourceId: a.url,
      title: a.title,
      content: `Source: ${a.domain}. Published: ${a.seendate}`,
      url: a.url,
      metadata: {
        domain: a.domain,
        language: a.language,
        seendate: a.seendate,
      },
    }));
  } catch {
    return [];
  }
}
