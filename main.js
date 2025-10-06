const indicator = document.querySelector("#loading");
const locLabel = document.getElementById("locLabel");

// --- Time-windowed welcome banner ---
const banner = document.getElementById("welcomeBanner");
if (banner) {
  // Mon=1 ... Thu=4
  const now = new Date();
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();

  const isMonThu = day >= 1 && day <= 4;
  const inMorning = mins >= (8 * 60 + 30) && mins < (10 * 60);   // 8:30–10:00
  const inEvening = mins >= (17 * 60) && mins < (19 * 60);       // 17:00–19:00

  banner.setAttribute("aria-live", "polite"); // announce changes gently

  if (isMonThu && inMorning) {
    banner.textContent = "🌞 满满宝宝，上班加油 🌞";
    banner.style.display = "";   // show
  } else if (isMonThu && inEvening) {
    banner.textContent = "🏠 满满宝宝，欢迎回家 💛";
    banner.style.display = "";   // show
  } else {
    banner.style.display = "none"; // hide outside windows
  }
}


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
