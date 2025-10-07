// api/arrivals.js
// Usage: /api/arrivals?stopId=721S&horizonMin=30
// Default: stopId=721S (Vernon Blvd–Jackson Av, Queens-bound), horizonMin=30

import { getFeedDecoded } from "./_lib/feed.js";
import { lookupStop } from "./_lib/stops.js";

export const config = { runtime: "nodejs" };

const FEED_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs";
const ALLOWED_ROUTES = new Set(["7", "7X"]);

const fmtNY = (sec) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(sec * 1000));

async function labelStop(stopId) {
  if (!stopId) return "—";
  const info = await lookupStop(stopId);
  if (!info) return stopId; // fallback to raw id
  // Preserve direction suffix if present (e.g., 721S)
  const suffix = /[NSEW]$/.test(stopId) ? ` (${stopId.slice(-1)})` : "";
  // For now, we don't need the suffix - S/N;
  // return `${info.name}${suffix}`;
  return info.name;
}

function whereNowFromTripUpdate(tu, nowSec) {
  const stus = Array.isArray(tu.stopTimeUpdate) ? tu.stopTimeUpdate : [];
  if (stus.length === 0) return { kind: "unknown" };

  let prev = null;
  for (const s of stus) {
    const arr = s?.arrival?.time != null ? Number(s.arrival.time) : null;
    const dep = s?.departure?.time != null ? Number(s.departure.time) : arr;

    if (arr != null && nowSec < arr) {
      return {
        kind: "between",
        from: prev?.stopId || null,
        to: s.stopId || null,
      };
    }
    if (arr != null && dep != null && nowSec >= arr && nowSec <= dep) {
      return { kind: "at", stop: s.stopId || null };
    }
    prev = s;
  }
  return { kind: "past", last: prev?.stopId || null };
}

export default async function handler(req, res) {
  // Parse query
  const urlObj = new URL(req.url, "http://localhost");
  let stopId = (urlObj.searchParams.get("stopId") || "721S")
    .toUpperCase()
    .trim();
  const horizonMinRaw = parseInt(
    urlObj.searchParams.get("horizonMin") || "30",
    10
  );
  const HORIZON_MIN = Number.isFinite(horizonMinRaw)
    ? Math.max(5, Math.min(horizonMinRaw, 60))
    : 30;

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

    const { feed, fetchedAt } = await getFeedDecoded();

    // Pull header timestamp if present
    let headerTs = null;
    const rawTs = feed.header && feed.header.timestamp;
    if (rawTs && typeof rawTs.toNumber === "function") {
      headerTs = rawTs.toNumber();
    } else if (rawTs != null) {
      headerTs = Number(rawTs);
    }

    // Now compute age (prefer server timestamp; fallback to cache timestamp)
    const nowSec = Math.floor(Date.now() / 1000);
    let ageSec = 0;
    if (headerTs) {
      ageSec = Math.max(0, nowSec - headerTs);
    } else if (fetchedAt) {
      ageSec = Math.max(0, Math.round((Date.now() - fetchedAt) / 1000));
    }
    const horizonSec = HORIZON_MIN * 60;

    // 1) Build vehicle map by tripId (route-filtered to 7/7X)
    const vehicleByTripId = new Map();
    for (const e of feed.entity) {
      const v = e.vehicle;
      if (!v) continue;
      const trip = v.trip || {};
      const routeId = trip.routeId;
      if (!routeId || !ALLOWED_ROUTES.has(routeId)) continue;

      const tripId = trip.tripId || null;
      if (!tripId) continue;

      // Current status enums from GTFS-RT: IN_TRANSIT_TO=0, STOPPED_AT=1, INCOMING_AT=2 (protobufjs gives numeric)
      const statusNum =
        typeof v.currentStatus === "number" ? v.currentStatus : null;
      const statusName =
        statusNum === 1
          ? "STOPPED_AT"
          : statusNum === 2
          ? "INCOMING_AT"
          : statusNum === 0
          ? "IN_TRANSIT_TO"
          : "UNKNOWN";

      vehicleByTripId.set(tripId, {
        statusNum,
        statusName,
        stopId: v.stopId || null,
        currentStopSequence:
          v.currentStopSequence != null ? Number(v.currentStopSequence) : null,
        lat: v.position?.latitude ?? null,
        lon: v.position?.longitude ?? null,
        timestamp:
          v.timestamp && typeof v.timestamp.toNumber === "function"
            ? v.timestamp.toNumber()
            : v.timestamp != null
            ? Number(v.timestamp)
            : null,
      });
    }

    // 2) Build arrivals rows from TripUpdates to the requested stopId
    const rowsRaw = [];
    for (const e of feed.entity) {
      const tu = e.tripUpdate;
      if (!tu) continue;

      const trip = tu.trip || {};
      const routeId = trip.routeId;
      if (!routeId || !ALLOWED_ROUTES.has(routeId)) continue;

      const stus = Array.isArray(tu.stopTimeUpdate) ? tu.stopTimeUpdate : [];
      let idx = -1;
      for (let i = 0; i < stus.length; i++) {
        if ((stus[i].stopId || "").toUpperCase() === stopId) {
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
      if (etaSec < -60 || etaSec > horizonSec) continue;

      // TripUpdate-based "where now" (fallback)
      const pos = whereNowFromTripUpdate(tu, nowSec);
      let whereText = "—";
      if (pos.kind === "at") {
        whereText = `At ${await labelStop(pos.stop)}`;
      } else if (pos.kind === "between") {
        const fromLbl = await labelStop(pos.from);
        const toLbl = await labelStop(pos.to);
        whereText = `${fromLbl} → ${toLbl}`;
      } else if (pos.kind === "past") {
        whereText = `Past ${await labelStop(pos.last)}`;
      }

      // Overlay VehiclePositions if present (prefer vehicle wording & stop label)
      const veh = trip.tripId ? vehicleByTripId.get(trip.tripId) : null;
      let status = etaSec <= 15 ? "Arriving" : "En-route";
      if (veh) {
        if (veh.statusName === "STOPPED_AT" && veh.stopId) {
          status = `STOPPED_AT ${await labelStop(veh.stopId)}`;
        } else if (veh.statusName === "IN_TRANSIT_TO" && veh.stopId) {
          status = `IN_TRANSIT_TO ${await labelStop(veh.stopId)}`;
        } else if (veh.statusName === "INCOMING_AT" && veh.stopId) {
          status = `INCOMING_AT ${await labelStop(veh.stopId)}`;
        } else {
          status = veh.statusName;
        }
        if (veh.stopId) whereText = `Near ${await labelStop(veh.stopId)}`;
      }

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

    // Dedupe by tripId; keep earliest arrival to this stop
    const earliestByTrip = new Map();
    for (const r of rowsRaw) {
      const prev = earliestByTrip.get(r.tripId);
      if (!prev || r.when < prev.when) earliestByTrip.set(r.tripId, r);
    }
    const rows = Array.from(earliestByTrip.values()).sort(
      (a, b) => a.when - b.when
    );

    const body =
      rows.length === 0
        ? `<tr><td colspan="6">No arrivals to ${stopId} within ${HORIZON_MIN} minutes.</td></tr>`
        : rows
            .map(
              (r) => `
            <tr>
              <td>${r.routeId}</td>
              <td>${r.tripId}</td>
              <td>${r.whereText}</td>
              <td>${Math.max(0, Math.round(r.etaSec / 60))} min</td>
              <td>${r.etaClock}</td>
              <td>${r.status}</td>
            </tr>
          `
            )
            .join("");
    
    let stopName = await labelStop(stopId);
    stopName = stopName.replace(/\(S\)/g, " <small>(Manhattan bound)</small>").replace(/\(N\)/g, " <small>(Queens bound)</small>");

    const html = `
      <h3>Current Station: ${stopName}</h3>
      <p class="contrast">
  Updated ${fmtNY(nowSec)} • Feed ts ${
      headerTs ? fmtNY(headerTs) : "—"
    } • Source age ${ageSec}s • Window ${HORIZON_MIN} min • ${stopId}
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
