// api/_lib/stops.js
import fs from "node:fs/promises";

// Cache across lambda invocations
let _cache = null;

/** Split a CSV line respecting quotes */
function splitCSVLine(line) {
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function loadStopsMap() {
  if (_cache) return _cache;

  // stops.txt lives at project-root/data/stops.txt (relative to this file in api/_lib)
  const path = new URL("../../data/stops.txt", import.meta.url);
  const raw = await fs.readFile(path, "utf8");

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("stops.txt is empty");

  const header = splitCSVLine(lines[0]).map((h) => h.trim());
  const idx = (name) => header.indexOf(name);

  const iId = idx("stop_id");
  const iName = idx("stop_name");
  const iLat = idx("stop_lat");
  const iLon = idx("stop_lon");

  if (iId === -1 || iName === -1) {
    throw new Error("stops.txt missing required columns stop_id/stop_name");
  }

  const byId = new Map();
  for (let li = 1; li < lines.length; li++) {
    const cols = splitCSVLine(lines[li]).map((c) => c.trim());
    const id = cols[iId];
    if (!id) continue;
    const name = cols[iName] || id;
    const lat = iLat !== -1 && cols[iLat] ? Number(cols[iLat]) : null;
    const lon = iLon !== -1 && cols[iLon] ? Number(cols[iLon]) : null;
    byId.set(id.toUpperCase(), { id, name, lat, lon });
  }

  _cache = { byId };
  return _cache;
}

/** Lookup that handles directional suffixes like 721N/721S by falling back to base "721". */
export async function lookupStop(stopIdRaw) {
  if (!stopIdRaw) return null;
  const stopId = String(stopIdRaw).toUpperCase();
  const { byId } = await loadStopsMap();

  // Exact
  if (byId.has(stopId)) return byId.get(stopId);

  // Fallback: strip trailing single letter (N/S/E/W) to get base id
  const m = stopId.match(/^(.+?)[NSEW]$/);
  if (m && byId.has(m[1])) {
    const base = byId.get(m[1]);
    return { ...base, id: stopId }; // keep original id in case you want to show it
  }

  return null;
}
