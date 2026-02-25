import { RawSignal } from "@/lib/pulse/types";
import { fetchSignals as fetchReddit } from "./reddit";
import { fetchSignals as fetchGdelt } from "./gdelt";
import { fetchSignals as fetchBluesky } from "./bluesky";
import { fetchSignals as fetchWikipedia } from "./wikipedia";
import { fetchSignals as fetchNews } from "./news";
import { fetchSignals as fetchMastodon } from "./mastodon";

const sources = [
  { name: "reddit", fetch: fetchReddit },
  { name: "gdelt", fetch: fetchGdelt },
  { name: "bluesky", fetch: fetchBluesky },
  { name: "wikipedia", fetch: fetchWikipedia },
  { name: "news", fetch: fetchNews },
  { name: "mastodon", fetch: fetchMastodon },
];

export async function fetchAllSignals(): Promise<RawSignal[]> {
  const results = await Promise.allSettled(
    sources.map((s) => s.fetch())
  );

  const signals: RawSignal[] = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      signals.push(...result.value);
    } else {
      console.error(`[Pulse] ${sources[i].name} failed:`, result.reason);
    }
  });

  return signals;
}
