# MTA 7 Line Arrivals 🚇

This Vite-powered web app shows live arrivals for the New York City Subway 7/7X lines using the MTA's GTFS-Realtime feed. It combines a responsive Pico CSS layout with htmx-driven partial updates so the UI stays lightweight while the data stays fresh.

## Features
- **Live arrivals table** with enriched status messages that merge trip updates and vehicle positions.
- **Nearby stations panel** that scores 7 line stops by proximity and lets riders retarget the arrivals feed with one tap.
- **Geolocation onboarding** that hydrates the page on first load, including a welcome banner, loading states, and graceful fallbacks when location access is denied.
- **Diagnostic utilities** such as cached feed inspection endpoints and headway calculations exposed via serverless routes.

## Getting started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Launch the development server:
   ```bash
   npm run dev
   ```
3. Open the printed local URL to view the app, then use the "Use my location" button to populate nearby stops.

## Project layout
- `index.html` & `main.js` – Static shell and client-side interactions.
- `api/` – Serverless functions that fetch, cache, and transform GTFS data.
- `data/stops.txt` – Reference list of 7 line stations used for labels and scoring.
- `src/style.css` – Custom styling layered on top of Pico CSS.

## Deployment
Run a production build with:
```bash
npm run build
```
Then deploy the generated assets (and serverless API routes) to a Vite-compatible platform such as Vercel or Netlify.