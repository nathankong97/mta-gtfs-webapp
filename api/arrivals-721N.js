// api/arrivals-721N.js
// Purpose: List all incoming Manhattan-bound trains to Vernon Blvd–Jackson Av (stopId=721N)
// Stack: Vercel Node runtime (ESM) + gtfs-realtime-bindings (protobuf decode)

import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export const config = { runtime: "nodejs" }; // protobuf needs Node runtime

// ---- Settings (tweak as you like) ----
const FEED_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs";
const ALLOWED_ROUTES = new Set(["7", "7X"]);
const TARGET_STOP = "721S";           // Vernon Blvd–Jackson Av (Manhattan-bound)
const HORIZON_MIN = 30;               // show arrivals within this many minutes

// ---- Helpers ----
const fmtNY = (sec) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(sec * 1000));

function whereNowFromTripUpdate(tu, nowSec) {
  const stus = Array.isArray(tu.stopTimeUpdate) ? tu.stopTimeUpdate : [];
  if (stus.length === 0) return { kind: "unknown" };

  let prev = null;
  for (const s of stus) {
    const arr = s?.arrival?.time != null ? Number(s.arrival.time) : null;
    const dep = s?.departure?.time != null ? Number(s.departure.time) : arr;

    // If we're before this stop's arrival, we're between prev -> this
    if (arr != null && nowSec < arr) {
      return { kind: "between", from: prev?.stopId || null, to: s.stopId || null };
    }
    // If we're within dwell window, we're at the stop
    if (arr != null && dep != null && nowSec >= arr && nowSec <= dep) {
      return { kind: "at", stop: s.stopId || null };
    }
    prev = s;
  }
  // Passed all listed stops
  return { kind: "past", last: prev?.stopId || null };
}

// ---- Handler ----
export default async function handler(req, res) {
  try {
    const r = await fetch(FEED_URL);
    if (!r.ok) {
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res
        .status(200)
        .send(
          `<p class="contrast">Feed fetch failed (${r.status} ${r.statusText}).</p>`
        );
    }

    const buf = Buffer.from(await r.arrayBuffer());
    const TR = GtfsRealtimeBindings.transit_realtime;
    const feed = TR.FeedMessage.decode(buf);

    // Header timestamp (service time), NY display
    let headerTs = null;
    const rawTs = feed.header && feed.header.timestamp;
    if (rawTs && typeof rawTs.toNumber === "function") headerTs = rawTs.toNumber();
    else if (rawTs != null) headerTs = Number(rawTs);

    const nowSec = Math.floor(Date.now() / 1000);
    const horizonSec = HORIZON_MIN * 60;

    const rowsRaw = [];
    for (const e of feed.entity) {
      const tu = e.tripUpdate;
      if (!tu) continue;

      const trip = tu.trip || {};
      const routeId = trip.routeId;
      if (!routeId || !ALLOWED_ROUTES.has(routeId)) continue;

      const stus = Array.isArray(tu.stopTimeUpdate) ? tu.stopTimeUpdate : [];

      // Find the target stop (721N) in this TripUpdate
      let idx = -1;
      for (let i = 0; i < stus.length; i++) {
        if (stus[i].stopId === TARGET_STOP) {
          idx = i;
          break;
        }
      }
      if (idx === -1) continue;

      const target = stus[idx];
      const arrT =
        target?.arrival?.time != null ? Number(target.arrival.time) : null;
      const depT =
        target?.departure?.time != null ? Number(target.departure.time) : null;
      const t = arrT != null ? arrT : depT != null ? depT : null;
      if (t == null) continue;

      const etaSec = t - nowSec;
      // Drop stale arrivals (< -60s) and far futures (> horizon)
      if (etaSec < -60 || etaSec > horizonSec) continue;

      // Where is the train *now* (approx.), from the full timeline
      const pos = whereNowFromTripUpdate(tu, nowSec);
      let whereText = "—";
      if (pos.kind === "at") whereText = `At ${pos.stop || "?"}`;
      else if (pos.kind === "between") whereText = `${pos.from || "—"} → ${pos.to || "—"}`;
      else if (pos.kind === "past") whereText = `Past ${pos.last || "?"}`;

      const status = etaSec <= 15 ? "Arriving" : "En-route";

      rowsRaw.push({
        routeId,
        tripId: trip.tripId || "—",
        when: t,
        etaSec,
        etaClock: fmtNY(t),
        whereText,
        status,
      });
    }

    // Dedupe by tripId (keep earliest arrival to 721N), then sort by ETA
    const earliestByTrip = new Map();
    for (const r of rowsRaw) {
      const prev = earliestByTrip.get(r.tripId);
      if (!prev || r.when < prev.when) earliestByTrip.set(r.tripId, r);
    }
    const rows = Array.from(earliestByTrip.values()).sort((a, b) => a.when - b.when);

    const body =
      rows.length === 0
        ? `<tr><td colspan="6">No Manhattan-bound arrivals to 721N within ${HORIZON_MIN} minutes.</td></tr>`
        : rows
            .map(
              (r) => `<tr>
                <td>${r.routeId}</td>
                <td>${r.tripId}</td>
                <td>${r.whereText}</td>
                <td>${Math.max(0, Math.round(r.etaSec / 60))} min</td>
                <td>${r.etaClock}</td>
                <td>${r.status}</td>
              </tr>`
            )
            .join("");

    const html = `
      <h3>Arrivals to Vernon Blvd–Jackson Av (721N) — 7 / 7X</h3>
      <p class="contrast">
        Updated ${fmtNY(nowSec)} • Feed ts ${headerTs ? fmtNY(headerTs) : "—"} • Window ${HORIZON_MIN} min
      </p>
      <table role="grid">
        <thead>
          <tr><th>Route</th><th>Trip</th><th>Where now</th><th>ETA</th><th>ETA (clock)</th><th>Status</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    res.status(500).send(`<pre>Server error:\n${String(err)}</pre>`);
  }
}
