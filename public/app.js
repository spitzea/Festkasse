// Festkasse Community Edition
// Zielgruppe: Feuerwehren, Vereine und ehrenamtliche Organisationen.

const DEFAULT_RESET_STOCK = 500;
const MAX_CATEGORIES = 6;
const SESSION_STORAGE_KEY = "festkasseSessionUser";
const LAST_RECEIPT_UNDO_MS = 30000;
const THEME_STORAGE_KEY = "festkasseTheme";

const seedData = {
  users: [
    { id: "usr_kasse", username: "kasse", role: "user", active: true },
    { id: "usr_admin", username: "admin", role: "admin", active: true }
  ],
  articles: [],
  orders: [],
  cancellations: [],
  dayReports: [],
  settings: {
    clubName: "<Organisation>",
    eventName: "<Festname>",
    currency: "EUR",
    defaultWarningStock: 5,
    printerName: "Serieller Thermodrucker",
    printerMode: "serial",
    printerPort: "/dev/ttyUSB0",
    printOutputDir: "data/prints",
    receiptFooter: "Vielen Dank!",
    calculatorName: "Kassenleitung",
    calculatorPhone: "",
    calculatorComment: "",
    menuVersion: 5,
    activeEventFile: "active-event.json",
    nextReceiptNumber: 1,
    categories: []
  }
};

let state = cloneData(seedData);
let sessionUser = null;
let sessionToken = null;
let activeView = "cashier";
let activeAdminSection = "analysis";
let cart = [];
let paidAmount = "";
let toastTimer = null;
let clockTimer = null;

// Persistenter Trace fuer View-Wechsel: console.warn allein reicht nicht, weil
// Chrome/Chromium Konsolenausgaben von VOR dem Oeffnen der DevTools nicht
// nachliefert. In sessionStorage geschrieben, damit man ihn auch nach dem
// Auftreten des Sprungs noch auslesen kann (window.festkasseViewTrace()).
const VIEW_TRACE_KEY = "festkasse-view-trace";

function logViewTransition(to, meta = {}) {
  try {
    const entries = JSON.parse(window.sessionStorage.getItem(VIEW_TRACE_KEY) || "[]");
    entries.push({
      time: new Date().toISOString(),
      from: activeView,
      to,
      fromAdminSection: activeAdminSection,
      ...meta
    });
    window.sessionStorage.setItem(VIEW_TRACE_KEY, JSON.stringify(entries.slice(-20)));
  } catch (error) {
    // sessionStorage evtl. voll/deaktiviert - Trace ist dann halt weg, kein harter Fehler
  }
}

window.festkasseViewTrace = () => JSON.parse(window.sessionStorage.getItem(VIEW_TRACE_KEY) || "[]");
const adminDirtySections = new Set();
const adminSavedSections = new Set();
let eventCatalog = null;
let bootError = "";
let systemInfo = {
  platform: "",
  canShutdown: false,
  canSetSystemTime: false,
  appVersion: "",
  gitCommit: "",
  nodeVersion: "",
  license: "",
  copyright: "",
  repositoryUrl: "",
  serverTime: "",
  defaultPasswordsActive: false,
  defaultPasswordUsernames: [],
  hasLogo: false,
  logoVersion: 0
};
let versionCheck = { status: "unchecked", label: "nicht geprüft" };
let lastCheckout = null;
// Laeuft gerade eine Buchung oder ein Storno? Sperrt Warenkorb und Knoepfe,
// damit ein zweiter Klick waehrend des Speicherns nicht doppelt bucht.
let checkoutInProgress = false;
let undoCheckoutTimer = null;
let systemInfoRefreshPending = false;
let versionCheckStarted = false;
let printerStatus = { online: false, label: "Drucker Offline", mode: "browser" };
let systemNetwork = null;
let systemNetworkPending = false;
let systemNetworkFetchedAt = 0;
const SYSTEM_NETWORK_TTL_MS = 15000;
let printerStatusTimer = null;
let themeMode = normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));

function normalizeThemeMode(mode) {
  return mode === "light" ? "light" : "dark";
}

function applyTheme(mode = themeMode) {
  themeMode = normalizeThemeMode(mode);
  document.documentElement.dataset.themeMode = themeMode;
  document.documentElement.dataset.theme = themeMode;
}

function setThemeMode(mode) {
  applyTheme(mode);
  window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
}

applyTheme(themeMode);
// escapeHtml, moneyText, businessDayKey, businessDayLabel,
// filterPaidOrdersForBusinessDay, totalsByMode, buildReportData und
// buildIntervalBuckets kommen aus report-shared.js (vor app.js eingebunden).

function safeColor(value) {
  return /^#[0-9a-f]{3,8}$/i.test(String(value || "")) ? value : "#999999";
}
// logoSrc kommt aus report-shared.js.

async function apiFetch(input, init = {}) {
  if (!sessionToken) return fetch(input, init);
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${sessionToken}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    const payload = await response.clone().json().catch(() => ({}));
    handleSessionInvalidated(
      payload.reason === "taken-over"
        ? "Diese Sitzung wurde auf einem anderen Gerät übernommen. Bitte erneut anmelden."
        : "Sitzung abgelaufen oder Server neu gestartet. Bitte erneut anmelden."
    );
  }
  return response;
}

let sessionInvalidatedHandled = false;
let loginNotice = "";

function handleSessionInvalidated(message) {
  if (sessionInvalidatedHandled || !sessionUser) return;
  sessionInvalidatedHandled = true;
  clearSessionUser();
  cart = [];
  paidAmount = "";
  loginNotice = message;
  // Sonst pollen Drucker-Status/Uhr nach dem Abmelden ungebremst weiter und
  // spammen mit jedem 10-Sekunden-Takt einen weiteren 401 in die Konsole.
  clearInterval(printerStatusTimer);
  clearInterval(clockTimer);
  render();
}

async function loadState() {
  const response = await apiFetch("/api/state");
  if (!response.ok) throw new Error("Serverdaten konnten nicht geladen werden.");
  const payload = await response.json();
  systemInfo = { ...systemInfo, ...(payload.system || {}) };
  return normalizeState(payload.state);
}

// Der vollstaendige Zustand haengt hinter der Anmeldung. Vor dem Login gibt es
// nur diesen schmalen Endpunkt mit dem, was der Login-Bildschirm zeigt.
async function loadBootstrap() {
  const response = await fetch("/api/bootstrap");
  if (!response.ok) throw new Error("Serverdaten konnten nicht geladen werden.");
  const payload = await response.json();
  state.settings = { ...state.settings, ...(payload.settings || {}) };
  systemInfo = { ...systemInfo, ...(payload.system || {}) };
}

async function refreshSystemInfo() {
  try {
    const response = await apiFetch(`/api/system?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    systemInfo = { ...systemInfo, ...(payload.system || {}) };
  } catch (error) {
    // Older servers do not provide /api/system. The UI keeps browser fallbacks in that case.
  }
}

async function refreshSystemNetwork() {
  try {
    const response = await apiFetch(`/api/system/network?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    systemNetwork = await response.json();
    systemNetworkFetchedAt = Date.now();
  } catch (error) {
    // Netzwerk-Info ist rein informativ, kein harter Fehler noetig.
  }
}

function needsSystemInfoRefresh() {
  return ["appVersion", "gitCommit", "nodeVersion", "platform"].some((key) => !hasUsefulSystemValue(systemInfo[key]));
}

function hasUsefulSystemValue(value) {
  return Boolean(value && value !== "unknown" && value !== "nicht verfügbar");
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeState(data) {
  const normalized = { ...cloneData(seedData), ...data };
  normalized.settings = { ...seedData.settings, ...(normalized.settings || {}) };
  normalized.settings.categories = normalizeCategories(normalized.settings.categories, normalized.articles || []);
  normalized.users = (normalized.users || []).filter((user) => ["user", "admin", "report"].includes(user.role));
  normalized.articles = (normalized.articles || []).map((article) => ({
    ...article,
    category: article.category || "Sonstiges",
    categoryColor: getCategoryColorFrom(normalized.settings.categories, article.category || "Sonstiges"),
    warningStock: Number.isFinite(Number(article.warningStock)) ? Number(article.warningStock) : normalized.settings.defaultWarningStock
  }));
  normalized.orders ||= [];
  normalized.cancellations ||= [];
  normalized.dayReports ||= [];
  normalized.settings.nextReceiptNumber = Math.max(1, Number(normalized.settings.nextReceiptNumber) || 1);
  normalized.settings.menuVersion = 5;
  normalized.settings.activeEventFile ||= "active-event.json";
  normalized.articles = normalized.articles.map((article, index) => ({
    ...article,
    sortOrder: Number.isFinite(Number(article.sortOrder)) ? Number(article.sortOrder) : index + 1
  })).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "de"));
  return normalized;
}

function normalizeCategories(categories, articles) {
  const categoryMap = new Map();
  (categories || []).forEach((category) => {
    if (!category?.name) return;
    categoryMap.set(category.name, { name: category.name, color: category.color || colorForCategory(category.name) });
  });
  (articles || []).forEach((article) => {
    const name = article.category || "Sonstiges";
    if (!categoryMap.has(name)) {
      categoryMap.set(name, { name, color: article.categoryColor || colorForCategory(name) });
    }
  });
  return [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

async function saveState() {
  const response = await apiFetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state })
  });
  if (!response.ok) {
    showToast("Speichern auf dem Server fehlgeschlagen.");
    return false;
  }
  const payload = await response.json();
  state = normalizeState(payload.state);
  systemInfo = { ...systemInfo, ...(payload.system || {}) };
  return true;
}

function colorForCategory(category) {
  const palette = ["#e32626", "#ffb703", "#0ea5e9", "#22c55e", "#8b5cf6", "#f97316", "#14b8a6"];
  const text = category || "Sonstiges";
  const sum = [...text].reduce((total, char) => total + char.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

function getCategoryColor(categoryName) {
  return getCategoryColorFrom(state.settings.categories, categoryName);
}

function getCategoryColorFrom(categories, categoryName) {
  const category = categories?.find((item) => item.name === categoryName);
  return category?.color || colorForCategory(categoryName);
}

function syncArticleCategoryColors(categoryName, color) {
  state.articles.forEach((article) => {
    if (article.category === categoryName) {
      article.categoryColor = color;
    }
  });
}

function money(value) {
  return moneyText(value, state.settings.currency || "EUR");
}

function moneyInput(value) {
  if (value === "" || value === null || value === undefined) return money(0);
  return money(Number(value));
}

function parseMoneyInput(value) {
  const normalized = String(value)
    .replace(/[^\d,.]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return normalized && !Number.isNaN(Number(normalized)) ? normalized : "";
}

function editableMoneyInput(value) {
  if (value === "" || value === null || value === undefined) return "0,00";
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

function shortDateTime(date = new Date()) {
  return `${date.toLocaleDateString("de-DE")} ${date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}

function cashierDateTime(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

function roleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "report") return "Bericht (nur lesend)";
  return "User";
}

function systemVersionLabel() {
  const version = displayValue(systemInfo.appVersion, "unknown");
  const commit = displayValue(systemInfo.gitCommit, "unknown");
  if (version === "unknown" && commit === "unknown") return "nicht verfügbar";
  return `${version} (${commit})`;
}

function displayValue(value, fallback = "-") {
  return value && value !== "unknown" ? value : fallback;
}

function formatReceiptNumber(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(6, "0");
}

function browserDisplayInfo() {
  const viewport = `${window.innerWidth} x ${window.innerHeight}`;
  const screenSize = window.screen ? `${window.screen.width} x ${window.screen.height}` : "unknown";
  const pixelRatio = Number(window.devicePixelRatio || 1).toFixed(2);
  return { viewport, screenSize, pixelRatio };
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function todayOrders() {
  return filterPaidOrdersForBusinessDay(state.orders, businessDayKey(new Date()));
}
// buildReportData kommt aus report-shared.js.

function canManage() {
  return sessionUser && sessionUser.role === "admin";
}

// Frueher wurde der gespeicherte Benutzer nur gegen die anonym geladene
// Benutzerliste geprueft, das Token aber nie. Die Oberflaeche rendert dann als
// angemeldet, bevor der Server das Token gesehen hat. Jetzt entscheidet
// ausschliesslich der Server: das Token geht mit, und erst wenn /api/state
// antwortet, gilt die Sitzung als gueltig.
async function restoreSessionUser() {
  const rawSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!rawSession) return;

  let storedUser = null;
  try {
    storedUser = JSON.parse(rawSession);
  } catch (error) {
    storedUser = null;
  }

  if (!storedUser?.token) {
    clearSessionUser();
    return;
  }

  sessionToken = storedUser.token;
  let loadedState = null;
  try {
    loadedState = await loadState();
  } catch (error) {
    clearSessionUser();
    return;
  }

  state = loadedState;
  sessionUser = state.users.find((user) =>
    user.active &&
    user.id === storedUser.id &&
    user.username === storedUser.username &&
    user.role === storedUser.role
  ) || null;

  if (!sessionUser) {
    clearSessionUser();
    return;
  }

  // Ansicht ueberlebt einen Reload (z.B. wenn der Browser einen im
  // Hintergrund liegenden Tab automatisch neu laedt) - sonst bleibt man
  // zwar angemeldet, landet aber wieder auf der Kasse.
  if (storedUser.activeView) activeView = storedUser.activeView;
  if (storedUser.activeAdminSection) activeAdminSection = storedUser.activeAdminSection;
}

function rememberSessionUser() {
  if (!sessionUser) return;
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    id: sessionUser.id,
    username: sessionUser.username,
    role: sessionUser.role,
    token: sessionToken,
    activeView,
    activeAdminSection
  }));
}

function clearSessionUser() {
  sessionUser = null;
  sessionToken = null;
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function render() {
  updateFavicon();
  const app = document.querySelector("#app");
  if (bootError) {
    app.innerHTML = `
      <main class="login-screen">
        <section class="panel login-card">
          <h1>Festkasse</h1>
          <p class="error">${bootError}</p>
        </section>
      </main>
    `;
    return;
  }

  if (!sessionUser) {
    app.innerHTML = loginTemplate();
    bindLogin();
    return;
  }

  app.innerHTML = shellTemplate();
  bindShell();

  if (activeView === "admin" && (canManage() || activeAdminSection === "info")) {
    renderAdmin();
  } else {
    if (activeView !== "cashier") {
      // Diagnose: Sprung zur Kasse ueber den render()-Fallback (nicht ueber
      // einen Tab-Klick) - haelt fest, woran es lag, um den Ursprung beim
      // naechsten Mal zu finden. Fuer Admins (canManage() === true) sollte
      // dieser Zweig nie erreicht werden.
      logViewTransition("cashier", {
        reason: "render-fallback",
        sessionUser: sessionUser ? { username: sessionUser.username, role: sessionUser.role, active: sessionUser.active } : null,
        canManage: canManage(),
        userInStateUsers: state.users?.find((user) => user.id === sessionUser?.id) || null
      });
      console.warn("[Festkasse] Unerwarteter Sprung zur Kasse ueber render()-Fallback.", window.festkasseViewTrace().at(-1));
    }
    activeView = "cashier";
    renderCashier();
  }
}

function updateFavicon() {
  const favicon = document.querySelector("#dynamic-favicon");
  if (!favicon) return;
  favicon.setAttribute("href", logoSrc(systemInfo) || "data:,");
}

function loginTemplate() {
  const notice = loginNotice;
  loginNotice = "";
  return `
    <main class="login-screen">
      <section class="panel login-card">
        <div class="brand">
          ${brandMarkTemplate()}
          <div>
            <h1>${escapeHtml(state.settings.eventName)}</h1>
            <p>${escapeHtml(state.settings.clubName)}</p>
          </div>
        </div>
        <form class="login-form" data-login-form>
          <div class="field">
            <label for="username">Benutzer</label>
            <input id="username" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required />
          </div>
          <div class="field">
            <label for="password">Passwort</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required />
          </div>
          <button class="primary-button" type="submit">Einloggen</button>
          ${defaultAccessTemplate()}
          <div class="login-contact">
            <strong>Rechner: ${escapeHtml(state.settings.calculatorName || "-")}</strong>
            <span>Telefonnummer: ${escapeHtml(state.settings.calculatorPhone || "-")}</span>
            ${state.settings.calculatorComment ? `<p>${escapeHtml(state.settings.calculatorComment)}</p>` : ""}
          </div>
          <div class="error ${notice ? "" : "hidden"}" data-login-error>${escapeHtml(notice || "Login fehlgeschlagen.")}</div>
        </form>
      </section>
    </main>
  `;
}

function shellTemplate() {
  return `
    <main class="app-shell">
      <header class="topbar">
        <div class="brand">
          ${brandMarkTemplate()}
          <div>
            <h1>${escapeHtml(state.settings.eventName)}</h1>
            <p>${escapeHtml(state.settings.clubName)}</p>
          </div>
        </div>
        <div class="top-actions">
          <button class="tab-button ${activeView === "cashier" ? "active" : ""}" type="button" data-view="cashier">Kasse</button>
          <div class="system-menu">
            <button class="ghost-button menu-button" type="button" data-system-menu aria-label="Menü" aria-expanded="false">
              <span></span><span></span><span></span>
            </button>
            <div class="system-menu-panel hidden" data-system-menu-panel>
              <nav class="menu-nav">
                <button class="tab-button ${activeView === "admin" && activeAdminSection === "info" ? "active" : ""}" type="button" data-admin-section="info">Info</button>
                ${canManage() ? adminMenuTemplate() : ""}
              </nav>
              ${themeMenuTemplate()}
              ${canShutdownSystem() ? `<button class="danger-button small-button" type="button" data-system-shutdown>Herunterfahren</button>` : ""}
              <button class="action-button small-button menu-logout-button" type="button" data-logout>Logout</button>
            </div>
          </div>
        </div>
      </header>
      <section data-view-root></section>
      <div class="toast hidden" data-toast></div>
    </main>
  `;
}

// Herunterfahren ist serverseitig adminpflichtig - der Knopf darf deshalb
// weder vor der Anmeldung noch fuer die Kassenrolle erscheinen.
function canShutdownSystem() {
  return Boolean(systemInfo.canShutdown) && canManage();
}

function canSetSystemTime() {
  return Boolean(systemInfo.canSetSystemTime);
}

function toDateTimeLocalValue(isoString) {
  const date = isoString ? new Date(isoString) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Die Box soll pro Zeile verschwinden, sobald genau dieser Zugang ein eigenes
// Passwort bekommen hat - nicht erst, wenn alle drei geaendert sind.
function defaultAccessTemplate() {
  const active = systemInfo.defaultPasswordUsernames || [];
  const entries = [
    { username: "kasse", label: "Kasse", password: "kasse123" },
    { username: "admin", label: "Admin", password: "admin123" },
    { username: "report", label: "Bericht (nur lesend)", password: "report123" }
  ].filter((entry) => active.includes(entry.username));

  if (!entries.length) return "";

  return `
    <div class="login-access">
      <strong>Standardzugänge</strong>
      ${entries.map((entry) => `<span>${escapeHtml(entry.label)}: <code>${escapeHtml(entry.username)}</code> / <code>${escapeHtml(entry.password)}</code></span>`).join("")}
      <small>Nach einer Änderung gelten die im Adminbereich gesetzten Passwörter.</small>
    </div>
  `;
}

function adminMenuTemplate() {
  const items = [
    ["analysis", "Tagesauswertung"],
    ["articles", "Artikel verwalten"],
    ["categories", "Kategorien verwalten"],
    ["users", "Benutzer & Passwörter"],
    ["print", "Drucken"],
    ["data", "Daten & Vorlagen"],
    ["settings", "Einstellungen"]
  ];
  return `
    <div class="menu-section-title">Admin-Menü</div>
    ${items.map(([section, label]) => `
      <button class="ghost-button small-button ${activeView === "admin" && activeAdminSection === section ? "active" : ""}" type="button" data-admin-section="${section}">${label}</button>
    `).join("")}
  `;
}

function themeMenuTemplate() {
  return `
    <div class="theme-menu" role="group" aria-label="Designmodus">
      <span class="menu-section-title">Design</span>
      <button class="theme-toggle ${themeMode === "light" ? "light" : "dark"}" type="button" data-theme-toggle aria-label="Design zwischen Hell und Dunkel wechseln">
        <span class="theme-toggle-option sun">☀</span>
        <span class="theme-toggle-option moon">☾</span>
        <span class="theme-toggle-thumb"></span>
      </button>
    </div>
  `;
}

function brandMarkTemplate() {
  const src = logoSrc(systemInfo);
  if (src) {
    return `<div class="brand-mark logo-mark"><img src="${src}" alt="Logo" /></div>`;
  }

  return `<div class="brand-mark">Logo</div>`;
}

function renderCashier() {
  const root = document.querySelector("[data-view-root]");
  const activeArticles = state.articles.filter((article) => article.active).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "de"));
  const groupedArticles = activeArticles.reduce((groups, article) => {
    const category = article.category || "Sonstiges";
    groups[category] ||= [];
    groups[category].push(article);
    return groups;
  }, {});

  root.innerHTML = `
    <div class="layout">
      <section class="panel articles-panel">
        <div class="category-stack">
          ${Object.entries(groupedArticles).map(([category, articles]) => categoryGroupTemplate(category, articles)).join("")}
        </div>
      </section>
      <div class="cart-column">
        ${cartTemplate()}
        ${cashierContactTemplate()}
        ${cashierStatusTemplate()}
      </div>
    </div>
  `;
  bindCashier();
}

function categoryGroupTemplate(category, articles) {
  const color = getCategoryColor(category);
  return `
    <section class="category-group" style="--category-color: ${safeColor(color)}">
      <div class="category-heading">
        <span class="category-dot"></span>
        <h3>${escapeHtml(category)}</h3>
      </div>
      <div class="article-grid">
        ${articles.map(articleButtonTemplate).join("")}
      </div>
    </section>
  `;
}

// Der Bestand steht bei Knappheit als auffaelliger Chip in der Kachel: an der
// Kasse wird nebenbei gearbeitet, ein duenner Rahmen allein wird uebersehen.
function articleStockText(article) {
  if (article.stock <= 0) return "Ausverkauft";
  if (article.stock <= article.warningStock) return `⚠ Nur noch ${article.stock}`;
  return `${article.stock} Stk.`;
}

function articleButtonTemplate(article) {
  const out = article.stock <= 0;
  const low = !out && article.stock <= article.warningStock;
  return `
    <button class="article-button ${low ? "low" : ""} ${out ? "out" : ""}" style="--category-color: ${safeColor(getCategoryColor(article.category))}" data-add-article="${escapeHtml(article.id)}" ${out ? "disabled" : ""}>
      <span class="article-name">${escapeHtml(article.name)}</span>
      <span class="article-meta">
        <span>${money(article.price)}</span>
        <span class="${low ? "article-stock-low" : ""}" data-article-stock>${articleStockText(article)}</span>
      </span>
    </button>
  `;
}

function canUndoLastCheckout() {
  return Boolean(lastCheckout && Date.now() < lastCheckout.expiresAt);
}

function scheduleUndoCheckoutExpiry() {
  window.clearTimeout(undoCheckoutTimer);
  if (!lastCheckout) return;
  undoCheckoutTimer = window.setTimeout(() => {
    lastCheckout = null;
    // renderCart() faellt auf renderCashier() zurueck, wenn das Cart-Panel
    // fehlt (data-cart-panel nicht im DOM) - genau das passiert hier, wenn man
    // laengst in einen anderen Screen (z.B. Tagesauswertung) gewechselt hat,
    // und reisst einen dann unbemerkt zurueck zur Kasse. Deshalb nur rendern,
    // wenn die Kasse tatsaechlich noch der aktive Screen ist.
    if (activeView === "cashier") renderCart();
  }, Math.max(0, lastCheckout.expiresAt - Date.now()));
}

function cartTemplate() {
  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const change = Math.max(0, Number(paidAmount || 0) - total);
  const undoButton = canUndoLastCheckout()
    ? `<button class="ghost-button undo-button" type="button" data-undo-last-checkout>Storno letzter Bon</button>`
    : "";
  const rows = cart.length
    ? cart.map(cartRowTemplate).join("")
    : `<div class="empty-state">Noch nichts im Korb. Gleich wird's heiß.</div>`;

  return `
    <aside class="panel cart" data-cart-panel>
      <div class="panel-header">
        <div>
          <h2>Warenkorb</h2>
          <p>${cart.reduce((sum, item) => sum + item.quantity, 0)} Positionen</p>
        </div>
        ${cart.length ? `<button class="danger-button" data-cancel-cart>Warenkorb leeren</button>` : ""}
      </div>
      ${undoButton}
      <div class="cart-body">
        ${rows}
        <div class="cart-total">
          <span>Summe</span>
          <output>${money(total)}</output>
        </div>
        <div class="pay-box">
          <div class="field">
            <label for="paidAmount">Erhalten</label>
            <input id="paidAmount" data-paid-amount inputmode="decimal" value="${moneyInput(paidAmount)}" placeholder="0,00 €" />
          </div>
          <div class="cart-total">
            <span>Rückgeld</span>
            <output data-change-output>${money(change)}</output>
          </div>
          <div class="checkout-actions">
            <button class="primary-button" data-print-paid ${cart.length && !checkoutInProgress ? "" : "disabled"}>Bon drucken</button>
            <button class="ghost-button" data-print-free ${cart.length && !checkoutInProgress ? "" : "disabled"}>Kostenlos buchen</button>
          </div>
        </div>
      </div>
    </aside>
  `;
}

function cashierContactTemplate() {
  return `
    <aside class="panel contact-box">
      <span>Rechner</span>
      <strong>${escapeHtml(state.settings.calculatorName || "-")}</strong>
      <span>Telefonnummer</span>
      <strong>${escapeHtml(state.settings.calculatorPhone || "-")}</strong>
      ${state.settings.calculatorComment ? `<span>Hinweis</span><p>${escapeHtml(state.settings.calculatorComment)}</p>` : ""}
    </aside>
  `;
}

function cashierStatusTemplate() {
  const online = Boolean(printerStatus.online);
  const label = printerStatus.label || (online ? "Drucker" : "Drucker Offline");
  return `
    <aside class="panel cashier-status-box ${online ? "online" : "offline"}">
      <strong data-clock>${cashierDateTime()}</strong>
      <span class="printer-state ${online ? "online" : "offline"}" data-printer-status>
        <span class="printer-dot"></span>
        ${escapeHtml(label)}
      </span>
    </aside>
  `;
}

function cartRowTemplate(item) {
  return `
    <div class="cart-row">
      <div class="cart-item-info">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${item.quantity} x ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}</span>
      </div>
      <div class="cart-controls">
        <button class="qty-button" data-dec="${escapeHtml(item.articleId)}">-</button>
        <button class="qty-button" data-inc="${escapeHtml(item.articleId)}">+</button>
        <button class="qty-button" data-remove="${escapeHtml(item.articleId)}">x</button>
      </div>
    </div>
  `;
}

function renderAdmin() {
  if (!canManage()) {
    activeAdminSection = "info";
  }
  if (activeAdminSection === "info" && needsSystemInfoRefresh() && !systemInfoRefreshPending) {
    systemInfoRefreshPending = true;
    refreshSystemInfo().finally(() => {
      systemInfoRefreshPending = false;
      if (activeView === "admin" && activeAdminSection === "info") {
        renderAdmin();
      }
    });
  }
  if (
    activeAdminSection === "settings" &&
    !systemNetworkPending &&
    (!systemNetwork || Date.now() - systemNetworkFetchedAt > SYSTEM_NETWORK_TTL_MS)
  ) {
    // Die IP kann sich waehrend der Laufzeit aendern (WLAN-Wechsel, neue
    // DHCP-Vergabe) - anders als appVersion/gitCommit im "info"-Bereich darf
    // dieser Wert daher nicht nur einmalig geholt werden, sonst zeigt der
    // QR-Code nach einem Netzwerkwechsel dauerhaft die alte Adresse.
    systemNetworkPending = true;
    refreshSystemNetwork().finally(() => {
      systemNetworkPending = false;
      if (activeView === "admin" && activeAdminSection === "settings") {
        renderAdmin();
      }
    });
  }
  if (activeAdminSection === "info" && !versionCheckStarted) {
    versionCheckStarted = true;
    window.setTimeout(checkOnlineVersion, 0);
  }
  const root = document.querySelector("[data-view-root]");
  const adminTemplates = {
    analysis: analysisTemplate,
    articles: articleManagementTemplate,
    categories: categoryManagementTemplate,
    users: userAccessTemplate,
    print: printSettingsTemplate,
    data: dataManagementTemplate,
    settings: settingsTemplate,
    info: infoTemplate
  };
  const content = (adminTemplates[activeAdminSection] || analysisTemplate)();

  root.innerHTML = `
    <div class="admin-layout">
      ${content}
    </div>
  `;
  bindAdmin();
}

function dirtyIndicator(section) {
  if (adminDirtySections.has(section)) {
    return `<span class="unsaved-badge" data-unsaved="${section}">Ungespeicherte Änderungen</span>`;
  }
  if (adminSavedSections.has(section)) {
    return `<span class="saved-badge" data-saved="${section}">Gespeichert</span>`;
  }
  return "";
}

function articleManagementTemplate() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Artikelverwaltung</h2>
        </div>
        <div class="header-actions">
          ${dirtyIndicator("articles")}
          <button class="action-button" data-save-articles>Speichern</button>
        </div>
      </div>
      ${articleFormTemplate()}
      <div class="article-list">
        <div class="article-list-header" aria-hidden="true">
          <span></span>
          <span>Name</span>
          <span>Preis</span>
          <span>Bestand</span>
          <span>Warnung</span>
          <span>Kategorie</span>
          <span>Status</span>
          <span></span>
        </div>
        ${state.articles.map((article, index) => articleEditTemplate(article, index)).join("")}
      </div>
    </section>
  `;
}

function categoryOptionsTemplate(selectedCategory = "") {
  return state.settings.categories.map((category) =>
    `<option value="${escapeHtml(category.name)}" ${category.name === selectedCategory ? "selected" : ""}>${escapeHtml(category.name)}</option>`
  ).join("");
}

function categoryManagementTemplate() {
  const categoryLimitReached = state.settings.categories.length >= MAX_CATEGORIES;
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Kategorien verwalten</h2>
          <p>${state.settings.categories.length} von ${MAX_CATEGORIES} Kategorien belegt.</p>
        </div>
        <div class="header-actions">
          ${dirtyIndicator("categories")}
          <button class="action-button" data-save-categories>Speichern</button>
        </div>
      </div>
      <form class="category-create" data-category-form>
        <div class="field">
          <label>Neue Kategorie</label>
          <input name="name" placeholder="z.B. Getränke" />
        </div>
        <div class="field color-field">
          <label>Farbe</label>
          <input name="color" type="color" value="#e32626" />
        </div>
        <button class="action-button" type="submit">Kategorie anlegen</button>
      </form>
      ${categoryLimitReached ? `<p class="category-limit-note">Maximal ${MAX_CATEGORIES} Kategorien sind erlaubt, damit die Kassenansicht ruhig und planbar bleibt.</p>` : ""}
      <div class="category-list">
        ${state.settings.categories.map((category) => `
          <form class="category-edit-card" data-edit-category="${escapeHtml(category.name)}" style="--category-color: ${safeColor(category.color)}">
            <div class="field">
              <label>Name</label>
              <input name="name" value="${escapeHtml(category.name)}" required />
              <span>${state.articles.filter((article) => article.category === category.name).length} Artikel</span>
            </div>
            <div class="field color-field">
              <label>Farbe</label>
              <input name="color" type="color" value="${safeColor(category.color)}" title="Farbe" />
            </div>
            <button class="danger-button small-button" type="button" data-delete-category="${escapeHtml(category.name)}">Löschen</button>
          </form>
        `).join("")}
      </div>
    </section>
  `;
}

function analysisTemplate() {
  const orders = todayOrders();
  const report = buildReportData(orders);
  const stockByArticleId = Object.fromEntries(state.articles.map((article) => [article.id, article.stock]));
  const consumptionRowsWithStock = attachStock(report.consumptionRows, stockByArticleId);

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Tagesauswertung</h2>
          <p>Betriebstag ${escapeHtml(businessDayLabel(businessDayKey(new Date())))}, 5 Uhr morgens bis 5 Uhr morgens.</p>
        </div>
        <button class="action-button" data-print-report>Auswertung drucken</button>
        <button class="danger-button" data-reset-day ${orders.length ? "" : "disabled"}>Tageskasse abschließen</button>
      </div>
      <div class="stat-grid">
        <article class="stat-card"><span>Gesamtumsatz</span><strong>${money(report.total)}</strong></article>
        <article class="stat-card"><span>Anzahl Essen</span><strong>${report.consumptionCount}</strong></article>
      </div>
      <div class="report-grid">
        ${reportTableTemplate("1. Summe", consumptionRowsWithStock, false, report.consumptionCount, 0, state.settings.currency, true)}
        ${reportTableTemplate("2. Normal", report.normalRows, true, report.normalCount, report.normalSum, state.settings.currency)}
        ${reportTableTemplate("3. Kostenlos", report.freeRows, false, report.freeCount, 0, state.settings.currency)}
      </div>
      ${intervalChartTemplate(buildIntervalBuckets(orders), state.settings.currency)}
      ${dayReportHistoryTemplate()}
    </section>
  `;
}

function dayReportHistoryTemplate() {
  if (!state.dayReports.length) {
    return `
      <section class="history-panel">
        <h3>Historische Tagesabschlüsse</h3>
        <p class="hint">Noch kein Tagesabschluss gespeichert.</p>
      </section>
    `;
  }

  return `
    <section class="history-panel">
      <h3>Historische Tagesabschlüsse</h3>
      <div class="history-list">
        ${state.dayReports.map((report) => `
          <article class="history-card">
            <div>
              <strong>${escapeHtml(report.eventName)}</strong>
              <span>${report.businessDay ? `Betriebstag ${escapeHtml(businessDayLabel(report.businessDay))} - ` : ""}abgeschlossen ${new Date(report.createdAt).toLocaleString("de-DE")}${report.automatic ? " (automatisch)" : ""} - ${report.orderCount} Buchungen - ${money(report.total)}</span>
            </div>
            <div class="history-actions">
              <button class="action-button small-button" data-print-history="${escapeHtml(report.id)}">Drucken</button>
              <button class="danger-button small-button" data-delete-history="${escapeHtml(report.id)}">Endgültig löschen</button>
            </div>
            <details class="history-details">
              <summary>Details anzeigen</summary>
              ${archivedReportTablesTemplate(report)}
            </details>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function archivedReportTablesTemplate(report) {
  const data = buildReportData(report.orders);
  // Der Bestand stammt aus dem Moment des Abschlusses, danach wird er
  // zurueckgesetzt. Abschluesse aelterer Versionen haben ihn nicht
  // gespeichert, dort bleibt die Spalte leer.
  const consumptionRowsWithStock = attachStock(data.consumptionRows, report.stockByArticleId);
  return `
    <div class="report-grid compact-report-grid">
      ${reportTableTemplate("1. Summe", consumptionRowsWithStock, false, data.consumptionCount, 0, state.settings.currency, true)}
      ${reportTableTemplate("2. Normal", data.normalRows, true, data.normalCount, data.normalSum, state.settings.currency)}
      ${reportTableTemplate("3. Kostenlos", data.freeRows, false, data.freeCount, 0, state.settings.currency)}
    </div>
  `;
}
// totalsByMode und reportTableTemplate kommen aus report-shared.js.

function settingsTemplate() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Einstellungen</h2>
          <p>Festname, Organisation und Logo für Bons und Auswertung.</p>
        </div>
        <div class="header-actions">
          ${dirtyIndicator("settings")}
          <button class="action-button" data-save-settings="settings">Speichern</button>
        </div>
      </div>
      <form class="settings-form settings-overview-form" data-settings-form data-settings-section="settings">
        <div class="settings-form-title">Festdaten</div>
        <div class="field">
          <label>Festname</label>
          <input name="eventName" value="${escapeHtml(state.settings.eventName)}" required />
        </div>
        <div class="field">
          <label>Organisation</label>
          <input name="clubName" value="${escapeHtml(state.settings.clubName)}" required />
        </div>
        <div class="field">
          <label>Logo</label>
          <div class="logo-upload-row">
            <input name="logo" type="file" accept="image/*" />
            <div class="logo-preview">
              ${logoSrc(systemInfo) ? `<img src="${logoSrc(systemInfo)}" alt="Logo Vorschau" />` : "<span>Kein Logo hinterlegt</span>"}
            </div>
            ${systemInfo.hasLogo ? `<button class="ghost-button small-button" type="button" data-remove-logo>Logo entfernen</button>` : ""}
          </div>
        </div>
        <div class="settings-form-title">Kassenhinweis</div>
        <div class="field">
          <label>Rechner</label>
          <input name="calculatorName" value="${escapeHtml(state.settings.calculatorName)}" />
        </div>
        <div class="field">
          <label>Telefonnummer</label>
          <input name="calculatorPhone" value="${escapeHtml(state.settings.calculatorPhone)}" />
        </div>
        <div class="field">
          <label>Hinweis</label>
          <textarea name="calculatorComment" maxlength="400" rows="5">${escapeHtml(state.settings.calculatorComment || "")}</textarea>
        </div>
      </form>
    </section>
    <div class="settings-side-panels">
      ${networkQrTemplate()}
      ${canSetSystemTime() ? systemTimeTemplate() : ""}
    </div>
  `;
}

function networkQrTemplate() {
  if (!systemNetwork || !systemNetwork.url) {
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>QR-Code</h2>
            <p>Login-Seite, z. B. um den Tagesbericht vom Handy aus zu lesen.</p>
          </div>
        </div>
        <p class="hint">Netzwerkadresse konnte nicht ermittelt werden.</p>
      </section>
    `;
  }

  const qr = qrcode(0, "M");
  qr.addData(systemNetwork.url);
  qr.make();

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>QR-Code</h2>
          <p>Login-Seite, z. B. um den Tagesbericht vom Handy aus zu lesen.</p>
        </div>
      </div>
      <div class="qr-row">
        <div class="qr-code">${qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true })}</div>
        <div class="qr-info">
          <span>Adresse</span>
          <strong>${escapeHtml(systemNetwork.url)}</strong>
        </div>
      </div>
    </section>
  `;
}

function systemTimeTemplate() {
  const todayCount = todayOrders().length;
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Systemzeit</h2>
          <p>Nur relevant, wenn der Pi ohne Internet läuft und die Uhr nachgeht/vorgeht.</p>
        </div>
      </div>
      <form class="settings-form" data-system-time-form>
        <div class="field">
          <label>Aktuelle Systemzeit</label>
          <input type="datetime-local" name="dateTime" value="${toDateTimeLocalValue(systemInfo.serverTime)}" required />
        </div>
        ${todayCount > 0 ? `<p class="hint">Achtung: Es sind bereits ${todayCount} Buchung(en) mit dem aktuellen Datum gespeichert. Nach einer Korrektur können diese aus der Tagesauswertung herausfallen oder falsch einsortiert werden.</p>` : ""}
        <button class="action-button" type="submit">Uhrzeit setzen</button>
      </form>
    </section>
  `;
}

function userAccessTemplate() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h3>Benutzer & Passwörter</h3>
          <p>Passwörter werden nur als Hash in der Festdatei gespeichert.</p>
        </div>
      </div>
      <div class="user-list">
        ${state.users.map((user) => `
          <form class="user-password-card" data-password-user="${escapeHtml(user.username)}">
            <div>
              <strong>${escapeHtml(user.username)}</strong>
              <span>${roleLabel(user.role)}</span>
            </div>
            <div class="field">
              <label>Neues Passwort</label>
              <input name="password" type="password" autocomplete="new-password" minlength="4" />
            </div>
            <button class="action-button small-button" type="submit">Passwort setzen</button>
          </form>
        `).join("")}
      </div>
    </section>
  `;
}

function infoTemplate() {
  const display = browserDisplayInfo();
  // Die Git-Version ist nur dann eine echte Zusatzinformation, wenn die Kasse
  // aus einem Klon laeuft und zwischen zwei Releases steht. Wurde sie als ZIP
  // kopiert, gibt es kein Repository und die Zeile meldete bisher dauerhaft
  // "nicht verfügbar" - eine Zeile Rauschen neben der Programmversion.
  const gitCommit = displayValue(systemInfo.gitCommit, "");
  const rows = [
    ["Programmversion", displayValue(systemInfo.appVersion, "nicht verfügbar")],
    ...(gitCommit ? [["Git-Version", gitCommit]] : []),
    ["System", displayValue(systemInfo.platform, navigator.platform || "nicht verfügbar")],
    ["Node.js", displayValue(systemInfo.nodeVersion, "nicht verfügbar")],
    ["Angemeldet", sessionUser?.username || "-"],
    ["Rolle", sessionUser ? roleLabel(sessionUser.role) : "-"],
    ["Browser-Viewport", display.viewport],
    ["Bildschirm", display.screenSize],
    ["Pixelverhältnis", display.pixelRatio],
    ["Lizenz", displayValue(systemInfo.license, "MIT")],
    ["Copyright", displayValue(systemInfo.copyright, "Copyright (c) Andreas Spitzenberg")],
    ["GitHub", repositoryLinkTemplate()],
    ["Online-Version", versionCheck.label]
  ];
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Info</h2>
          <p>Version und Systemdaten für Fehleranalyse.</p>
        </div>
        <button class="action-button small-button" type="button" data-version-check>Version prüfen</button>
      </div>
      <table class="info-table">
        <tbody>
          ${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function repositoryLinkTemplate() {
  const url = displayValue(systemInfo.repositoryUrl, "");
  return url || "nicht verfügbar";
}

function printSettingsTemplate() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Drucken</h2>
          <p>Browserdruck, Testdateien und serieller Thermodrucker.</p>
        </div>
        <div class="header-actions">
          ${dirtyIndicator("print")}
          <button class="action-button" data-save-settings="print">Speichern</button>
        </div>
      </div>
      <form class="settings-form settings-form-wide" data-settings-form data-settings-section="print">
        <div class="field">
          <label>Druckmodus</label>
          <select name="printerMode">
            <option value="browser" ${state.settings.printerMode === "browser" ? "selected" : ""}>Browserdruck</option>
            <option value="serial" ${state.settings.printerMode === "serial" ? "selected" : ""}>Serieller Thermodrucker</option>
            <option value="textfile" ${state.settings.printerMode === "textfile" ? "selected" : ""}>Textdatei-Testdruck</option>
          </select>
        </div>
        <div class="field">
          <label>Drucker-Port</label>
          <input name="printerPort" value="${escapeHtml(state.settings.printerPort || "/dev/ttyUSB0")}" placeholder="/dev/ttyUSB0" />
        </div>
        <div class="field">
          <label>Textdatei-Verzeichnis</label>
          <input name="printOutputDir" value="${escapeHtml(state.settings.printOutputDir || "data/prints")}" />
          <small>Relativ zum Programmverzeichnis. Pfade ausserhalb werden auf <code>data/prints</code> zurückgesetzt.</small>
        </div>
        <div class="field settings-test-print">
          <button class="action-button" type="button" data-test-print>Testbon schreiben</button>
        </div>
      </form>
    </section>
  `;
}

function dataManagementTemplate() {
  return `
    <section class="panel data-panel">
      <div class="panel-header">
        <div>
          <h2>Daten & Vorlagen</h2>
          <p>Aktuelles Fest speichern oder vorhandene Vorlagen laden.</p>
        </div>
      </div>
      <div class="data-save-row">
        <div class="field data-new-field">
          <label>Vorlagenname</label>
          <input data-new-event-name value="${escapeHtml(state.settings.eventName)}" />
        </div>
        <button class="action-button" data-save-current-event>Aktuelles Fest speichern</button>
        <button class="action-button" data-load-default-event>Default laden</button>
      </div>
      <div class="event-list" data-event-list>
        ${eventCatalogTemplate()}
      </div>
    </section>
  `;
}

function eventCatalogTemplate() {
  if (!eventCatalog) {
    return `<p class="hint">Vorlagen werden geladen...</p>`;
  }

  const savedEvents = [
    ...(eventCatalog.saved || [])
  ];

  return `
    <section class="history-panel template-history-panel">
      <h3>Gespeicherte Vorlagen</h3>
      ${savedEvents.length ? savedEvents.map((event) => `
    <article class="history-card">
      <div>
        <strong>${escapeHtml(event.eventName)}</strong>
        <span>${eventMetaTemplate(event)}</span>
      </div>
      <div class="history-actions">
        <button class="action-button small-button" data-template-event="${escapeHtml(event.file)}">Fest laden</button>
        <button class="danger-button small-button" data-delete-event="${escapeHtml(event.file)}">Löschen</button>
      </div>
    </article>
  `).join("") : `<p class="hint">Noch keine gespeicherten Vorlagen.</p>`}
    </section>
  `;
}

function eventMetaTemplate(event) {
  const typeLabel = event.type === "defaults" ? "Systemvorlage" : "Vorlage";
  const date = event.updatedAt
    ? new Date(event.updatedAt)
    : new Date();
  return `${escapeHtml(event.clubName || "-")} - ${escapeHtml(event.sourceEventName || event.eventName || event.file)} - ${date.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })} - ${typeLabel}`;
}

function articleFormTemplate() {
  return `
    <form class="article-form" data-article-form>
      <div class="field wide">
        <label>Name</label>
        <input name="name" required />
      </div>
      <div class="field">
        <label>Preis</label>
        <input name="price" type="number" min="0" step="0.01" required />
      </div>
      <div class="field">
        <label>Bestand</label>
        <input name="stock" type="number" min="0" step="1" required />
      </div>
      <div class="field">
        <label>Warnbestand</label>
        <input name="warningStock" type="number" min="0" step="1" value="${escapeHtml(state.settings.defaultWarningStock)}" required />
      </div>
      <div class="field wide">
        <label>Kategorie</label>
        <select name="category">${categoryOptionsTemplate()}</select>
      </div>
      <button class="action-button" type="submit">Artikel anlegen</button>
    </form>
  `;
}

function articleEditTemplate(article, index) {
  return `
    <form class="article-edit-card" data-edit-article="${escapeHtml(article.id)}">
      <div class="row-actions">
        <button class="qty-button" type="button" data-move-article="${escapeHtml(article.id)}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="qty-button" type="button" data-move-article="${escapeHtml(article.id)}" data-direction="1" ${index === state.articles.length - 1 ? "disabled" : ""}>↓</button>
      </div>
      <div class="field">
        <label>Name</label>
        <input name="name" value="${escapeHtml(article.name)}" required />
      </div>
      <div class="field">
        <label>Preis</label>
        <input name="price" type="number" min="0" step="0.01" value="${escapeHtml(article.price)}" required />
      </div>
      <div class="field">
        <label>Bestand</label>
        <input name="stock" type="number" min="0" step="1" value="${escapeHtml(article.stock)}" required />
      </div>
      <div class="field">
        <label>Warnung</label>
        <input name="warningStock" type="number" min="0" step="1" value="${escapeHtml(article.warningStock)}" required />
      </div>
      <div class="field">
        <label>Kategorie</label>
        <select name="category">${categoryOptionsTemplate(article.category || "Sonstiges")}</select>
      </div>
      <div class="field">
        <label>Status</label>
        <select name="active">
          <option value="true" ${article.active ? "selected" : ""}>Aktiv</option>
          <option value="false" ${!article.active ? "selected" : ""}>Deaktiv</option>
        </select>
      </div>
      <button class="danger-button small-button" type="button" data-delete-article="${escapeHtml(article.id)}">Löschen</button>
    </form>
  `;
}

async function attemptLogin(username, password, force = false) {
  const response = await apiFetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, force })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 409 && !force) {
      const takeOver = window.confirm(`${payload.error || "Bereits angemeldet."}\n\nTrotzdem übernehmen und die andere Sitzung abmelden?`);
      if (takeOver) return attemptLogin(username, password, true);
    }
    return { ok: false, error: payload.error || "Login fehlgeschlagen." };
  }

  return { ok: true, user: payload.user, token: payload.token };
}

function bindLogin() {
  document.querySelector("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await attemptLogin(form.get("username"), form.get("password"));

    if (!result.ok) {
      const errorBox = document.querySelector("[data-login-error]");
      errorBox.textContent = result.error;
      errorBox.classList.remove("hidden");
      return;
    }

    sessionUser = result.user;
    sessionToken = result.token || null;
    sessionInvalidatedHandled = false;
    activeView = "cashier";
    activeAdminSection = "analysis";
    rememberSessionUser();

    if (sessionUser.role === "report") {
      window.location.href = "/report.html";
      return;
    }

    state = await loadState();
    render();
  });
}

function bindShell() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", (event) => {
      logViewTransition(button.dataset.view, {
        reason: "tab-click",
        isTrusted: event.isTrusted,
        buttonLabel: button.textContent.trim()
      });
      activeView = button.dataset.view;
      rememberSessionUser();
      render();
    });
  });

  document.querySelector("[data-system-menu]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const panel = document.querySelector("[data-system-menu-panel]");
    const expanded = panel?.classList.toggle("hidden") === false;
    event.currentTarget.setAttribute("aria-expanded", String(expanded));
    if (expanded) {
      document.addEventListener("click", closeSystemMenu, { once: true });
    }
  });

  document.querySelectorAll(".system-menu [data-admin-section]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = "admin";
      activeAdminSection = button.dataset.adminSection;
      rememberSessionUser();
      render();
    });
  });

  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    setThemeMode(themeMode === "light" ? "dark" : "light");
    render();
  });

  document.querySelector("[data-logout]")?.addEventListener("click", () => {
    apiFetch("/api/logout", { method: "POST" }).catch(() => {});
    clearSessionUser();
    cart = [];
    paidAmount = "";
    clearInterval(printerStatusTimer);
    clearInterval(clockTimer);
    render();
  });
  document.querySelector("[data-system-shutdown]")?.addEventListener("click", shutdownSystem);

  startClock();
  startPrinterStatus();
}

function closeSystemMenu() {
  document.querySelector("[data-system-menu-panel]")?.classList.add("hidden");
  document.querySelector("[data-system-menu]")?.setAttribute("aria-expanded", "false");
}

function startClock() {
  clearInterval(clockTimer);
  const tick = () => {
    document.querySelectorAll("[data-clock]").forEach((element) => {
      element.textContent = cashierDateTime();
    });
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}

function startPrinterStatus() {
  clearInterval(printerStatusTimer);
  refreshPrinterStatus();
  printerStatusTimer = setInterval(refreshPrinterStatus, 10000);
}

async function refreshPrinterStatus() {
  try {
    const response = await apiFetch(`/api/print/status?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Status nicht verfügbar");
    const payload = await response.json();
    printerStatus = { ...printerStatus, ...(payload.status || {}) };
  } catch (error) {
    printerStatus = { ...printerStatus, online: false, label: "Drucker Offline" };
  }
  updatePrinterStatusDisplay();
}

function updatePrinterStatusDisplay() {
  const statusElement = document.querySelector("[data-printer-status]");
  const box = document.querySelector(".cashier-status-box");
  if (!statusElement || !box) return;
  const online = Boolean(printerStatus.online);
  const label = printerStatus.label || (online ? "Drucker" : "Drucker Offline");
  statusElement.classList.toggle("online", online);
  statusElement.classList.toggle("offline", !online);
  box.classList.toggle("online", online);
  box.classList.toggle("offline", !online);
  statusElement.innerHTML = `<span class="printer-dot"></span>${escapeHtml(label)}`;
}

function bindCashier() {
  document.querySelectorAll("[data-add-article]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.addArticle));
  });

  bindCart();
}

function bindCart() {
  document.querySelectorAll("[data-inc]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.inc));
  });

  document.querySelectorAll("[data-dec]").forEach((button) => {
    button.addEventListener("click", () => decrementCart(button.dataset.dec));
  });

  document.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      cart = cart.filter((item) => item.articleId !== button.dataset.remove);
      renderCart();
      updateArticleButtonState(button.dataset.remove);
    });
  });

  document.querySelector("[data-cancel-cart]")?.addEventListener("click", cancelCart);
  document.querySelector("[data-undo-last-checkout]")?.addEventListener("click", undoLastCheckout);
  document.querySelector("[data-print-paid]").addEventListener("click", () => checkout(false));
  document.querySelector("[data-print-free]").addEventListener("click", () => checkout(true));

  const paidInput = document.querySelector("[data-paid-amount]");
  paidInput.addEventListener("focus", (event) => {
    event.target.value = editableMoneyInput(paidAmount);
    event.target.select();
  });
  paidInput.addEventListener("input", (event) => {
    paidAmount = parseMoneyInput(event.target.value);
    updateChangeOutput();
  });
  paidInput.addEventListener("blur", (event) => {
    event.target.value = moneyInput(paidAmount);
  });
}

function renderCart() {
  const cartPanel = document.querySelector("[data-cart-panel]");
  if (!cartPanel) {
    renderCashier();
    return;
  }

  cartPanel.outerHTML = cartTemplate();
  bindCart();
}

function updateArticleButtonState(articleId) {
  const article = state.articles.find((item) => item.id === articleId);
  // CSS.escape, damit eine Artikel-ID mit Anfuehrungszeichen den Selektor
  // nicht zerlegt (IDs stammen zwar aus uid(), aber auch aus geladenen
  // Festdateien).
  const button = document.querySelector(`[data-add-article="${CSS.escape(String(articleId ?? ""))}"]`);
  if (!article || !button) return;

  const reserved = cart.find((item) => item.articleId === articleId)?.quantity || 0;
  const out = article.stock <= 0 || reserved >= article.stock;
  const low = !out && article.stock <= article.warningStock;
  const stockElement = button.querySelector("[data-article-stock]");
  button.disabled = out;
  button.classList.toggle("out", out);
  // Die Warnung muss hier mitlaufen: nach einer Buchung zeichnet checkout() die
  // Kacheln nicht neu, sondern ruft nur diese Funktion fuer die betroffenen
  // Artikel auf. Ohne das erscheint "Nur noch ..." erst beim naechsten
  // vollstaendigen Neuzeichnen, also unter Umstaenden Stunden spaeter.
  button.classList.toggle("low", low);
  if (stockElement) {
    stockElement.classList.toggle("article-stock-low", low);
    stockElement.textContent = articleStockText(article);
  }
}

function updateChangeOutput() {
  const output = document.querySelector("[data-change-output]");
  if (!output) return;
  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  output.textContent = money(Math.max(0, Number(paidAmount || 0) - total));
}

function bindAdmin() {
  document.querySelectorAll(".admin-layout [data-admin-section]").forEach((button) => {
    button.addEventListener("click", () => {
      activeAdminSection = button.dataset.adminSection;
      renderAdmin();
    });
  });

  document.querySelector("[data-print-report]")?.addEventListener("click", printDailyReport);
  document.querySelector("[data-version-check]")?.addEventListener("click", checkOnlineVersion);
  document.querySelector("[data-reset-day]")?.addEventListener("click", resetDayCash);
  document.querySelectorAll("[data-print-history]").forEach((button) => {
    button.addEventListener("click", () => printArchivedReport(button.dataset.printHistory));
  });
  document.querySelectorAll("[data-delete-history]").forEach((button) => {
    button.addEventListener("click", () => deleteArchivedReport(button.dataset.deleteHistory));
  });

  document.querySelectorAll("[data-save-settings]").forEach((button) => {
    button.addEventListener("click", () => saveSettings(button.dataset.saveSettings || activeAdminSection, button));
  });
  document.querySelector("[data-test-print]")?.addEventListener("click", (event) => testPrint(event.currentTarget));
  document.querySelector("[data-remove-logo]")?.addEventListener("click", (event) => removeLogo(event.currentTarget));
  document.querySelectorAll("[data-settings-form]").forEach((formElement) => {
    const section = formElement.dataset.settingsSection || activeAdminSection;
    formElement.addEventListener("input", () => markAdminDirty(section));
    formElement.addEventListener("change", () => markAdminDirty(section));
    formElement.addEventListener("submit", (event) => {
      event.preventDefault();
      saveSettings(section, event.submitter);
    });
  });
  document.querySelector("[data-save-current-event]")?.addEventListener("click", (event) => saveCurrentEvent(event.currentTarget));
  document.querySelectorAll("[data-password-user]").forEach((formElement) => {
    formElement.addEventListener("submit", setUserPassword);
  });
  document.querySelector("[data-system-time-form]")?.addEventListener("submit", setSystemDateTime);
  document.querySelectorAll("[data-template-event]").forEach((button) => {
    button.addEventListener("click", () => loadManagedEvent(button.dataset.templateEvent, "template"));
  });
  document.querySelectorAll("[data-delete-event]").forEach((button) => {
    button.addEventListener("click", () => deleteManagedEvent(button.dataset.deleteEvent));
  });
  document.querySelector("[data-load-default-event]")?.addEventListener("click", loadDefaultEvent);
  if (activeAdminSection === "data") {
    refreshEventCatalog();
  }

  document.querySelector("[data-save-categories]")?.addEventListener("click", saveCategories);
  document.querySelector("[data-save-articles]")?.addEventListener("click", saveArticles);

  document.querySelector("[data-category-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.settings.categories.length >= MAX_CATEGORIES) {
      showToast(`Fehler: Maximal ${MAX_CATEGORIES} Kategorien erlaubt.`);
      return;
    }
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    if (!name || state.settings.categories.some((category) => category.name === name)) {
      showToast("Kategorie existiert schon oder ist leer.");
      return;
    }
    state.settings.categories.push({ name, color: String(form.get("color")) || colorForCategory(name) });
    state.settings.categories = normalizeCategories(state.settings.categories, state.articles);
    if (!(await saveState())) return;
    clearAdminDirty("categories");
    showToast("Kategorie angelegt.");
    renderAdmin();
  });

  document.querySelectorAll("[data-delete-category]").forEach((button) => {
    button.addEventListener("click", () => deleteCategory(button.dataset.deleteCategory));
  });

  const createForm = document.querySelector("[data-article-form]");
  createForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.articles.push({
      id: uid("art"),
      name: String(form.get("name")).trim(),
      price: Number(form.get("price")),
      stock: Number(form.get("stock")),
      warningStock: Number(form.get("warningStock")),
      category: String(form.get("category")).trim() || "Sonstiges",
      categoryColor: getCategoryColor(String(form.get("category")).trim() || "Sonstiges"),
      sortOrder: nextArticleSortOrder(),
      active: true
    });
    saveState();
    clearAdminDirty("articles");
    showToast("Artikel angelegt.");
    renderAdmin();
  });

  document.querySelectorAll("[data-edit-article]").forEach((formElement) => {
    formElement.addEventListener("input", () => markAdminDirty("articles"));
    formElement.addEventListener("change", () => markAdminDirty("articles"));
    formElement.addEventListener("submit", (event) => {
      event.preventDefault();
      saveArticles();
    });
  });

  document.querySelectorAll("[data-edit-category]").forEach((formElement) => {
    formElement.addEventListener("input", () => markAdminDirty("categories"));
    formElement.addEventListener("change", () => markAdminDirty("categories"));
    formElement.addEventListener("submit", (event) => {
      event.preventDefault();
      saveCategories();
    });
  });

  document.querySelectorAll("[data-delete-article]").forEach((button) => {
    button.addEventListener("click", () => {
      const article = state.articles.find((item) => item.id === button.dataset.deleteArticle);
      if (!article || !window.confirm(`Artikel "${article.name}" wirklich löschen?`)) return;
      state.articles = state.articles.filter((item) => item.id !== article.id);
      resequenceArticles();
      saveState();
      clearAdminDirty("articles");
      showToast("Artikel gelöscht.");
      renderAdmin();
    });
  });

  document.querySelectorAll("[data-move-article]").forEach((button) => {
    button.addEventListener("click", () => {
      moveArticle(button.dataset.moveArticle, Number(button.dataset.direction));
      saveState();
      clearAdminDirty("articles");
      renderAdmin();
    });
  });
}

function markAdminDirty(section) {
  adminSavedSections.delete(section);
  if (adminDirtySections.has(section)) return;
  adminDirtySections.add(section);
  updateAdminSaveFeedback(section);
}

function clearAdminDirty(section, showSaved = true) {
  adminDirtySections.delete(section);
  if (showSaved) {
    adminSavedSections.add(section);
    window.setTimeout(() => {
      adminSavedSections.delete(section);
      updateAdminSaveFeedback(section);
    }, 2400);
  }
  updateAdminSaveFeedback(section);
}

function getAdminSaveButton(section) {
  return document.querySelector(`[data-save-${section}], [data-save-settings="${section}"]`);
}

function updateAdminSaveFeedback(section) {
  const button = getAdminSaveButton(section);
  const actions = button?.closest(".header-actions");
  if (!actions) return;

  actions.querySelectorAll("[data-unsaved], [data-saved]").forEach((item) => item.remove());
  const indicator = dirtyIndicator(section);
  if (indicator) {
    actions.insertAdjacentHTML("afterbegin", indicator);
  }

  const saved = adminSavedSections.has(section) && !adminDirtySections.has(section);
  button.textContent = saved ? "Gespeichert" : "Speichern";
  button.classList.toggle("saved-button", saved);
}

function setButtonState(button, label, disabled = true) {
  if (!button) return () => {};
  const originalLabel = button.textContent;
  const wasDisabled = button.disabled;
  button.textContent = label;
  button.disabled = disabled;
  return (nextLabel = originalLabel) => {
    button.textContent = nextLabel;
    button.disabled = wasDisabled;
  };
}

async function refreshEventCatalog() {
  const response = await apiFetch("/api/events");
  if (!response.ok) {
    showToast("Festliste konnte nicht geladen werden.");
    return;
  }
  eventCatalog = await response.json();
  const list = document.querySelector("[data-event-list]");
  if (list) {
    list.innerHTML = eventCatalogTemplate();
    bindEventCatalogActions();
  }
}

async function checkOnlineVersion() {
  versionCheck = { status: "checking", label: "prüfe..." };
  renderAdmin();
  try {
    const response = await apiFetch(`/api/version-check?t=${Date.now()}`, { cache: "no-store" });
    const payload = response.ok ? await response.json() : {};
    if (!payload.ok) {
      versionCheck = {
        status: "unavailable",
        label: `nicht verfügbar (${payload.error || "keine Verbindung oder privates Repository"})`
      };
    } else if (payload.updateAvailable) {
      versionCheck = {
        status: "update",
        label: `Update verfügbar: ${payload.latestVersion} (installiert: ${payload.currentVersion})`
      };
    } else {
      versionCheck = {
        status: "current",
        label: `aktuell (${payload.currentVersion})`
      };
    }
  } catch (error) {
    versionCheck = { status: "unavailable", label: "nicht verfügbar (keine Verbindung oder privates Repository)" };
  }
  renderAdmin();
}

function bindEventCatalogActions() {
  document.querySelectorAll("[data-template-event]").forEach((button) => {
    button.addEventListener("click", () => loadManagedEvent(button.dataset.templateEvent, "template"));
  });
  document.querySelectorAll("[data-delete-event]").forEach((button) => {
    button.addEventListener("click", () => deleteManagedEvent(button.dataset.deleteEvent));
  });
}

async function saveCurrentEvent(button) {
  const finishButton = setButtonState(button, "Speichern...");
  const name = document.querySelector("[data-new-event-name]")?.value || state.settings.eventName;
  const response = await apiFetch("/api/events/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if (!response.ok) {
    finishButton();
    showToast("Fest konnte nicht gesichert werden.");
    return;
  }
  const payload = await response.json();
  state = normalizeState(payload.state);
  systemInfo = { ...systemInfo, ...(payload.system || {}) };
  showToast(`Fest gesichert: ${payload.file}`);
  finishButton("Gespeichert");
  await refreshEventCatalog();
  window.setTimeout(() => finishButton(), 1200);
}

async function loadDefaultEvent() {
  if (!window.confirm("Default als Vorlage laden?\n\nVerkäufe und Tagesabschlüsse werden geleert, Grundartikel und Einstellungen übernommen.")) return;
  const response = await apiFetch("/api/events/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "defaults", mode: "template" })
  });
  await applyEventResponse(response, "Default als Vorlage geladen.");
}

async function loadManagedEvent(file, mode) {
  const text = mode === "template"
    ? `Fest "${file}" als Vorlage verwenden?\n\nVerkäufe und Tagesabschlüsse werden geleert, Artikel und Einstellungen übernommen.`
    : `Fest "${file}" vollständig laden?\n\nDas aktuelle Fest wird ersetzt.`;
  if (!window.confirm(text)) return;
  const response = await apiFetch("/api/events/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, mode })
  });
  await applyEventResponse(response, mode === "template" ? "Vorlage geladen." : "Fest geladen.");
}

async function deleteManagedEvent(file) {
  if (!window.confirm(`Festdatei "${file}" endgültig löschen?`)) return;
  const response = await apiFetch("/api/events", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file })
  });
  if (!response.ok) {
    showToast("Festdatei konnte nicht gelöscht werden.");
    return;
  }
  showToast("Festdatei gelöscht.");
  await refreshEventCatalog();
}

async function applyEventResponse(response, message) {
  if (!response.ok) {
    showToast("Festdaten konnten nicht geladen werden.");
    return;
  }
  const payload = await response.json();
  state = normalizeState(payload.state);
  systemInfo = { ...systemInfo, ...(payload.system || {}) };
  cart = [];
  paidAmount = "";
  eventCatalog = null;
  showToast(message);
  render();
}

async function setUserPassword(event) {
  event.preventDefault();
  // event.currentTarget wird vom Browser auf null zurueckgesetzt, sobald das
  // Dispatch des Events fertig ist - nach einem await (hier zweimal) waere
  // der Zugriff darauf also ein Absturz. Deshalb frueh in eine Variable holen.
  const form = event.currentTarget;
  const finishButton = setButtonState(event.submitter, "Speichern...");
  const formData = new FormData(form);
  const password = String(formData.get("password") || "");
  if (password.length < 4) {
    finishButton();
    showToast("Passwort bitte mit mindestens 4 Zeichen setzen.");
    return;
  }
  const username = form.dataset.passwordUser;
  const response = await apiFetch("/api/users/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    finishButton();
    showToast("Passwort konnte nicht gespeichert werden.");
    return;
  }
  const payload = await response.json().catch(() => ({}));
  systemInfo = { ...systemInfo, ...(payload.system || {}) };
  form.reset();
  finishButton("Gespeichert");
  showToast(`Passwort für ${username} gespeichert.`);
  window.setTimeout(() => finishButton(), 1200);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("Datei nicht lesbar.")));
    reader.readAsDataURL(file);
  });
}

// Laedt das Logo in seine eigene Datei (siehe /api/logo) und uebernimmt die
// neue Version in die Systeminfo, damit Vorschau und Favicon nicht das alte
// Bild aus dem Browser-Cache zeigen.
async function uploadLogo(file) {
  let dataUrl = "";
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch (error) {
    showToast("Logo konnte nicht gelesen werden.");
    return false;
  }
  const response = await apiFetch("/api/logo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showToast(payload.error || "Logo konnte nicht gespeichert werden.");
    return false;
  }
  systemInfo = { ...systemInfo, ...payload };
  return true;
}

async function removeLogo(button) {
  if (!window.confirm("Logo wirklich entfernen?")) return;
  const finishButton = setButtonState(button, "Entfernen...");
  const response = await apiFetch("/api/logo", { method: "DELETE" });
  if (!response.ok) {
    finishButton();
    showToast("Logo konnte nicht entfernt werden.");
    return;
  }
  systemInfo = { ...systemInfo, ...(await response.json().catch(() => ({}))) };
  updateFavicon();
  showToast("Logo entfernt.");
  render();
}

async function saveSettings(section = "settings", button = getAdminSaveButton(section)) {
  const finishButton = setButtonState(button, "Speichern...");
  const formElement = document.querySelector("[data-settings-form]");
  if (!formElement) {
    finishButton();
    return;
  }
  const form = new FormData(formElement);
    if (form.has("eventName")) state.settings.eventName = String(form.get("eventName")).trim() || "<Festname>";
    if (form.has("clubName")) state.settings.clubName = String(form.get("clubName")).trim() || "<Organisation>";
    if (form.has("calculatorName")) state.settings.calculatorName = String(form.get("calculatorName")).trim();
    if (form.has("calculatorPhone")) state.settings.calculatorPhone = String(form.get("calculatorPhone")).trim();
    if (form.has("calculatorComment")) state.settings.calculatorComment = String(form.get("calculatorComment")).trim().slice(0, 400);
    if (form.has("printerMode")) state.settings.printerMode = String(form.get("printerMode") || "browser");
    if (form.has("printerPort")) state.settings.printerPort = String(form.get("printerPort") || "/dev/ttyUSB0").trim();
    if (form.has("printOutputDir")) state.settings.printOutputDir = String(form.get("printOutputDir") || "data/prints").trim() || "data/prints";
    const logo = form.get("logo");
    if (logo && logo.size) {
      // Das Logo geht an seinen eigenen Endpunkt und nicht mehr in die
      // Festdatei - zuerst hochladen, denn schlaegt das fehl, sollen die
      // uebrigen Einstellungen gar nicht erst gespeichert werden.
      if (!(await uploadLogo(logo))) {
        finishButton();
        return;
      }
      updateFavicon();
    }

    if (!(await saveState())) {
      finishButton();
      return;
    }
    clearAdminDirty(section);
    showToast("Einstellungen gespeichert.");
    finishButton("Gespeichert");
    render();
}

async function saveCategories() {
  const finishButton = setButtonState(getAdminSaveButton("categories"), "Speichern...");
  const categoryCreateForm = document.querySelector("[data-category-form]");
  const pendingCategoryName = categoryCreateForm
    ? String(new FormData(categoryCreateForm).get("name") || "").trim()
    : "";
  if (pendingCategoryName) {
    finishButton();
    if (state.settings.categories.length >= MAX_CATEGORIES) {
      showToast(`Fehler: Maximal ${MAX_CATEGORIES} Kategorien erlaubt.`);
      return;
    }
    showToast("Neue Kategorie bitte mit „Kategorie anlegen“ hinzufügen.");
    return;
  }

  const changes = [];
  for (const formElement of document.querySelectorAll("[data-edit-category]")) {
    const form = new FormData(formElement);
    const categoryName = formElement.dataset.editCategory;
    const newName = String(form.get("name")).trim();
      if (!newName) {
        finishButton();
        showToast("Kategoriename darf nicht leer sein.");
        return;
      }
      if (newName !== categoryName && state.settings.categories.some((item) => item.name === newName)) {
        finishButton();
        showToast("Kategorie existiert schon.");
        return;
      }
      const category = state.settings.categories.find((item) => item.name === categoryName);
      if (!category) continue;
      changes.push({ oldName: categoryName, newName, color: String(form.get("color")) || category.color });
  }

  changes.forEach((change) => {
      const category = state.settings.categories.find((item) => item.name === change.oldName);
      category.name = change.newName;
      category.color = change.color;
      state.articles.forEach((article) => {
        if (article.category === change.oldName) {
          article.category = change.newName;
          article.categoryColor = category.color;
        }
      });
    });

  state.settings.categories = normalizeCategories(state.settings.categories, state.articles);
  if (!(await saveState())) {
    finishButton();
    return;
  }
  clearAdminDirty("categories");
  showToast("Kategorien gespeichert.");
  finishButton("Gespeichert");
  renderAdmin();
}

async function saveArticles() {
  const finishButton = setButtonState(getAdminSaveButton("articles"), "Speichern...");
  document.querySelectorAll("[data-edit-article]").forEach((formElement) => {
      const form = new FormData(formElement);
      const article = state.articles.find((item) => item.id === formElement.dataset.editArticle);
      if (!article) return;
      article.name = String(form.get("name")).trim();
      article.price = Number(form.get("price"));
      article.stock = Number(form.get("stock"));
      article.warningStock = Number(form.get("warningStock"));
      article.category = String(form.get("category")).trim() || "Sonstiges";
      article.categoryColor = getCategoryColor(article.category);
      article.active = form.get("active") === "true";
    });
  if (!(await saveState())) {
    finishButton();
    return;
  }
  clearAdminDirty("articles");
  showToast("Artikel gespeichert.");
  finishButton("Gespeichert");
  renderAdmin();
}

function nextArticleSortOrder() {
  return Math.max(0, ...state.articles.map((article) => Number(article.sortOrder) || 0)) + 1;
}

function resequenceArticles() {
  state.articles.forEach((article, index) => {
    article.sortOrder = index + 1;
  });
}

function moveArticle(articleId, direction) {
  const index = state.articles.findIndex((article) => article.id === articleId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= state.articles.length) return;
  const [article] = state.articles.splice(index, 1);
  state.articles.splice(targetIndex, 0, article);
  resequenceArticles();
}

function ensureCategory(name, color = colorForCategory(name)) {
  if (!state.settings.categories.some((category) => category.name === name)) {
    if (state.settings.categories.length >= MAX_CATEGORIES) {
      return false;
    }
    state.settings.categories.push({ name, color });
  }
  return true;
}

function deleteCategory(categoryName) {
  const usedCount = state.articles.filter((article) => article.category === categoryName).length;
  const message = usedCount
    ? `Kategorie "${categoryName}" löschen?\n\n${usedCount} Artikel werden nach "Sonstiges" verschoben.`
    : `Kategorie "${categoryName}" wirklich löschen?`;
  if (!window.confirm(message)) return;

  ensureCategory("Sonstiges");
  const fallbackColor = getCategoryColor("Sonstiges");
  state.articles.forEach((article) => {
    if (article.category === categoryName) {
      article.category = "Sonstiges";
      article.categoryColor = fallbackColor;
    }
  });
  state.settings.categories = state.settings.categories.filter((category) => category.name !== categoryName);
  state.settings.categories = normalizeCategories(state.settings.categories, state.articles);
  saveState();
  clearAdminDirty("categories");
  showToast("Kategorie gelöscht.");
  renderAdmin();
}

function addToCart(articleId) {
  if (checkoutInProgress) return;
  const article = state.articles.find((item) => item.id === articleId);
  const inCart = cart.find((item) => item.articleId === articleId);
  const alreadyReserved = inCart ? inCart.quantity : 0;

  if (!article || article.stock <= alreadyReserved) {
    showToast("Bestand reicht nicht mehr aus.");
    return;
  }

  if (inCart) {
    inCart.quantity += 1;
  } else {
    cart.push({
      articleId: article.id,
      name: article.name,
      quantity: 1,
      unitPrice: article.price
    });
  }

  renderCart();
  updateArticleButtonState(articleId);
}

function decrementCart(articleId) {
  if (checkoutInProgress) return;
  const item = cart.find((cartItem) => cartItem.articleId === articleId);
  if (!item) return;

  item.quantity -= 1;
  if (item.quantity <= 0) {
    cart = cart.filter((cartItem) => cartItem.articleId !== articleId);
  }

  renderCart();
  updateArticleButtonState(articleId);
}

function cancelCart() {
  if (checkoutInProgress || !cart.length) return;

  state.cancellations.push({
    id: uid("can"),
    createdAt: new Date().toISOString(),
    cashierId: sessionUser.id,
    reason: "Warenkorb geleert",
    items: cloneData(cart)
  });
  saveState();
  cart = [];
  paidAmount = "";
  showToast("Warenkorb geleert.");
  renderCart();
  state.articles.forEach((article) => updateArticleButtonState(article.id));
}

async function checkout(isFree) {
  if (checkoutInProgress || !cart.length) return;
  const receiptTime = new Date();
  let nextReceiptNumber = Math.max(1, Number(state.settings.nextReceiptNumber) || 1);

  // Kostenlose Buchungen werden als eigene Order Items markiert, damit die Auswertung sie sauber trennen kann.
  const items = cart.map((item) => {
    const unitPrice = isFree ? 0 : item.unitPrice;
    return {
      id: uid("itm"),
      articleId: item.articleId,
      name: item.name,
      quantity: item.quantity,
      unitPrice,
      lineTotal: unitPrice * item.quantity,
      isFree
    };
  });
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  for (const item of cart) {
    const article = state.articles.find((candidate) => candidate.id === item.articleId);
    if (!article || article.stock < item.quantity) {
      showToast(`Nicht genug Bestand für ${item.name}.`);
      return;
    }
  }

  const receiptItems = items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => ({
      articleId: item.articleId,
      articleName: item.name,
      name: item.name,
      price: item.unitPrice,
      unitPrice: item.unitPrice,
      isFree,
      createdAt: receiptTime.toISOString(),
      receiptNumber: nextReceiptNumber++
    }))
  );

  // Ab hier wird der Zustand veraendert: der Knopf bleibt gesperrt, bis die
  // Buchung durch ist. Sonst bucht ein zweiter Klick waehrend des Wartens ein
  // zweites Mal. checkoutInProgress sperrt zusaetzlich den Warenkorb, damit
  // ein Neuzeichnen die Knoepfe nicht wieder freischaltet.
  checkoutInProgress = true;
  const finishPaidButton = setButtonState(document.querySelector("[data-print-paid]"), "Bucht...");
  const finishFreeButton = setButtonState(document.querySelector("[data-print-free]"), "Bucht...");

  const changedArticleIds = cart.map((item) => item.articleId);
  const previousReceiptNumber = state.settings.nextReceiptNumber;
  const orderId = uid("ord");
  let saved = false;

  // Nimmt die lokalen Aenderungen zurueck, solange nichts gespeichert wurde.
  // Ohne das bleibt der Bestand reduziert und die Bestellung im Zustand, waehrend
  // der Server nichts davon weiss.
  const rollback = () => {
    state.orders = state.orders.filter((order) => order.id !== orderId);
    state.settings.nextReceiptNumber = previousReceiptNumber;
    cart.forEach((item) => {
      const article = state.articles.find((candidate) => candidate.id === item.articleId);
      if (article) article.stock += item.quantity;
    });
  };

  try {
    cart.forEach((item) => {
      const article = state.articles.find((candidate) => candidate.id === item.articleId);
      article.stock -= item.quantity;
    });

    state.settings.nextReceiptNumber = nextReceiptNumber;
    state.orders.push({
      id: orderId,
      createdAt: receiptTime.toISOString(),
      cashierId: sessionUser.id,
      status: "paid",
      paidAmount: isFree ? 0 : Number(paidAmount || total),
      changeAmount: isFree ? 0 : Math.max(0, Number(paidAmount || total) - total),
      total,
      receiptNumbers: receiptItems.map((receipt) => receipt.receiptNumber),
      items
    });

    // Erst speichern, dann drucken: einen fehlenden Bon kann man stornieren und
    // neu buchen, eine verlorene Buchung laesst sich nicht rekonstruieren.
    if (!(await saveState())) {
      rollback();
      return;
    }
    saved = true;

    lastCheckout = { orderId, expiresAt: Date.now() + LAST_RECEIPT_UNDO_MS };
    scheduleUndoCheckoutExpiry();
    cart = [];
    paidAmount = "";

    if (await printReceipt(receiptItems, total, isFree, receiptTime)) {
      showToast(isFree ? "Kostenlos gebucht." : "Bezahlt und gespeichert.");
    } else {
      // Typ ausdruecklich: an der Kasse zeigt showToast nur Warnungen und
      // Fehler, und "gebucht" allein wuerde als Erfolg durchgehen.
      showToast("Gebucht, aber der Bon wurde nicht gedruckt. Bei Bedarf stornieren und erneut buchen.", "warning");
    }
  } catch (error) {
    if (!saved) {
      rollback();
      showToast("Buchung fehlgeschlagen, es wurde nichts gebucht. Bitte erneut versuchen.", "error");
    } else {
      // Typ ausdruecklich: an der Kasse zeigt showToast nur Warnungen und
      // Fehler, und "gebucht" allein wuerde als Erfolg durchgehen.
      showToast("Gebucht, aber der Bon wurde nicht gedruckt. Bei Bedarf stornieren und erneut buchen.", "warning");
    }
  } finally {
    checkoutInProgress = false;
    finishPaidButton();
    finishFreeButton();
    renderCart();
    changedArticleIds.forEach(updateArticleButtonState);
  }
}

async function undoLastCheckout() {
  if (checkoutInProgress) return;
  if (!canUndoLastCheckout()) {
    lastCheckout = null;
    renderCart();
    return;
  }

  const order = state.orders.find((item) => item.id === lastCheckout.orderId && item.status === "paid");
  if (!order) {
    lastCheckout = null;
    renderCart();
    return;
  }

  if (!window.confirm("Letzten Bon wirklich stornieren?")) return;

  // Gleiche Absicherung wie beim Buchen: sperren, aendern, speichern, bei
  // einem Fehler alles zuruecknehmen.
  checkoutInProgress = true;
  const finishUndoButton = setButtonState(document.querySelector("[data-undo-last-checkout]"), "Storniert...");

  const changedArticleIds = [];
  const cancellationId = uid("can");
  let saved = false;
  const rollback = () => {
    changedArticleIds.forEach((articleId) => {
      const article = state.articles.find((candidate) => candidate.id === articleId);
      const item = order.items.find((candidate) => candidate.articleId === articleId);
      if (article && item) article.stock -= item.quantity;
    });
    state.cancellations = state.cancellations.filter((item) => item.id !== cancellationId);
    if (!state.orders.some((item) => item.id === order.id)) state.orders.push(order);
  };

  try {
    order.items.forEach((item) => {
      const article = state.articles.find((candidate) => candidate.id === item.articleId);
      if (!article) return;
      article.stock += item.quantity;
      changedArticleIds.push(item.articleId);
    });

    state.orders = state.orders.filter((item) => item.id !== order.id);
    state.cancellations.push({
      id: cancellationId,
      createdAt: new Date().toISOString(),
      cashierId: sessionUser.id,
      reason: "Storno letzter Bon",
      orderId: order.id,
      receiptNumbers: order.receiptNumbers || [],
      items: cloneData(order.items)
    });

    if (!(await saveState())) {
      rollback();
      return;
    }
    saved = true;
    lastCheckout = null;
    scheduleUndoCheckoutExpiry();
    showToast("Letzter Bon storniert.");
  } catch (error) {
    if (saved) {
      showToast("Storno gespeichert, die Anzeige ist möglicherweise nicht aktuell.", "warning");
    } else {
      rollback();
      showToast("Storno fehlgeschlagen, der Bon bleibt gebucht. Bitte erneut versuchen.", "error");
    }
  } finally {
    checkoutInProgress = false;
    finishUndoButton();
    renderCart();
    changedArticleIds.forEach(updateArticleButtonState);
  }
}

async function printReceipt(receipts, total, isFree, receiptTime = new Date()) {
  if (state.settings.printerMode === "textfile" || state.settings.printerMode === "serial") {
    const response = await apiFetch("/api/print/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Druckeinstellungen liest der Server aus der Festdatei, nicht aus der Anfrage.
      body: JSON.stringify({ receipts })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      showToast(payload.error || "Drucken fehlgeschlagen.");
      return false;
    }
    const payload = await response.json();
    if (payload.mode === "textfile" && payload.files?.length) {
      showToast(`${payload.files.length} Bon-Datei(en) geschrieben.`);
    }
    return true;
  }

  const receiptHtml = receipts.map((item) => receiptTemplate(item, receiptTime, isFree)).join("");

  renderPrint(`
    <section class="receipt-roll">
      ${receiptHtml}
    </section>
  `);
  return true;
}

async function testPrint(button) {
  const formElement = document.querySelector("[data-settings-form]");
  const form = formElement ? new FormData(formElement) : new FormData();
  // Nur die drei Druckfelder gehen an den Server - mehr nimmt er nicht an.
  const settings = {
    printerMode: String(form.get("printerMode") || state.settings.printerMode || "browser"),
    printerPort: String(form.get("printerPort") || state.settings.printerPort || "/dev/ttyUSB0").trim(),
    printOutputDir: String(form.get("printOutputDir") || state.settings.printOutputDir || "data/prints").trim()
  };
  const finishButton = setButtonState(button, settings.printerMode === "serial" ? "Drucke..." : "Schreibe...");

  const response = await apiFetch("/api/print/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    finishButton();
    showToast(payload.error || "Testdruck fehlgeschlagen.");
    return;
  }

  finishButton(payload.mode === "serial" ? "Gedruckt" : "Geschrieben");
  showToast(payload.files?.length ? `Testbon geschrieben: ${payload.files[0]}` : "Testdruck ausgeführt.");
  window.setTimeout(() => finishButton(), 1200);
}

function receiptTemplate(item, receiptTime, isFree) {
  return `
    <article class="receipt-ticket">
      <h1>${escapeHtml(state.settings.eventName)}</h1>
      <p class="receipt-club">${escapeHtml(state.settings.clubName)}</p>
      <p class="receipt-meta">Bon #${formatReceiptNumber(item.receiptNumber)} · ${cashierDateTime(receiptTime)}</p>
      <div class="receipt-divider"></div>
      <strong class="receipt-item">${escapeHtml(item.articleName || item.name)}</strong>
      ${isFree ? `<span class="receipt-free">Kostenlos</span>` : `<span class="receipt-price">${money(item.price ?? item.unitPrice)}</span>`}
      <div class="receipt-divider"></div>
    </article>
  `;
}

function printDailyReport() {
  printReportFromOrders({
    title: "Tagesauswertung",
    createdAt: new Date().toISOString(),
    orders: todayOrders(),
    eventName: state.settings.eventName,
    clubName: state.settings.clubName,
    stockByArticleId: Object.fromEntries(state.articles.map((article) => [article.id, article.stock]))
  });
}

function printArchivedReport(reportId) {
  const report = state.dayReports.find((item) => item.id === reportId);
  if (!report) return;
  printReportFromOrders({
    title: "Tagesabschluss",
    createdAt: report.createdAt,
    orders: report.orders,
    eventName: report.eventName,
    clubName: report.clubName,
    stockByArticleId: report.stockByArticleId
  });
}

function printReportFromOrders(report) {
  const data = buildReportData(report.orders);
  // Gleiche Reihenfolge und gleiche Spalten wie auf dem Bildschirm: erst die
  // Summe mit dem Bestand, dann die Aufteilung in bezahlt und kostenlos.
  const sections = [
    {
      title: "1. Summe",
      rows: attachStock(data.consumptionRows, report.stockByArticleId),
      showSum: false,
      showStock: true,
      totalCount: data.consumptionCount,
      totalSum: 0
    },
    { title: "2. Normal", rows: data.normalRows, showSum: true, totalCount: data.normalCount, totalSum: data.normalSum },
    { title: "3. Kostenlos", rows: data.freeRows, showSum: false, totalCount: data.freeCount, totalSum: 0 }
  ];

  if (state.settings.printerMode === "textfile" || state.settings.printerMode === "serial") {
    printReportTextFile({
      title: report.title,
      createdAt: report.createdAt,
      eventName: report.eventName,
      clubName: report.clubName,
      sections
    });
    return;
  }

  renderPrint(`
    <section class="daily-print">
      <h1>${escapeHtml(report.title)}</h1>
      <p>${escapeHtml(report.eventName)}</p>
      <p>${escapeHtml(report.clubName)}</p>
      <p>${new Date(report.createdAt).toLocaleString("de-DE")}</p>
      ${sections.map((section) => printReportSection(section)).join("")}
    </section>
  `);
}

async function printReportTextFile(report) {
  const response = await apiFetch("/api/print/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showToast(payload.error || "Drucken fehlgeschlagen.");
    return;
  }
  if (payload.mode === "textfile" && payload.files?.length) {
    showToast(`Auswertung geschrieben: ${payload.files[0]}`);
  }
}

async function shutdownSystem() {
  if (!window.confirm("Raspberry wirklich herunterfahren?")) return;
  const response = await apiFetch("/api/system/shutdown", { method: "POST" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showToast(payload.error || "Herunterfahren fehlgeschlagen.");
    return;
  }
  showToast("Raspberry wird heruntergefahren.");
}

async function setSystemDateTime(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const dateTime = form.get("dateTime");
  if (!dateTime) return;

  const todayCount = todayOrders().length;
  const warning = todayCount > 0
    ? `\n\nAchtung: ${todayCount} Buchung(en) mit dem aktuellen Datum sind bereits gespeichert und können danach falsch einsortiert sein.`
    : "";
  if (!window.confirm(`Systemzeit wirklich ändern?${warning}`)) return;

  const submitter = event.submitter;
  const finishButton = setButtonState(submitter, "Setze...");
  const response = await apiFetch("/api/system/datetime", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dateTime })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    finishButton();
    showToast(payload.error || "Uhrzeit konnte nicht gesetzt werden.");
    return;
  }

  systemInfo = { ...systemInfo, serverTime: payload.serverTime || systemInfo.serverTime };
  finishButton("Gesetzt");
  showToast("Systemzeit gesetzt.");
  window.setTimeout(() => finishButton(), 1200);
  if (activeView === "admin" && activeAdminSection === "settings") {
    renderAdmin();
  }
}

function resetDayCash() {
  const orders = todayOrders();
  if (!orders.length) return;
  const businessDay = businessDayKey(new Date());
  const total = orders.reduce((sum, order) => sum + order.total, 0);
  const confirmed = window.confirm(`Tageskasse wirklich abschließen?\n\nBetriebstag ${businessDayLabel(businessDay)}\n${orders.length} Buchungen werden als historischer Tagesabschluss gespeichert.\nUmsatz: ${money(total)}`);
  if (!confirmed) return;

  state.dayReports.unshift({
    id: uid("day"),
    businessDay,
    createdAt: new Date().toISOString(),
    eventName: state.settings.eventName,
    clubName: state.settings.clubName,
    total,
    orderCount: orders.length,
    orders: cloneData(orders),
    // Der Bestand wird gleich zurueckgesetzt. Ohne diese Momentaufnahme
    // liesse sich im Abschluss spaeter nicht mehr nachsehen, was am Ende des
    // Tages noch da war.
    stockByArticleId: Object.fromEntries(state.articles.map((article) => [article.id, article.stock]))
  });

  const orderIds = new Set(orders.map((order) => order.id));
  state.orders = state.orders.filter((order) => !orderIds.has(order.id));
  state.articles.forEach((article) => {
    article.stock = DEFAULT_RESET_STOCK;
  });
  saveState();
  showToast("Tageskasse abgeschlossen und archiviert.");
  renderAdmin();
}

function deleteArchivedReport(reportId) {
  const report = state.dayReports.find((item) => item.id === reportId);
  if (!report || !window.confirm("Diesen historischen Tagesabschluss endgültig löschen?")) return;
  state.dayReports = state.dayReports.filter((item) => item.id !== reportId);
  saveState();
  showToast("Tagesabschluss gelöscht.");
  renderAdmin();
}

function printReportSection(section) {
  const { title, rows, showSum, showStock, totalCount, totalSum } = section;
  const columns = 2 + (showStock ? 1 : 0) + (showSum ? 1 : 0);
  const bodyRows = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        ${showStock ? `<td>${Number.isFinite(row.stock) ? row.stock : "-"}</td>` : ""}
        <td>${row.quantity}</td>
        ${showSum ? `<td>${money(row.sum)}</td>` : ""}
      </tr>
    `).join("")
    : `<tr><td colspan="${columns}">Keine Buchungen</td></tr>`;

  return `
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead>
        <tr>
          <th>Artikel</th>
          ${showStock ? "<th>Bestand</th>" : ""}
          <th>Anzahl</th>
          ${showSum ? "<th>Summe</th>" : ""}
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr>
          <td>Total Artikel</td>
          ${showStock ? "<td></td>" : ""}
          <td>${totalCount}</td>
          ${showSum ? "<td></td>" : ""}
        </tr>
        ${showSum ? `<tr><td>Total Summe</td><td></td><td>${money(totalSum)}</td></tr>` : ""}
      </tfoot>
    </table>
  `;
}

function renderPrint(html) {
  const printRoot = document.querySelector("#print-root");
  printRoot.innerHTML = html;
  const clearPrintRoot = () => {
    printRoot.innerHTML = "";
    window.removeEventListener("afterprint", clearPrintRoot);
  };
  window.addEventListener("afterprint", clearPrintRoot);
  window.print();
  window.setTimeout(clearPrintRoot, 5000);
}

function inferToastType(message) {
  const text = String(message || "").toLowerCase();
  if (
    text.includes("fehler") ||
    text.includes("fehlgeschlagen") ||
    text.includes("konnte nicht") ||
    text.includes("nicht genug") ||
    text.includes("reicht nicht") ||
    text.includes("darf nicht") ||
    text.includes("existiert schon") ||
    text.includes("mindestens") ||
    text.includes("maximal")
  ) {
    return "error";
  }
  if (
    text.includes("gespeichert") ||
    text.includes("gesichert") ||
    text.includes("geladen") ||
    text.includes("gelöscht") ||
    text.includes("angelegt") ||
    text.includes("geschrieben") ||
    text.includes("gebucht") ||
    text.includes("abgeschlossen") ||
    text.includes("archiviert") ||
    text.includes("ausgeführt")
  ) {
    return "success";
  }
  return "info";
}

function showToast(message, type = inferToastType(message)) {
  const toast = document.querySelector("[data-toast]");
  if (!toast) return;
  if (activeView === "cashier" && type !== "error" && type !== "warning") return;

  toast.textContent = message;
  toast.classList.remove("toast-success", "toast-warning", "toast-error", "toast-info");
  toast.classList.add(`toast-${type}`);
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), type === "error" ? 3600 : 2200);
}

async function softRefreshApp() {
  try {
    state = await loadState();
    render();
    showToast("Ansicht aktualisiert.");
  } catch (error) {
    showToast("Aktualisieren fehlgeschlagen.");
  }
}

async function init() {
  try {
    await loadBootstrap();
  } catch (error) {
    bootError = "Die Festdaten konnten nicht vom Server geladen werden. Bitte die App über npm start / localhost öffnen.";
  }
  if (!bootError) {
    await restoreSessionUser();
  }
  if (sessionUser?.role === "report") {
    window.location.href = "/report.html";
    return;
  }
  render();
}

document.addEventListener("keydown", (event) => {
  const reloadKey = event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r");
  if (!reloadKey) return;
  event.preventDefault();
  softRefreshApp();
});

init();
