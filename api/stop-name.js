// api/stop-name.js
import { lookupStop } from "./_lib/stops.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const urlObj = new URL(req.url, "http://localhost");
  const stopId = (urlObj.searchParams.get("stopId") || "").trim();

  try {
    const info = await lookupStop(stopId);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).json({ stopId, info });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
