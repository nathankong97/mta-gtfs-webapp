// api/nearest.js
// Usage: /api/nearest?lat=40.74&lon=-73.95&limit=3
import { listStopsForSeven, lookupStop } from "./_lib/stops.js";

export const config = { runtime: "nodejs" };

const R = 6371000; // meters
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const lat = parseFloat(url.searchParams.get("lat") || "");
    const lon = parseFloat(url.searchParams.get("lon") || "");
    const limit = Math.min(
      10,
      Math.max(1, parseInt(url.searchParams.get("limit") || "3", 10))
    );

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.setHeader("content-type", "text/html; charset=utf-8");
      return res
        .status(200)
        .send(
          `<p class="contrast">Pass coordinates like <code>/api/nearest?lat=40.7426&lon=-73.9536</code></p>`
        );
    }

    const stops = await listStopsForSeven();
    // Score by distance
    const scored = stops
      .map((s) => ({
        ...s,
        dist: haversine(lat, lon, s.lat, s.lon),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit);

    // Build HTML with quick actions (N/S if available)
    const rows =
      scored.length === 0
        ? `<p>No 7/7X stops found.</p>`
        : await Promise.all(
            scored.map(async (s) => {
              const name = s.name;
              const distM = Math.round(s.dist);
              const nId = s.variants.N || `${s.idBase}N`;
              const sId = s.variants.S || `${s.idBase}S`;
              return `
            <div class="nearby-item">
              <div class="nearby-title">
                <strong>${name}</strong>
                <small>${distM} m away</small>
              </div>
              <div class="nearby-actions">
                <button class="secondary outline btn-sm"
                  hx-get="/api/arrivals?stopId=${encodeURIComponent(
                    nId
                  )}&horizonMin=30"
                  hx-target="#arrivals" hx-swap="innerHTML">View N</button>
                <button class="secondary outline btn-sm"
                  hx-get="/api/arrivals?stopId=${encodeURIComponent(
                    sId
                  )}&horizonMin=30"
                  hx-target="#arrivals" hx-swap="innerHTML">View S</button>
              </div>
            </div>`;
            })
          ).then((arr) => arr.join(""));

    const html = `
      <h3>Nearest 7/7X Stations</h3>
      <p class="contrast">From: ${lat.toFixed(5)}, ${lon.toFixed(5)}</p>
      <div class="table-wrap">
        <table role="grid">
          <thead><tr><th>Station</th><th>Distance</th><th colspan="2">Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    res.status(500).send(`<pre>Server error:\n${String(err)}</pre>`);
  }
}
