// api/gtfs7-json-full.js
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export const config = { runtime: "nodejs" }; // protobuf requires Node runtime, not Edge

// Fallback deep-normalizer for Longs if toObject() isn't available:
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    // Long from protobufjs has toNumber()
    if (typeof value.toNumber === "function") return value.toNumber();
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
}

export default async function handler(req, res) {
  const url = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs";
  try {
    const r = await fetch(url);
    const buf = Buffer.from(await r.arrayBuffer());
    const TR = GtfsRealtimeBindings.transit_realtime;
    const msg = TR.FeedMessage.decode(buf);

    // Prefer protobufjs' built-in conversion if present; otherwise, deep-normalize
    let json;
    if (typeof TR.FeedMessage.toObject === "function") {
      json = TR.FeedMessage.toObject(msg, {
        longs: Number, // convert int64/uint64 Longs → Number
        enums: String, // enums as strings (optional)
        bytes: String, // bytes as base64 (optional)
      });
    } else {
      json = normalize(msg);
    }

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).send(JSON.stringify(json));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
