// Mobile-freundliche Tagesansicht fuer die "report"-Rolle (nur lesend).
// Erreichbar nur nach Login ueber den normalen Login-Screen (index.html),
// der bei Rolle "report" hierher weiterleitet. Kein eigenstaendiger Login
// auf dieser Seite - ohne gueltige Session geht's zurueck zu "/".

const REFRESH_MS = 30000;
const SESSION_STORAGE_KEY = "festkasseSessionUser";
let refreshTimer = null;
let wakeLock = null;

// Haelt den Bildschirm wach, solange die Seite als Dauer-Display
// (z.B. Handy neben der Kasse) sichtbar ist. Wird vom System beim
// Verstecken/Minimieren automatisch freigegeben, daher Re-Acquire
// bei "visibilitychange". Ohne HTTPS (bzw. localhost) bietet der
// Browser die API gar nicht an - dann bleibt es beim normalen Verhalten.
async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (error) {
    wakeLock = null;
  }
}

function setupWakeLock() {
  requestWakeLock();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !wakeLock) {
      requestWakeLock();
    }
  });
}

function getStoredToken() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).token || null;
  } catch (error) {
    return null;
  }
}

function goToLogin() {
  // Erst den lokalen (ungueltigen) Session-Eintrag entfernen - sonst haelt
  // die Login-Seite ihn faelschlich fuer noch gueltig und schickt sofort
  // wieder hierher zurueck (Redirect-Schleife, sieht wie ein staendig neu
  // ladendes, kurz aufblitzendes Fenster aus).
  clearInterval(refreshTimer);
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  window.location.href = "/";
}

async function logoutReport() {
  const token = getStoredToken();
  clearInterval(refreshTimer);
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  if (token) {
    try {
      await fetch("/api/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {
      // Lokal ist ohnehin schon abgemeldet, Server-Seite ist nur Aufraeumen.
    }
  }
  goToLogin();
}

function brandTemplate(payload) {
  const src = logoSrc(payload);
  return `
    <div class="report-brand">
      ${src ? `<img class="report-logo" src="${src}" alt="Logo" />` : ""}
      <div>
        <h1>${escapeHtml(payload.eventName || "Festkasse")}</h1>
        <p>${escapeHtml(payload.clubName || "")}</p>
      </div>
      <button class="ghost-button small-button report-logout-button" type="button" data-report-logout>Logout</button>
    </div>
  `;
}

function renderReport(payload) {
  const report = payload.report;
  const consumptionRowsWithStock = attachStock(report.consumptionRows, payload.articleStock);
  const now = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  document.querySelector("#app").innerHTML = `
    <main class="report-shell">
      ${brandTemplate(payload)}
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Tagesbericht</h2>
            <p>Nur der laufende Tag. Aktualisiert automatisch alle 30 Sekunden.</p>
          </div>
        </div>
        <div class="stat-grid">
          <article class="stat-card"><span>Gesamtumsatz</span><strong>${moneyText(report.total, payload.currency)}</strong></article>
          <article class="stat-card"><span>Anzahl Essen</span><strong>${report.consumptionCount}</strong></article>
        </div>
        <div class="report-grid">
          ${reportTableTemplate("1. Summe", consumptionRowsWithStock, false, report.consumptionCount, 0, payload.currency, true)}
          ${reportTableTemplate("2. Normal", report.normalRows, true, report.normalCount, report.normalSum, payload.currency)}
          ${reportTableTemplate("3. Kostenlos", report.freeRows, false, report.freeCount, 0, payload.currency)}
        </div>
        ${intervalChartTemplate(payload.buckets, payload.currency)}
        <p class="hint report-updated">Stand: ${now}</p>
      </section>
    </main>
  `;
  document.querySelector("[data-report-logout]")?.addEventListener("click", logoutReport);
}

function renderError(message) {
  document.querySelector("#app").innerHTML = `
    <main class="report-shell">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Tagesbericht</h2>
            <p class="error">${escapeHtml(message)}</p>
          </div>
        </div>
        <div class="qr-row">
          <button class="action-button" type="button" data-retry-report>Erneut versuchen</button>
        </div>
      </section>
    </main>
  `;
}

async function loadReport() {
  const token = getStoredToken();
  if (!token) {
    goToLogin();
    return;
  }

  try {
    const response = await fetch("/api/report/today", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
    if (response.status === 401) {
      goToLogin();
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderReport(await response.json());
  } catch (error) {
    const detail = error?.message === "Failed to fetch" ? "Server nicht erreichbar" : error?.message;
    renderError(`Bericht konnte nicht geladen werden (${detail}). Bitte erneut versuchen.`);
    document.querySelector("[data-retry-report]")?.addEventListener("click", loadReport);
  }
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(loadReport, REFRESH_MS);
}

loadReport();
startAutoRefresh();
setupWakeLock();
