const DEFAULT_RESET_STOCK = 500;
const MAX_CATEGORIES = 5;
const SESSION_STORAGE_KEY = "festkasseSessionUser";

const seedData = {
  users: [
    { id: "usr_kasse", username: "kasse", role: "user", active: true },
    { id: "usr_admin", username: "admin", role: "admin", active: true }
  ],
  articles: [
    { id: "art_001", name: "Paprikaschnitzel mit Pommes", price: 12, stock: 500, warningStock: 5, category: "Schnitzel", categoryColor: "#e32626", active: true },
    { id: "art_002", name: "Rahmschnitzel mit Pommes", price: 12, stock: 500, warningStock: 5, category: "Schnitzel", categoryColor: "#e32626", active: true },
    { id: "art_003", name: "Kochkäseschnitzel mit Brot", price: 12, stock: 500, warningStock: 5, category: "Schnitzel", categoryColor: "#e32626", active: true },
    { id: "art_004", name: "Hackbraten mit Soße und Brot", price: 8.5, stock: 500, warningStock: 5, category: "Küche", categoryColor: "#f97316", active: true },
    { id: "art_005", name: "Bratwurst mit Brötchen/Brot", price: 4, stock: 500, warningStock: 5, category: "Wurst", categoryColor: "#ffb703", active: true },
    { id: "art_006", name: "Rindswurst mit Brötchen/Brot", price: 4, stock: 500, warningStock: 5, category: "Wurst", categoryColor: "#ffb703", active: true },
    { id: "art_007", name: "Pommes", price: 3, stock: 500, warningStock: 10, category: "Beilagen", categoryColor: "#22c55e", active: true },
    { id: "art_008", name: "Kochkäse mit Brot", price: 4, stock: 500, warningStock: 5, category: "Beilagen", categoryColor: "#22c55e", active: true },
    { id: "art_009", name: "Pinsa Salami", price: 8.5, stock: 500, warningStock: 5, category: "Pinsa", categoryColor: "#8b5cf6", active: true },
    { id: "art_010", name: "Pinsa vegetarisch", price: 8.5, stock: 500, warningStock: 5, category: "Pinsa", categoryColor: "#8b5cf6", active: true },
    { id: "art_011", name: "Feta Grillpfännchen", price: 6, stock: 500, warningStock: 5, category: "Beilagen", categoryColor: "#22c55e", active: true },
    { id: "art_012", name: "Currywurst", price: 4.5, stock: 500, warningStock: 5, category: "Wurst", categoryColor: "#ffb703", active: true },
    { id: "art_013", name: "Schwedensalat", price: 2, stock: 500, warningStock: 5, category: "Beilagen", categoryColor: "#22c55e", active: true }
  ],
  orders: [],
  cancellations: [],
  dayReports: [],
  settings: {
    clubName: "Freiwillige Feuerwehr Zellhausen",
    eventName: "Feuerwehrfest",
    currency: "EUR",
    defaultWarningStock: 5,
    printerName: "Browserdruck",
    printerMode: "browser",
    printerPort: "",
    printOutputDir: "data/prints",
    receiptFooter: "Danke und Gut Schlauch!",
    logoDataUrl: "",
    calculatorName: "name",
    calculatorPhone: "123123/123123",
    calculatorComment: "",
    menuVersion: 5,
    activeEventFile: "fest.json",
    categories: [
      { name: "Schnitzel", color: "#e32626" },
      { name: "Küche", color: "#f97316" },
      { name: "Wurst", color: "#ffb703" },
      { name: "Beilagen", color: "#22c55e" },
      { name: "Pinsa", color: "#8b5cf6" }
    ]
  }
};

let state = cloneData(seedData);
let sessionUser = null;
let activeView = "cashier";
let activeAdminSection = "analysis";
let cart = [];
let paidAmount = "";
let toastTimer = null;
let clockTimer = null;
const adminDirtySections = new Set();
const adminSavedSections = new Set();
let eventCatalog = null;
let bootError = "";
let systemInfo = { platform: "unknown", canShutdown: false, appVersion: "unknown", gitCommit: "unknown" };

async function loadState() {
  const response = await fetch("/api/state");
  if (!response.ok) throw new Error("Serverdaten konnten nicht geladen werden.");
  const payload = await response.json();
  systemInfo = payload.system || systemInfo;
  return normalizeState(payload.state);
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeState(data) {
  const normalized = { ...cloneData(seedData), ...data };
  normalized.settings = { ...seedData.settings, ...(normalized.settings || {}) };
  normalized.settings.categories = normalizeCategories(normalized.settings.categories, normalized.articles || []);
  normalized.users = (normalized.users || []).filter((user) => user.role === "user" || user.role === "admin");
  normalized.articles = (normalized.articles || []).map((article) => ({
    ...article,
    category: article.category || "Sonstiges",
    categoryColor: getCategoryColorFrom(normalized.settings.categories, article.category || "Sonstiges"),
    warningStock: Number.isFinite(Number(article.warningStock)) ? Number(article.warningStock) : normalized.settings.defaultWarningStock
  }));
  normalized.orders ||= [];
  normalized.cancellations ||= [];
  normalized.dayReports ||= [];
  const menuVersion = Number(normalized.settings.menuVersion || 0);
  if (menuVersion < 3) {
    normalized.articles = cloneData(seedData.articles);
    normalized.settings.categories = cloneData(seedData.settings.categories);
  }
  if (menuVersion < 4) {
    applyArticleNameCleanup(normalized.articles);
  }
  normalized.settings.menuVersion = 5;
  normalized.settings.activeEventFile ||= "fest.json";
  normalized.articles = normalized.articles.map((article, index) => ({
    ...article,
    sortOrder: Number.isFinite(Number(article.sortOrder)) ? Number(article.sortOrder) : index + 1
  })).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "de"));
  return normalized;
}

function applyArticleNameCleanup(articles) {
  const cleanNames = {
    art_005: "Bratwurst mit Brötchen/Brot",
    art_006: "Rindswurst mit Brötchen/Brot",
    art_008: "Kochkäse mit Brot"
  };

  articles.forEach((article) => {
    if (cleanNames[article.id]) {
      article.name = cleanNames[article.id];
    }
  });
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
  const response = await fetch("/api/state", {
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
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: state.settings.currency }).format(value || 0);
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

function roleLabel(role) {
  return role === "admin" ? "Admin" : "User";
}

function systemVersionLabel() {
  const version = systemInfo.appVersion || "unknown";
  const commit = systemInfo.gitCommit || "unknown";
  if (version === "unknown" && commit === "unknown") return "nicht verfügbar";
  return `${version} (${commit})`;
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
  const today = new Date().toISOString().slice(0, 10);
  return state.orders.filter((order) => order.createdAt.slice(0, 10) === today && order.status === "paid");
}

function buildReportData(orders) {
  const normalRows = totalsByMode(orders, false);
  const freeRows = totalsByMode(orders, true);
  const consumptionRows = totalsByMode(orders, null);
  return {
    normalRows,
    freeRows,
    consumptionRows,
    normalCount: normalRows.reduce((sum, item) => sum + item.quantity, 0),
    normalSum: normalRows.reduce((sum, item) => sum + item.sum, 0),
    freeCount: freeRows.reduce((sum, item) => sum + item.quantity, 0),
    consumptionCount: consumptionRows.reduce((sum, item) => sum + item.quantity, 0),
    total: orders.reduce((sum, order) => sum + order.total, 0)
  };
}

function canManage() {
  return sessionUser && sessionUser.role === "admin";
}

function restoreSessionUser() {
  const rawSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!rawSession) return;

  try {
    const storedUser = JSON.parse(rawSession);
    const matchingUser = state.users.find((user) =>
      user.active &&
      user.id === storedUser.id &&
      user.username === storedUser.username &&
      user.role === storedUser.role
    );
    sessionUser = matchingUser || null;
  } catch (error) {
    sessionUser = null;
  }

  if (!sessionUser) {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

function rememberSessionUser() {
  if (!sessionUser) return;
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    id: sessionUser.id,
    username: sessionUser.username,
    role: sessionUser.role
  }));
}

function clearSessionUser() {
  sessionUser = null;
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function render() {
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
    activeView = "cashier";
    renderCashier();
  }
}

function loginTemplate() {
  return `
    <main class="login-screen">
      <section class="panel login-card">
        <div class="brand">
          ${brandMarkTemplate()}
          <div>
            <h1>${state.settings.eventName}</h1>
            <p>${state.settings.clubName}</p>
          </div>
        </div>
        <form class="login-form" data-login-form>
          <div class="field">
            <label for="username">Benutzer</label>
            <input id="username" name="username" autocomplete="username" required />
          </div>
          <div class="field">
            <label for="password">Passwort</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required />
          </div>
          <button class="primary-button" type="submit">Einloggen</button>
          <div class="login-access">
            <strong>Standardzugänge</strong>
            <span>Kasse: <code>kasse</code> / <code>kasse123</code></span>
            <span>Admin: <code>admin</code> / <code>admin123</code></span>
            <small>Nach einer Änderung gelten die im Adminbereich gesetzten Passwörter.</small>
          </div>
          <div class="login-contact">
            <strong>Rechner: ${state.settings.calculatorName || "-"}</strong>
            <span>Telefonnummer: ${state.settings.calculatorPhone || "-"}</span>
            ${state.settings.calculatorComment ? `<p>${state.settings.calculatorComment}</p>` : ""}
          </div>
          <div class="error hidden" data-login-error>Login fehlgeschlagen.</div>
        </form>
        <button class="ghost-button small-button login-shutdown-button" type="button" data-system-shutdown>Raspberry herunterfahren</button>
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
            <h1>${state.settings.eventName}</h1>
            <p>${state.settings.clubName}</p>
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
              <button class="danger-button small-button" type="button" data-system-shutdown>Herunterfahren</button>
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

function brandMarkTemplate() {
  if (state.settings.logoDataUrl) {
    return `<div class="brand-mark logo-mark"><img src="${state.settings.logoDataUrl}" alt="Logo" /></div>`;
  }

  return `<div class="brand-mark">112</div>`;
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
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Artikel</h2>
            <p>Antippen, kassieren, fertig.</p>
          </div>
          <span class="stock-pill" data-clock>${shortDateTime()}</span>
        </div>
        <div class="category-stack">
          ${Object.entries(groupedArticles).map(([category, articles]) => categoryGroupTemplate(category, articles)).join("")}
        </div>
      </section>
      ${cartTemplate()}
    </div>
  `;
  bindCashier();
}

function categoryGroupTemplate(category, articles) {
  const color = getCategoryColor(category);
  return `
    <section class="category-group" style="--category-color: ${color}">
      <div class="category-heading">
        <span class="category-dot"></span>
        <h3>${category}</h3>
      </div>
      <div class="article-grid">
        ${articles.map(articleButtonTemplate).join("")}
      </div>
    </section>
  `;
}

function articleButtonTemplate(article) {
  const out = article.stock <= 0;
  const low = !out && article.stock <= article.warningStock;
  return `
    <button class="article-button ${low ? "low" : ""} ${out ? "out" : ""}" style="--category-color: ${getCategoryColor(article.category)}" data-add-article="${article.id}" ${out ? "disabled" : ""}>
      <span class="article-name">${article.name}</span>
      <span class="article-meta">
        <span>${money(article.price)}</span>
        <span data-article-stock>${out ? "Ausverkauft" : `${article.stock} Stk.`}</span>
      </span>
      ${low ? `<span class="article-meta"><span>Knapp!</span><span>Warnung bei ${article.warningStock}</span></span>` : ""}
    </button>
  `;
}

function cartTemplate() {
  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const change = Math.max(0, Number(paidAmount || 0) - total);
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
            <button class="primary-button" data-print-paid ${cart.length ? "" : "disabled"}>Bon drucken</button>
            <button class="ghost-button" data-print-free ${cart.length ? "" : "disabled"}>Freibon buchen</button>
          </div>
        </div>
        <section class="contact-box">
          <span>Rechner</span>
          <strong>${state.settings.calculatorName || "-"}</strong>
          <span>Telefonnummer</span>
          <strong>${state.settings.calculatorPhone || "-"}</strong>
          ${state.settings.calculatorComment ? `<span>Hinweis</span><p>${state.settings.calculatorComment}</p>` : ""}
        </section>
      </div>
    </aside>
  `;
}

function cartRowTemplate(item) {
  return `
    <div class="cart-row">
      <div>
        <strong>${item.name}</strong>
        <span>${item.quantity} x ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}</span>
      </div>
      <div class="cart-controls">
        <button class="qty-button" data-dec="${item.articleId}">-</button>
        <button class="qty-button" data-inc="${item.articleId}">+</button>
        <button class="qty-button" data-remove="${item.articleId}">x</button>
      </div>
    </div>
  `;
}

function renderAdmin() {
  if (!canManage()) {
    activeAdminSection = "info";
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
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>${canManage() ? "Admin" : "Info"}</h2>
          </div>
        </div>
      </section>
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
        ${state.articles.map((article, index) => articleEditTemplate(article, index)).join("")}
      </div>
    </section>
  `;
}

function categoryOptionsTemplate(selectedCategory = "") {
  return state.settings.categories.map((category) =>
    `<option value="${category.name}" ${category.name === selectedCategory ? "selected" : ""}>${category.name}</option>`
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
          <form class="category-edit-card" data-edit-category="${category.name}" style="--category-color: ${category.color}">
            <div class="field">
              <label>Name</label>
              <input name="name" value="${category.name}" required />
              <span>${state.articles.filter((article) => article.category === category.name).length} Artikel</span>
            </div>
            <div class="field color-field">
              <label>Farbe</label>
              <input name="color" type="color" value="${category.color}" title="Farbe" />
            </div>
            <button class="danger-button small-button" type="button" data-delete-category="${category.name}">Löschen</button>
          </form>
        `).join("")}
      </div>
    </section>
  `;
}

function analysisTemplate() {
  const orders = todayOrders();
  const report = buildReportData(orders);

  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Tagesauswertung</h2>
          <p>Normal, kostenlos und Summe auf einen Blick.</p>
        </div>
        <button class="action-button" data-print-report>Auswertung drucken</button>
        <button class="danger-button" data-reset-day ${orders.length ? "" : "disabled"}>Tageskasse abschließen</button>
      </div>
      <div class="stat-grid">
        <article class="stat-card"><span>Gesamtumsatz</span><strong>${money(report.total)}</strong></article>
        <article class="stat-card"><span>Anzahl Essen</span><strong>${report.consumptionCount}</strong></article>
      </div>
      <div class="report-grid">
        ${reportTableTemplate("1. Normal", report.normalRows, true, report.normalCount, report.normalSum)}
        ${reportTableTemplate("2. Kostenlos", report.freeRows, false, report.freeCount, 0)}
        ${reportTableTemplate("3. Summe", report.consumptionRows, false, report.consumptionCount, 0)}
      </div>
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
              <strong>${report.eventName}</strong>
              <span>${new Date(report.createdAt).toLocaleString("de-DE")} - ${report.orderCount} Buchungen - ${money(report.total)}</span>
            </div>
            <div class="history-actions">
              <button class="action-button small-button" data-print-history="${report.id}">Drucken</button>
              <button class="danger-button small-button" data-delete-history="${report.id}">Endgültig löschen</button>
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
  return `
    <div class="report-grid compact-report-grid">
      ${reportTableTemplate("1. Normal", data.normalRows, true, data.normalCount, data.normalSum)}
      ${reportTableTemplate("2. Kostenlos", data.freeRows, false, data.freeCount, 0)}
      ${reportTableTemplate("3. Summe", data.consumptionRows, false, data.consumptionCount, 0)}
    </div>
  `;
}

function totalsByMode(orders, isFree) {
  const totals = {};
  orders.forEach((order) => {
    order.items.forEach((item) => {
      if (isFree !== null && Boolean(item.isFree) !== isFree) return;
      totals[item.articleId] ||= { name: item.name, quantity: 0, sum: 0 };
      totals[item.articleId].quantity += item.quantity;
      totals[item.articleId].sum += item.lineTotal;
    });
  });

  return Object.values(totals).sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function reportTableTemplate(title, rows, showSum, totalCount, totalSum) {
  const emptyColumns = showSum ? 3 : 2;
  const rowsHtml = rows.length
    ? rows.map((item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        ${showSum ? `<td>${money(item.sum)}</td>` : ""}
      </tr>
    `).join("")
    : `<tr><td colspan="${emptyColumns}">Noch keine Buchungen.</td></tr>`;

  return `
    <article class="report-card">
      <h3>${title}</h3>
      <div class="table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Artikel</th>
              <th>Anzahl</th>
              ${showSum ? "<th>Summe</th>" : ""}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr>
              <td>Total Artikel</td>
              <td>${totalCount}</td>
              ${showSum ? "<td></td>" : ""}
            </tr>
            ${showSum ? `<tr><td>Total Summe</td><td></td><td>${money(totalSum)}</td></tr>` : ""}
          </tfoot>
        </table>
      </div>
    </article>
  `;
}

function settingsTemplate() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Einstellungen</h2>
          <p>Festname, Vereinsname und Logo für Bons und Auswertung.</p>
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
          <input name="eventName" value="${state.settings.eventName}" required />
        </div>
        <div class="field">
          <label>Vereinsname</label>
          <input name="clubName" value="${state.settings.clubName}" required />
        </div>
        <div class="field">
          <label>Logo</label>
          <div class="logo-upload-row">
            <input name="logo" type="file" accept="image/*" />
            <div class="logo-preview">
              ${state.settings.logoDataUrl ? `<img src="${state.settings.logoDataUrl}" alt="Logo Vorschau" />` : "<span>Kein Logo hinterlegt</span>"}
            </div>
          </div>
        </div>
        <div class="settings-form-title">Kassenhinweis</div>
        <div class="field">
          <label>Rechner</label>
          <input name="calculatorName" value="${state.settings.calculatorName}" />
        </div>
        <div class="field">
          <label>Telefonnummer</label>
          <input name="calculatorPhone" value="${state.settings.calculatorPhone}" />
        </div>
        <div class="field">
          <label>Hinweis</label>
          <textarea name="calculatorComment" maxlength="400" rows="5">${state.settings.calculatorComment || ""}</textarea>
        </div>
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
          <form class="user-password-card" data-password-user="${user.username}">
            <div>
              <strong>${user.username}</strong>
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
  const rows = [
    ["Programmversion", systemInfo.appVersion || "unknown"],
    ["Git-Version", systemInfo.gitCommit || "unknown"],
    ["System", systemInfo.platform || "unknown"],
    ["Angemeldet", sessionUser?.username || "-"],
    ["Rolle", sessionUser ? roleLabel(sessionUser.role) : "-"],
    ["Browser-Viewport", display.viewport],
    ["Bildschirm", display.screenSize],
    ["Pixelverhältnis", display.pixelRatio]
  ];
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Info</h2>
          <p>Version und Systemdaten für Fehleranalyse.</p>
        </div>
      </div>
      <table class="info-table">
        <tbody>
          ${rows.map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function printSettingsTemplate() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Drucken</h2>
          <p>Browserdruck, Testdateien und Thermodrucker vorbereiten.</p>
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
            <option value="textfile" ${state.settings.printerMode === "textfile" ? "selected" : ""}>Textdatei-Testdruck</option>
            <option value="serial" ${state.settings.printerMode === "serial" ? "selected" : ""}>Serieller Thermodrucker</option>
          </select>
        </div>
        <div class="field">
          <label>Drucker-Port</label>
          <input name="printerPort" value="${state.settings.printerPort || ""}" placeholder="COM3 oder /dev/ttyUSB0" />
        </div>
        <div class="field">
          <label>Testdruck-Verzeichnis</label>
          <input name="printOutputDir" value="${state.settings.printOutputDir || "data/prints"}" />
        </div>
        <div class="field settings-test-print">
          <button class="action-button" type="button" data-test-print>Testbon als TXT schreiben</button>
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
          <h3>Daten & Vorlagen</h3>
          <p>Aktuelles Fest speichern oder vorhandene Vorlagen laden.</p>
        </div>
      </div>
      <div class="data-actions">
      </div>
      <div class="data-save-row">
        <div class="field data-new-field">
          <label>Vorlagenname</label>
          <input data-new-event-name value="${state.settings.eventName}" />
        </div>
        <button class="action-button" data-save-current-event>Aktuelles Fest speichern</button>
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

  const rows = [
    {
      type: "defaults",
      file: "defaults.json",
      eventName: "Default",
      clubName: eventCatalog.defaults?.clubName || "Grunddaten",
      locked: true
    },
    ...(eventCatalog.events || []),
    ...(eventCatalog.archive || [])
  ];

  return rows.map((event) => `
    <article class="event-card">
      <div>
        <strong>${event.eventName}</strong>
        <span>${eventMetaTemplate(event)}</span>
      </div>
      <div class="event-actions">
        ${event.type === "defaults"
          ? `<button class="action-button small-button" data-load-default-event>Fest laden</button>`
          : `<button class="action-button small-button" data-template-event="${event.file}">Fest laden</button>
             <button class="danger-button small-button" data-delete-event="${event.file}">Löschen</button>`}
      </div>
    </article>
  `).join("");
}

function eventMetaTemplate(event) {
  const typeLabel = event.type === "archive" ? "Archiv" : event.type === "defaults" ? "Systemvorlage" : "Vorlage";
  const date = event.updatedAt
    ? new Date(event.updatedAt)
    : new Date();
  return `${event.clubName || "-"} - ${event.sourceEventName || event.eventName || event.file} - ${date.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })} - ${typeLabel}`;
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
        <input name="warningStock" type="number" min="0" step="1" value="${state.settings.defaultWarningStock}" required />
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
    <form class="article-edit-card" data-edit-article="${article.id}">
      <div class="row-actions">
        <button class="qty-button" type="button" data-move-article="${article.id}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="qty-button" type="button" data-move-article="${article.id}" data-direction="1" ${index === state.articles.length - 1 ? "disabled" : ""}>↓</button>
      </div>
      <div class="field">
        <label>Name</label>
        <input name="name" value="${article.name}" required />
      </div>
      <div class="field">
        <label>Preis</label>
        <input name="price" type="number" min="0" step="0.01" value="${article.price}" required />
      </div>
      <div class="field">
        <label>Bestand</label>
        <input name="stock" type="number" min="0" step="1" value="${article.stock}" required />
      </div>
      <div class="field">
        <label>Warnung</label>
        <input name="warningStock" type="number" min="0" step="1" value="${article.warningStock}" required />
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
      <button class="danger-button small-button" type="button" data-delete-article="${article.id}">Löschen</button>
    </form>
  `;
}

function bindLogin() {
  document.querySelector("[data-system-shutdown]")?.addEventListener("click", shutdownSystem);
  document.querySelector("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });

    if (!response.ok) {
      document.querySelector("[data-login-error]").classList.remove("hidden");
      return;
    }

    const payload = await response.json();
    sessionUser = payload.user;
    rememberSessionUser();
    activeView = "cashier";
    state = await loadState();
    render();
  });
}

function bindShell() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
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
      render();
    });
  });

  document.querySelector("[data-logout]")?.addEventListener("click", () => {
    clearSessionUser();
    cart = [];
    paidAmount = "";
    render();
  });
  document.querySelector("[data-system-shutdown]")?.addEventListener("click", shutdownSystem);

  startClock();
}

function closeSystemMenu() {
  document.querySelector("[data-system-menu-panel]")?.classList.add("hidden");
  document.querySelector("[data-system-menu]")?.setAttribute("aria-expanded", "false");
}

function startClock() {
  clearInterval(clockTimer);
  const tick = () => {
    document.querySelectorAll("[data-clock]").forEach((element) => {
      element.textContent = shortDateTime();
    });
  };
  tick();
  clockTimer = setInterval(tick, 1000);
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
  const button = document.querySelector(`[data-add-article="${articleId}"]`);
  if (!article || !button) return;

  const reserved = cart.find((item) => item.articleId === articleId)?.quantity || 0;
  const out = article.stock <= 0 || reserved >= article.stock;
  const stockElement = button.querySelector("[data-article-stock]");
  button.disabled = out;
  button.classList.toggle("out", out);
  if (stockElement) {
    stockElement.textContent = article.stock <= 0 ? "Ausverkauft" : `${article.stock} Stk.`;
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
  const response = await fetch("/api/events");
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
  const response = await fetch("/api/events/save", {
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
  showToast(`Fest gesichert: ${payload.file}`);
  finishButton("Gespeichert");
  await refreshEventCatalog();
  window.setTimeout(() => finishButton(), 1200);
}

async function loadDefaultEvent() {
  if (!window.confirm("Default als Vorlage laden?\n\nVerkäufe und Tagesabschlüsse werden geleert, Grundartikel und Einstellungen übernommen.")) return;
  const response = await fetch("/api/events/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "defaults", mode: "template", eventName: state.settings.eventName })
  });
  await applyEventResponse(response, "Default als Vorlage geladen.");
}

async function loadManagedEvent(file, mode) {
  const eventName = document.querySelector("[data-new-event-name]")?.value || state.settings.eventName;
  const text = mode === "template"
    ? `Fest "${file}" als Vorlage verwenden?\n\nVerkäufe und Tagesabschlüsse werden geleert, Artikel und Einstellungen übernommen.`
    : `Fest "${file}" vollständig laden?\n\nDas aktuelle Fest wird ersetzt.`;
  if (!window.confirm(text)) return;
  const response = await fetch("/api/events/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, mode, eventName })
  });
  await applyEventResponse(response, mode === "template" ? "Vorlage geladen." : "Fest geladen.");
}

async function deleteManagedEvent(file) {
  if (!window.confirm(`Festdatei "${file}" endgültig löschen?`)) return;
  const response = await fetch("/api/events", {
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
  cart = [];
  paidAmount = "";
  eventCatalog = null;
  showToast(message);
  render();
}

async function setUserPassword(event) {
  event.preventDefault();
  const finishButton = setButtonState(event.submitter, "Speichern...");
  const form = new FormData(event.currentTarget);
  const password = String(form.get("password") || "");
  if (password.length < 4) {
    finishButton();
    showToast("Passwort bitte mit mindestens 4 Zeichen setzen.");
    return;
  }
  const username = event.currentTarget.dataset.passwordUser;
  const response = await fetch("/api/users/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    finishButton();
    showToast("Passwort konnte nicht gespeichert werden.");
    return;
  }
  event.currentTarget.reset();
  finishButton("Gespeichert");
  showToast(`Passwort für ${username} gespeichert.`);
  window.setTimeout(() => finishButton(), 1200);
}

async function saveSettings(section = "settings", button = getAdminSaveButton(section)) {
  const finishButton = setButtonState(button, "Speichern...");
  const formElement = document.querySelector("[data-settings-form]");
  if (!formElement) {
    finishButton();
    return;
  }
  const form = new FormData(formElement);
    if (form.has("eventName")) state.settings.eventName = String(form.get("eventName")).trim() || "Feuerwehrfest";
    if (form.has("clubName")) state.settings.clubName = String(form.get("clubName")).trim() || "Freiwillige Feuerwehr Zellhausen";
    if (form.has("calculatorName")) state.settings.calculatorName = String(form.get("calculatorName")).trim();
    if (form.has("calculatorPhone")) state.settings.calculatorPhone = String(form.get("calculatorPhone")).trim();
    if (form.has("calculatorComment")) state.settings.calculatorComment = String(form.get("calculatorComment")).trim().slice(0, 400);
    if (form.has("printerMode")) state.settings.printerMode = String(form.get("printerMode") || "browser");
    if (form.has("printerPort")) state.settings.printerPort = String(form.get("printerPort") || "").trim();
    if (form.has("printOutputDir")) state.settings.printOutputDir = String(form.get("printOutputDir") || "data/prints").trim() || "data/prints";
    const logo = form.get("logo");
    if (logo && logo.size) {
      const reader = new FileReader();
      reader.addEventListener("load", async () => {
    state.settings.logoDataUrl = reader.result;
        if (!(await saveState())) {
          finishButton();
          return;
        }
        clearAdminDirty(section);
        showToast("Einstellungen gespeichert.");
        finishButton("Gespeichert");
        render();
      });
      reader.readAsDataURL(logo);
      return;
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
  if (!cart.length) return;

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
  if (!cart.length) return;

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

  if (!(await printReceipt(items, total, isFree))) {
    return;
  }

  // Der Bestand wird erst nach der finalen Prüfung reduziert, damit halbe Buchungen vermieden werden.
  const changedArticleIds = cart.map((item) => item.articleId);

  cart.forEach((item) => {
    const article = state.articles.find((candidate) => candidate.id === item.articleId);
    article.stock -= item.quantity;
  });

  state.orders.push({
    id: uid("ord"),
    createdAt: new Date().toISOString(),
    cashierId: sessionUser.id,
    status: "paid",
    paidAmount: isFree ? 0 : Number(paidAmount || total),
    changeAmount: isFree ? 0 : Math.max(0, Number(paidAmount || total) - total),
    total,
    items
  });

  saveState();
  cart = [];
  paidAmount = "";
  showToast(isFree ? "Kostenlos gebucht." : "Bezahlt und gespeichert.");
  renderCart();
  changedArticleIds.forEach(updateArticleButtonState);
}

async function printReceipt(items, total, isFree) {
  const receiptTime = new Date();
  if (state.settings.printerMode === "textfile" || state.settings.printerMode === "serial") {
    const receipts = items.flatMap((item) =>
      Array.from({ length: item.quantity }, () => ({
        articleName: item.name,
        price: item.unitPrice,
        isFree,
        createdAt: receiptTime.toISOString()
      }))
    );
    const response = await fetch("/api/print/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: state.settings, receipts })
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

  const receipts = items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => receiptTemplate(item, receiptTime, isFree))
  ).join("");

  renderPrint(`
    <section class="receipt-roll">
      ${receipts}
    </section>
  `);
  return true;
}

async function testPrint(button) {
  const finishButton = setButtonState(button, "Schreibe...");
  const formElement = document.querySelector("[data-settings-form]");
  const form = formElement ? new FormData(formElement) : new FormData();
  const settings = {
    ...state.settings,
    printerMode: String(form.get("printerMode") || state.settings.printerMode || "browser"),
    printerPort: String(form.get("printerPort") || state.settings.printerPort || "").trim(),
    printOutputDir: String(form.get("printOutputDir") || state.settings.printOutputDir || "data/prints").trim()
  };

  const response = await fetch("/api/print/test", {
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

  finishButton("Geschrieben");
  showToast(payload.files?.length ? `Testbon geschrieben: ${payload.files[0]}` : "Testdruck ausgeführt.");
  window.setTimeout(() => finishButton(), 1200);
}

function receiptTemplate(item, receiptTime, isFree) {
  return `
    <article class="receipt-ticket">
      <h1>${state.settings.eventName}</h1>
      <p class="receipt-club">${state.settings.clubName}</p>
      <div class="receipt-divider"></div>
      <strong class="receipt-item">${item.name}</strong>
      ${isFree ? `<span class="receipt-free">Kostenlos</span>` : `<span class="receipt-price">${money(item.unitPrice)}</span>`}
      <div class="receipt-divider"></div>
      <p>${shortDateTime(receiptTime)}</p>
    </article>
  `;
}

function printDailyReport() {
  printReportFromOrders({
    title: "Tagesauswertung",
    createdAt: new Date().toISOString(),
    orders: todayOrders(),
    eventName: state.settings.eventName,
    clubName: state.settings.clubName
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
    clubName: report.clubName
  });
}

function printReportFromOrders(report) {
  const data = buildReportData(report.orders);
  const sections = [
    { title: "1. Normal", rows: data.normalRows, showSum: true, totalCount: data.normalCount, totalSum: data.normalSum },
    { title: "2. Kostenlos", rows: data.freeRows, showSum: false, totalCount: data.freeCount, totalSum: 0 },
    { title: "3. Summe", rows: data.consumptionRows, showSum: false, totalCount: data.consumptionCount, totalSum: 0 }
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
      <h1>${report.title}</h1>
      <p>${report.eventName}</p>
      <p>${report.clubName}</p>
      <p>${new Date(report.createdAt).toLocaleString("de-DE")}</p>
      ${sections.map((section) => printReportSection(section.title, section.rows, section.showSum, section.totalCount, section.totalSum)).join("")}
    </section>
  `);
}

async function printReportTextFile(report) {
  const response = await fetch("/api/print/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: state.settings, report })
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
  const response = await fetch("/api/system/shutdown", { method: "POST" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showToast(payload.error || "Herunterfahren fehlgeschlagen.");
    return;
  }
  showToast("Raspberry wird heruntergefahren.");
}

function resetDayCash() {
  const orders = todayOrders();
  if (!orders.length) return;
  const total = orders.reduce((sum, order) => sum + order.total, 0);
  const confirmed = window.confirm(`Tageskasse wirklich abschließen?\n\n${orders.length} Buchungen werden als historischer Tagesabschluss gespeichert.\nUmsatz: ${money(total)}`);
  if (!confirmed) return;

  state.dayReports.unshift({
    id: uid("day"),
    createdAt: new Date().toISOString(),
    eventName: state.settings.eventName,
    clubName: state.settings.clubName,
    logoDataUrl: state.settings.logoDataUrl,
    total,
    orderCount: orders.length,
    orders: cloneData(orders)
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

function printReportSection(title, rows, showSum, totalCount, totalSum) {
  const bodyRows = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${row.name}</td>
        <td>${row.quantity}</td>
        ${showSum ? `<td>${money(row.sum)}</td>` : ""}
      </tr>
    `).join("")
    : `<tr><td colspan="${showSum ? 3 : 2}">Keine Buchungen</td></tr>`;

  return `
    <h2>${title}</h2>
    <table>
      <thead>
        <tr>
          <th>Artikel</th>
          <th>Anzahl</th>
          ${showSum ? "<th>Summe</th>" : ""}
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr>
          <td>Total Artikel</td>
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
    state = await loadState();
    restoreSessionUser();
  } catch (error) {
    bootError = "Die Festdaten konnten nicht vom Server geladen werden. Bitte die App über npm start / localhost öffnen.";
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
