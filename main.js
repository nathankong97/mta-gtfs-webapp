const indicator = document.querySelector("#loading");
const locLabel = document.getElementById("locLabel");

function setBusy(v) {
  if (!indicator) return;
  indicator.setAttribute("aria-busy", v ? "true" : "false");
  if (v) indicator.style.display = "block";
  else indicator.style.display = "none";
}

function setLocLabel(lat, lon) {
  if (!locLabel) return;
  if (lat == null || lon == null) locLabel.textContent = "Loc: —";
  else locLabel.textContent = `Loc: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function loadNearest(lat, lon) {
  setBusy(true);
  return htmx
    .ajax("GET", `/api/nearest?lat=${lat}&lon=${lon}`, {
      target: "#nearby",
      swap: "innerHTML",
      indicator: "#loading",
    })
    .finally(() => setBusy(false));
}

function getAndLoadOnce() {
  if (!("geolocation" in navigator)) {
    alert("Geolocation not supported by this browser.");
    return;
  }
  setBusy(true);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      setLocLabel(latitude, longitude);       // Debug label
      loadNearest(latitude, longitude);
    },
    (err) => {
      setBusy(false);
      alert(`Location error: ${err.message}`);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// Keep the button (manual re-try)
document.getElementById("useLocBtn")?.addEventListener("click", getAndLoadOnce);

// Auto-run on first load (HTTPS or localhost)
document.addEventListener("DOMContentLoaded", async () => {
  const isSecure = location.protocol === "https:" || location.hostname === "localhost";
  if (!isSecure) return; // browsers require secure origin for geolocation

  try {
    // If permission is denied, don't auto-prompt; user can click the button.
    const perm = await (navigator.permissions?.query?.({ name: "geolocation" }) || Promise.resolve(null));
    if (perm && perm.state === "denied") return;
  } catch {
    // permissions API not available — safe to proceed
  }

  // Will prompt if needed; on success it updates the label and loads nearest stops.
  getAndLoadOnce();
});
