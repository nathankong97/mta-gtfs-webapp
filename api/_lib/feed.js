// api/_lib/feed.js
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const FEED_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs";
const TTL_MS = 15_000; // cache for 15s (covers double-taps, quick reloads)

let cache = {
  buf: null,
  feed: null,
  fetchedAt: 0,   // Date.now()
};

export async function getFeedDecoded() {
  const now = Date.now();
  if (cache.feed && now - cache.fetchedAt < TTL_MS) {
    return { feed: cache.feed, fetchedAt: cache.fetchedAt };
  }

  const r = await fetch(FEED_URL);
  if (!r.ok) throw new Error(`Feed fetch failed: ${r.status} ${r.statusText}`);

  const buf = Buffer.from(await r.arrayBuffer());
  const TR = GtfsRealtimeBindings.transit_realtime;
  const feed = TR.FeedMessage.decode(buf);

  cache = { buf, feed, fetchedAt: now };
  return { feed, fetchedAt: now };
}
