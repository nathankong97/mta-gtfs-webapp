// api/arrivals-721N.js
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export const config = { runtime: "nodejs" }; // protobuf decode

const ALLOWED = new Set(["7", "7X"]);
const TARGET_STOP = "721S"; // Vernon Blvd–Jackson Av, Manhattan-bound

const fmtNY = (sec) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(sec * 1000));

function whereNowFromTripUpdate(tu, nowSec) {
  const stus = tu.stopTimeUpdate || [];
  if (stus.length === 0) return { kind: "unknown" };

  let prev = null;
  for (const s of stus) {
    const arr =
      s.arrival && typeof s.arrival.time !== "undefined"
        ? Number(s.arrival.time)
        : null;
    const dep =
      s.departure && typeof s.departure.time !== "undefined"
        ? Number(s.departure.time)
        : arr;

    // If we’re before this stop’s arrival, we’re between prev -> this
    if (arr != null && nowSec < arr) {
      return {
        kind: "between",
        from: prev ? prev.stopId || null : null,
        to: s.stopId || null,
      };
    }
    // If we’re within its dwell window, we’re at that stop
    if (arr != null && dep != null && nowSec >= arr && nowSec <= dep) {
      return { kind: "at", stop: s.stopId || null };
    }
    prev = s;
  }
  // We’ve passed all listed stops (likely near/after terminal)
  return { kind: "past", last: prev ? prev.stopId || null : null };
}

export default async function handler(req, res) {
  const url =
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs";

  try {
    const r = await fetch(url);
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

    const nowSec = Math.floor(Date.now() / 1000);
    const horizonSec = 30 * 60; // show trains arriving within 30 min
    const pos = whereNowFromTripUpdate(tu, nowSec);
    let whereText = "—";
    if (pos.kind === "at") whereText = `At ${pos.stop || "?"}`;
    else if (pos.kind === "between")
      whereText = `${pos.from || "—"} → ${pos.to || "—"}`;
    else if (pos.kind === "past") whereText = `Past ${pos.last || "?"}`;
    const rowsRaw = [];
    for (const e of feed.entity) {
      const tu = e.tripUpdate;
      if (!tu) continue;

      const trip = tu.trip || {};
      const ru = trip.routeId;
      if (!ru || !ALLOWED.has(ru)) continue;

      const stus = tu.stopTimeUpdate || [];
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
        target.arrival && typeof target.arrival.time !== "undefined"
          ? Number(target.arrival.time)
          : null;
      const depT =
        target.departure && typeof target.departure.time !== "undefined"
          ? Number(target.departure.time)
          : null;

      // Choose the earliest defined timestamp for that stop (arrival preferred).
      const t = arrT != null ? arrT : depT != null ? depT : null;
      if (t == null) continue;

      const etaSec = t - nowSec;
      if (etaSec < -60 || etaSec > horizonSec) continue; // ignore stale/too far

      const prevStopId = idx > 0 ? stus[idx - 1].stopId || null : null;
      const status = etaSec <= 15 ? "Arriving" : "En-route";

      rowsRaw.push({
        t,
        etaSec,
        routeId: ru,
        tripId: trip.tripId || "—",
        from: prevStopId || "—", // keep as context to target
        to: TARGET_STOP,
        whereText,
        status,
      });
    }

    // Dedupe by tripId (keep earliest arrival) and sort by ETA
    const bestByTrip = new Map();
    for (const r of rowsRaw) {
      const prev = bestByTrip.get(r.tripId);
      if (!prev || r.t < prev.t) bestByTrip.set(r.tripId, r);
    }
    const rows = Array.from(bestByTrip.values())
      .sort((a, b) => a.t - b.t)
      .slice(0, 30);

    const body =
      rows.length === 0
        ? `<tr><td colspan="7">No Manhattan-bound arrivals to 721N within 30 minutes.</td></tr>`
        : rows
            .map(
              (r) =>
                `<tr>
              <td>${r.routeId}</td>
              <td>${r.tripId}</td>
              <td>${r.whereText}</td>
              <td>${r.from} → ${r.to}</td>
              <td>${Math.max(0, Math.round(r.etaSec / 60))} min</td>
              <td>${fmtNY(r.t)}</td>
              <td>${r.status}</td>
            </tr>`
            )
            .join("");

    const html = `
  <h3>Arrivals to Vernon Blvd–Jackson Av (721N) — 7 / 7X</h3>
  <p class="contrast">Window: next 30 min • Updated ${fmtNY(nowSec)}</p>
  <table role="grid">
    <thead>
      <tr>
        <th>Route</th><th>Trip</th><th>Where now</th><th>Segment to target</th>
        <th>ETA</th><th>ETA (clock)</th><th>Status</th>
      </tr>
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
