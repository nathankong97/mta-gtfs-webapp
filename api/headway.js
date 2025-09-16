// api/headway.js
// Usage: /api/headway?stopId=721S&horizonMin=45
import { getFeedDecoded } from "./_lib/feed.js";
import { lookupStop } from "./_lib/stops.js";

export const config = { runtime: "nodejs" };

const ALLOWED_ROUTES = new Set(["7", "7X"]);

const fmtNY = (sec) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(sec * 1000));

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default async function handler(req, res) {
  // Parse query
  const urlObj = new URL(req.url, "http://localhost");
  const stopId = (urlObj.searchParams.get("stopId") || "721S").toUpperCase().trim();
  const horizonMinRaw = parseInt(urlObj.searchParams.get("horizonMin") || "45", 10);
  const HORIZON_MIN = Number.isFinite(horizonMinRaw) ? Math.max(10, Math.min(horizonMinRaw, 90)) : 45;

  try {
    const { feed, fetchedAt } = await getFeedDecoded();

    // Header timestamp
    let headerTs = null;
    const rawTs = feed.header && feed.header.timestamp;
    if (rawTs && typeof rawTs.toNumber === "function") headerTs = rawTs.toNumber();
    else if (rawTs != null) headerTs = Number(rawTs);

    const nowSec = Math.floor(Date.now() / 1000);
    const horizonSec = HORIZON_MIN * 60;

    // Collect arrivals for this stop within window, dedupe by tripId (keep earliest)
    const bestByTrip = new Map();
    for (const e of feed.entity) {
      const tu = e.tripUpdate;
      if (!tu) continue;

      const trip = tu.trip || {};
      const routeId = trip.routeId;
      if (!routeId || !ALLOWED_ROUTES.has(routeId)) continue;

      const stus = Array.isArray(tu.stopTimeUpdate) ? tu.stopTimeUpdate : [];
      for (let i = 0; i < stus.length; i++) {
        const s = stus[i];
        if ((s.stopId || "").toUpperCase() !== stopId) continue;

        const arrT = s?.arrival?.time != null ? Number(s.arrival.time) : null;
        const depT = s?.departure?.time != null ? Number(s.departure.time) : null;
        const t = arrT != null ? arrT : (depT != null ? depT : null);
        if (t == null) continue;

        const etaSec = t - nowSec;
        if (etaSec < -60 || etaSec > horizonSec) continue;

        const key = trip.tripId || `UNK-${Math.random().toString(36).slice(2)}`;
        const prev = bestByTrip.get(key);
        if (!prev || t < prev.t) bestByTrip.set(key, { routeId, t });
        break; // found target stop for this trip; no need to scan further
      }
    }

    // Sorted arrival times
    const arrivals = Array.from(bestByTrip.values()).sort((a, b) => a.t - b.t);
    const times = arrivals.map((r) => r.t);

    // Headways (minutes) between consecutive times
    const deltasMin = [];
    for (let i = 1; i < times.length; i++) {
      deltasMin.push((times[i] - times[i - 1]) / 60);
    }

    // Nearest future pair headway (next two trains after "now")
    let nextHeadwayMin = null;
    const firstFutureIdx = times.findIndex((t) => t >= nowSec);
    if (firstFutureIdx >= 0 && firstFutureIdx + 1 < times.length) {
      nextHeadwayMin = (times[firstFutureIdx + 1] - times[firstFutureIdx]) / 60;
    }

    // Labels
    const stopInfo = await lookupStop(stopId);
    const stopLabel = stopInfo ? `${stopInfo.name}${/[NSEW]$/.test(stopId) ? ` (${stopId.slice(-1)})` : ""}` : stopId;

    const ageSec = Math.round((Date.now() - fetchedAt) / 1000);
    const statsHtml = `
      <ul>
        <li><strong>Next headway:</strong> ${nextHeadwayMin != null ? `${nextHeadwayMin.toFixed(1)} min` : "—"}</li>
        <li><strong>Mean headway:</strong> ${mean(deltasMin) != null ? `${mean(deltasMin).toFixed(1)} min` : "—"}</li>
        <li><strong>Median headway:</strong> ${median(deltasMin) != null ? `${median(deltasMin).toFixed(1)} min` : "—"}</li>
      </ul>
    `;

    const listHtml =
      arrivals.length === 0
        ? `<p>No arrivals within ${HORIZON_MIN} min.</p>`
        : `<ol>${arrivals
            .slice(0, 12)
            .map((r) => `<li>${r.routeId} — ${fmtNY(r.t)} (${Math.max(0, Math.round((r.t - nowSec) / 60))} min)</li>`)
            .join("")}</ol>`;

    const html = `
      <h3>Headway — ${stopLabel}</h3>
      <p class="contrast">Updated ${fmtNY(nowSec)} • Feed ts ${headerTs ? fmtNY(headerTs) : "—"} • Source age ${ageSec}s • Window ${HORIZON_MIN} min</p>
      ${statsHtml}
      <h4>Next arrivals</h4>
      ${listHtml}
    `;

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    res.status(500).send(`<pre>Server error:\n${String(err)}</pre>`);
  }
}
