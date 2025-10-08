# Project Structure & Features

This document summarizes the layout of the `mta-gtfs-webapp` repository and the major features exposed by each area of the codebase.

## Top-Level Overview

```
/
├─ api/            # Serverless API routes consumed by the client UI
├─ data/           # Static GTFS reference data (stops list)
├─ icons/          # SVG assets for the 7/7X route bullets
├─ public/         # Static assets served by Vite (e.g., favicon variants)
├─ src/            # Shared styles and static assets packaged by Vite
├─ index.html      # Entry HTML template rendered by Vite in dev/prod
├─ main.js         # Client-side interactivity and htmx behaviors
├─ package.json    # Vite configuration and dependencies
```

The app is a Vite-powered single-page experience that renders arrivals for the New York City Subway 7/7X routes using MTA's GTFS-Realtime feed. The static shell lives in `index.html` and `main.js`, while dynamic data comes from serverless functions under `api/`.

## Front-End Shell

### `index.html`
* Declares the Pico CSS-powered layout, including a live arrivals table and a collapsible "Nearby stops" sidebar populated via htmx requests.
* Defines reusable form inputs (hidden) so client-initiated requests always include the chosen stop ID and horizon.
* Includes a live New York time clock and an htmx `beforeSwap` guard that keeps responses from the Nearby panel from accidentally replacing the arrivals table.

### `main.js`
* Provides user experience enhancements: a time-windowed welcome banner, loading indicator management, and a debug label showing the captured coordinates.
* Implements `getAndLoadOnce()` to request browser geolocation, then calls `/api/nearest` to list closest 7-line stations and auto-refreshes the arrivals list on first load for secure contexts.
* Wires up the "Use my location" button and ensures the first load respects permission prompts, falling back gracefully when permissions are denied.

### `src/style.css`
* Supplies the custom look-and-feel layered on Pico CSS, including typography, responsive two-column layout, and keyframes used when tables refresh.

## Serverless API Routes (`api/`)

The `api/` directory mirrors a typical Vercel/Vite serverless setup where every `.js` file exports a handler.

* `api/arrivals.js` – Fetches GTFS-Realtime trip updates, filters them to the requested stop and 7/7X routes, combines vehicle positions for richer status text, and renders the arrivals table HTML.
* `api/nearest.js` – Accepts coordinates, scores 7/7X stops via the haversine distance, and returns interactive rows that retarget the arrivals panel when clicked.
* `api/headway.js` – Computes headways (intervals between trains) for diagnostic views of service regularity.
* `api/status.js` – Provides a lightweight health endpoint summarizing feed freshness and cache age.
* `api/gtfs7.js` and `api/gtfs7-json.js` – Expose the decoded GTFS-Realtime payload directly (HTML and JSON respectively) for debugging.
* `api/arrivals-721N.js` – Shortcut to the arrivals table for the 721N stop.
* `api/stop-name.js` – Normalizes stop IDs into human-friendly station names via the shared stops lookup.

### Shared API Utilities (`api/_lib/`)

* `feed.js` caches the GTFS-Realtime protobuf payload for 15 seconds to avoid redundant fetches across rapid requests.
* `stops.js` lazily loads `data/stops.txt`, parses the CSV by hand, and exposes helpers to list 7-line stops with metadata and resolve friendly names for IDs and directional variants.

## Data & Assets

* `data/stops.txt` – Pruned GTFS stops reference used for nearby lookups and label rendering.
* `icons/` – Route bullet SVGs referenced by `index.html`.
* `public/` – Additional static assets served as-is by Vite.

## Tooling

* `package.json` configures Vite scripts (`npm run dev|build|preview`) and declares dependencies on `gtfs-realtime-bindings` for protobuf decoding plus the Vercel runtime adapter.
* `package-lock.json` captures exact dependency versions.

## How It Comes Together

1. The browser loads `index.html`, which boots `main.js` and wires up htmx targets.
2. `main.js` optionally acquires geolocation, calls `/api/nearest`, and populates the sidebar with station shortcuts that in turn trigger `/api/arrivals`.
3. `/api/arrivals` composes live data from MTA's GTFS feed, using shared utilities for station labels and caching, and responds with HTML that htmx swaps into the arrivals table.
4. Styling from `src/style.css` keeps the interface responsive and visually polished.

This architecture keeps the UI largely declarative while letting serverless endpoints handle GTFS parsing and business logic.