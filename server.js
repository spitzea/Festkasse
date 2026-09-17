// Festkasse Community Edition
// Zielgruppe: Feuerwehren, Vereine und ehrenamtliche Organisationen.

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const os = require("os");
const { execFile, execFileSync } = require("child_process");
const {
  businessDayKey,
  businessDayEnd,
  businessDayLabel,
  filterPaidOrdersForBusinessDay,
  buildReportData,
  buildIntervalBuckets
} = require("./public/report-shared.js");

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const savedDir = path.join(dataDir, "saved");
const legacyEventsDir = path.join(dataDir, "events");
const legacyActivePath = path.join(dataDir, "fest.json");
const printsDir = path.join(dataDir, "prints");
const defaultsPath = path.join(dataDir, "defaults.json");
const activePath = path.join(dataDir, "active-event.json");
// Das Logo liegt bewusst ausserhalb der Festdatei: es machte rund 264 der 280
// Kilobyte aus, und jede Buchung schreibt die Festdatei vollstaendig neu.
const logoPath = path.join(dataDir, "logo.json");
const packagePath = path.join(__dirname, "package.json");
const latestVersionUrl = process.env.FESTKASSE_LATEST_VERSION_URL || "https://raw.githubusercontent.com/spitzea/Festkasse/main/package.json";
const defaultSerialPrinterPort = "/dev/ttyUSB0";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const defaultState = {
  users: [
    {
      id: "usr_kasse",
      username: "kasse",
      role: "user",
      active: true,
      passwordSalt: "default-kasse",
      passwordHash: "80f7c7004e02d83a00b6b179409fc6736c0335277eddd0f6234b81dc14418d31"
    },
    {
      id: "usr_admin",
      username: "admin",
      role: "admin",
      active: true,
      passwordSalt: "default-admin",
      passwordHash: "48451a874317ae58ad068ea737fd3fbb1a9689958087047794809a74bbc5ff79"
    },
    {
      id: "usr_report",
      username: "report",
      role: "report",
      active: true,
      passwordSalt: "default-report",
      passwordHash: "cf78e4eb0a451bce72cf54d743bfdc3e58cf40afb2ea63de5804710ae8ba3325"
    }
  ],
  articles: [
    { id: "art_001", name: "Paprikaschnitzel mit Pommes", price: 12, stock: 500, warningStock: 5, category: "Schnitzel", categoryColor: "#e32626", active: true, sortOrder: 1 },
    { id: "art_002", name: "Rahmschnitzel mit Pommes", price: 12, stock: 500, warningStock: 5, category: "Schnitzel", categoryColor: "#e32626", active: true, sortOrder: 2 },
    { id: "art_003", name: "Kochkäseschnitzel mit Brot", price: 12, stock: 500, warningStock: 5, category: "Schnitzel", categoryColor: "#e32626", active: true, sortOrder: 3 },
    { id: "art_004", name: "Hackbraten mit Soße und Brot", price: 8.5, stock: 500, warningStock: 5, category: "Küche", categoryColor: "#f97316", active: true, sortOrder: 4 },
    { id: "art_005", name: "Bratwurst mit Brötchen/Brot", price: 4, stock: 500, warningStock: 5, category: "Wurst", categoryColor: "#ffb703", active: true, sortOrder: 5 },
    { id: "art_006", name: "Rindswurst mit Brötchen/Brot", price: 4, stock: 500, warningStock: 5, category: "Wurst", categoryColor: "#ffb703", active: true, sortOrder: 6 },
    { id: "art_007", name: "Pommes", price: 3, stock: 500, warningStock: 10, category: "Beilagen", categoryColor: "#22c55e", active: true, sortOrder: 7 },
    { id: "art_008", name: "Kochkäse mit Brot", price: 4, stock: 500, warningStock: 5, category: "Beilagen", categoryColor: "#22c55e", active: true, sortOrder: 8 },
    { id: "art_009", name: "Pinsa Salami", price: 8.5, stock: 500, warningStock: 5, category: "Pinsa", categoryColor: "#8b5cf6", active: true, sortOrder: 9 },
    { id: "art_010", name: "Pinsa vegetarisch", price: 8.5, stock: 500, warningStock: 5, category: "Pinsa", categoryColor: "#8b5cf6", active: true, sortOrder: 10 },
    { id: "art_011", name: "Feta Grillpfännchen", price: 6, stock: 500, warningStock: 5, category: "Beilagen", categoryColor: "#22c55e", active: true, sortOrder: 11 },
    { id: "art_012", name: "Currywurst", price: 4.5, stock: 500, warningStock: 5, category: "Wurst", categoryColor: "#ffb703", active: true, sortOrder: 12 },
    { id: "art_013", name: "Schwedensalat", price: 2, stock: 500, warningStock: 5, category: "Beilagen", categoryColor: "#22c55e", active: true, sortOrder: 13 }
  ],
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
    printerPort: defaultSerialPrinterPort,
    printOutputDir: "data/prints",
    receiptFooter: "Vielen Dank!",
    calculatorName: "Kassenleitung",
    calculatorPhone: "",
    calculatorComment: "",
    menuVersion: 5,
    activeEventFile: "active-event.json",
    nextReceiptNumber: 1,
    categories: [
      { name: "Schnitzel", color: "#e32626" },
      { name: "Küche", color: "#f97316" },
      { name: "Wurst", color: "#ffb703" },
      { name: "Beilagen", color: "#22c55e" },
      { name: "Pinsa", color: "#8b5cf6" }
    ]
  }
};

async function ensureDataFiles() {
  await fsp.mkdir(savedDir, { recursive: true });
  await fsp.mkdir(printsDir, { recursive: true });
  await migrateLegacyDataFiles();
  if (!fs.existsSync(defaultsPath)) {
    await writeJson(defaultsPath, defaultState);
  }
  if (!fs.existsSync(activePath)) {
    const defaults = await readJson(defaultsPath);
    await writeJson(activePath, createTemplateState(defaults, defaults.settings.eventName));
  }
}

// Bestehende Installationen (data/*.json existiert schon vor diesem Update)
// bekommen den neuen "report"-Nutzer sonst nie, weil defaultState nur beim
// allerersten Start greift. Ergänzt ihn, falls er in einer Datei fehlt.
function addReportUserIfMissing(state) {
  const users = state.users || [];
  if (users.some((user) => user.username === "report")) return null;
  return {
    ...state,
    users: [...users, {
      id: "usr_report",
      username: "report",
      role: "report",
      active: true,
      passwordSalt: "default-report",
      passwordHash: "cf78e4eb0a451bce72cf54d743bfdc3e58cf40afb2ea63de5804710ae8ba3325"
    }]
  };
}

async function migrateLegacyDataFiles() {
  if (!fs.existsSync(activePath) && fs.existsSync(legacyActivePath)) {
    await fsp.copyFile(legacyActivePath, activePath);
  }
  if (fs.existsSync(activePath)) {
    let active = await readJson(activePath);
    let changed = false;
    if (active.settings?.activeEventFile !== "active-event.json") {
      active = { ...active, settings: { ...(active.settings || {}), activeEventFile: "active-event.json" } };
      changed = true;
    }
    const withReportUser = addReportUserIfMissing(active);
    if (withReportUser) {
      active = withReportUser;
      changed = true;
    }
    const withoutLogo = await extractEmbeddedLogo(active);
    if (withoutLogo) {
      active = withoutLogo;
      changed = true;
    }
    if (changed) {
      await writeJson(activePath, active);
    }
  }
  if (fs.existsSync(defaultsPath)) {
    let defaults = await readJson(defaultsPath);
    let changed = false;
    const withReportUser = addReportUserIfMissing(defaults);
    if (withReportUser) {
      defaults = withReportUser;
      changed = true;
    }
    const withoutLogo = await extractEmbeddedLogo(defaults);
    if (withoutLogo) {
      defaults = withoutLogo;
      changed = true;
    }
    if (changed) {
      await writeJson(defaultsPath, defaults);
    }
  }

  if (!fs.existsSync(legacyEventsDir)) return;
  const files = await fsp.readdir(legacyEventsDir, { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".json")) continue;
    const source = path.join(legacyEventsDir, file.name);
    const target = path.join(savedDir, file.name);
    if (!fs.existsSync(target)) {
      await fsp.rename(source, target);
    }
  }
}

async function readJson(filePath) {
  const content = await fsp.readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function writeJson(filePath, data) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fsp.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fsp.rename(tempPath, filePath);
}

function sanitizeState(state) {
  return {
    ...state,
    users: (state.users || []).map(({ passwordHash, passwordSalt, password, ...user }) => user)
  };
}

// --- Logo -------------------------------------------------------------------
// Gespeichert wird die Data-URL zerlegt in Typ und Base64, damit /api/logo
// echte Bilddaten ausliefern kann und nicht noch einmal Base64 durch die
// Leitung schickt.

function parseLogoDataUrl(value) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(value || "").replace(/\s/g, ""));
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function readLogo() {
  if (!fs.existsSync(logoPath)) return null;
  try {
    const logo = JSON.parse(fs.readFileSync(logoPath, "utf8"));
    if (!logo?.base64 || !logo?.mimeType) return null;
    return logo;
  } catch (error) {
    console.error(`[Festkasse] Logo-Datei unlesbar: ${error.message}`);
    return null;
  }
}

// hasLogo und logoVersion gehen an alle Oberflaechen. Die Version ist die
// Schreibzeit und haengt als Query am Bild, damit ein neues Logo den
// Browser-Cache sicher verdraengt.
function logoInfo() {
  const logo = readLogo();
  return { hasLogo: Boolean(logo), logoVersion: logo?.updatedAt || 0 };
}

async function writeLogoFromDataUrl(dataUrl) {
  const parsed = parseLogoDataUrl(dataUrl);
  if (!parsed) {
    throw Object.assign(new Error("Kein gueltiges Bild. Erwartet wird eine Data-URL mit Bildtyp."), { status: 400 });
  }
  await writeJson(logoPath, { ...parsed, updatedAt: Date.now() });
}

// Aeltere Festdateien, Vorlagen und Tagesabschluesse tragen das Logo noch in
// settings.logoDataUrl. Beim ersten Anfassen wandert es einmalig in die eigene
// Datei und wird ueberall herausgeschnitten. Ein bereits vorhandenes Logo
// gewinnt, damit das Laden einer alten Vorlage nicht das aktuelle ueberschreibt.
async function extractEmbeddedLogo(state) {
  const embedded = state?.settings?.logoDataUrl;
  const hasEmbeddedInReports = (state?.dayReports || []).some((report) => report?.logoDataUrl);
  if (!embedded && !hasEmbeddedInReports) return null;

  if (embedded && !readLogo()) {
    try {
      await writeLogoFromDataUrl(embedded);
    } catch (error) {
      console.error(`[Festkasse] Eingebettetes Logo nicht uebernommen: ${error.message}`);
    }
  }

  const { logoDataUrl, ...settings } = state.settings || {};
  return {
    ...state,
    settings,
    dayReports: (state.dayReports || []).map(({ logoDataUrl: reportLogo, ...report }) => report)
  };
}

async function withoutEmbeddedLogo(state) {
  return (await extractEmbeddedLogo(state)) || state;
}

function hasDefaultPassword(user) {
  const defaults = {
    kasse: {
      passwordSalt: "default-kasse",
      passwordHash: "80f7c7004e02d83a00b6b179409fc6736c0335277eddd0f6234b81dc14418d31"
    },
    admin: {
      passwordSalt: "default-admin",
      passwordHash: "48451a874317ae58ad068ea737fd3fbb1a9689958087047794809a74bbc5ff79"
    },
    report: {
      passwordSalt: "default-report",
      passwordHash: "cf78e4eb0a451bce72cf54d743bfdc3e58cf40afb2ea63de5804710ae8ba3325"
    }
  };
  const expected = defaults[user?.username];
  return Boolean(expected && user.passwordSalt === expected.passwordSalt && user.passwordHash === expected.passwordHash);
}

function hasAnyDefaultPassword(state) {
  return (state.users || []).some(hasDefaultPassword);
}

// Liefert genau die Benutzernamen, die noch das Standardpasswort haben -
// die "Standardzugänge"-Box im Login soll pro Zeile verschwinden, sobald
// dieser eine Nutzer geändert wurde, statt komplett anzuzeigen/auszublenden.
function defaultPasswordUsernames(state) {
  return (state.users || []).filter(hasDefaultPassword).map((user) => user.username);
}

// Nur der Bestand vorhandener Artikel darf von der Kassenrolle geschrieben
// werden - Name, Preis, Kategorie, Warnbestand etc. kommen unveraendert vom
// Server, neue/geloeschte Artikel werden ignoriert.
function applyArticleStockOnly(currentArticles, incomingArticles) {
  const incomingStockById = new Map((incomingArticles || []).map((article) => [article.id, article.stock]));
  return (currentArticles || []).map((article) => {
    const incomingStock = incomingStockById.get(article.id);
    return typeof incomingStock === "number" ? { ...article, stock: incomingStock } : article;
  });
}

// Der Client schickt bei jedem Speichern immer den kompletten lokalen
// Zustand mit, nicht nur ein Diff - ohne serverseitige Rollenpruefung koennte
// sich eine Kassensitzung damit z.B. selbst zur Admin-Rolle machen oder
// Preise/Einstellungen aendern. `users` wird grundsaetzlich nie von hier
// uebernommen (Benutzerverwaltung laeuft ausschliesslich ueber die
// adminpflichtigen /api/users/*-Endpunkte).
function mergeIncomingState(current, incoming, role) {
  const base = {
    ...current,
    orders: incoming.orders || current.orders,
    cancellations: incoming.cancellations || current.cancellations,
    users: current.users
  };

  if (role !== "admin") {
    return {
      ...base,
      articles: applyArticleStockOnly(current.articles, incoming.articles),
      settings: {
        ...(current.settings || {}),
        nextReceiptNumber: incoming.settings?.nextReceiptNumber ?? current.settings?.nextReceiptNumber
      }
    };
  }

  // logoDataUrl wird hier bewusst weggeworfen: das Logo hat mit /api/logo eine
  // eigene Datei, sonst waechst die Festdatei ueber einen alten Client oder
  // eine alte Vorlage wieder um die 264 Kilobyte an.
  const { logoDataUrl, ...incomingSettings } = incoming.settings || {};
  return {
    ...base,
    articles: incoming.articles || current.articles,
    dayReports: (incoming.dayReports || current.dayReports || []).map(({ logoDataUrl: reportLogo, ...report }) => report),
    settings: {
      ...(current.settings || {}),
      ...incomingSettings
    }
  };
}

// Automatischer Tagesabschluss
//
// Ein Betriebstag endet um 05:00 (siehe report-shared.js). Buchungen aus einem
// abgelaufenen Betriebstag gehoeren nicht mehr in die laufende Tagesauswertung,
// wandern also in einen historischen Tagesabschluss. Anders als beim manuellen
// Abschluss bleiben die Bestaende dabei stehen: Nachfuellen ist eine
// Entscheidung von Menschen, die der Server nicht treffen kann.
//
// Die Funktion ist absichtlich idempotent und laeuft bei jedem Schreibzugriff
// mit. Eine Kasse, die seit gestern offen steht, schickt ihren alten Stand
// beim naechsten Speichern komplett mit - ohne diese Normalisierung waeren die
// abgeschlossenen Buchungen damit wieder zurueck im laufenden Tag.
function closeFinishedBusinessDays(state, now = new Date()) {
  const currentKey = businessDayKey(now);
  const orders = state.orders || [];
  // Nur bezahlte Buchungen, genau wie beim manuellen Abschluss - der Bericht
  // rechnet spaeter ueber genau diese Liste.
  const expired = orders.filter((order) => {
    const key = businessDayKey(order.createdAt);
    return order.status === "paid" && key && key < currentKey;
  });
  if (!expired.length) return null;

  const dayReports = [...(state.dayReports || [])];
  const stockByArticleId = Object.fromEntries((state.articles || []).map((article) => [article.id, article.stock]));
  const keys = [...new Set(expired.map((order) => businessDayKey(order.createdAt)))].sort();
  const closed = [];

  for (const key of keys) {
    const dayOrders = expired.filter((order) => businessDayKey(order.createdAt) === key);
    const existingIndex = dayReports.findIndex((report) => report.businessDay === key);

    if (existingIndex >= 0) {
      // Nachzuegler eines alten Clients gehoeren in den vorhandenen Abschluss
      // und nicht in einen zweiten Bericht fuer denselben Tag.
      const existing = dayReports[existingIndex];
      const known = new Set((existing.orders || []).map((order) => order.id));
      const added = dayOrders.filter((order) => !known.has(order.id));
      if (added.length) {
        const merged = [...(existing.orders || []), ...added];
        dayReports[existingIndex] = {
          ...existing,
          orders: merged,
          orderCount: merged.length,
          total: merged.reduce((sum, order) => sum + (Number(order.total) || 0), 0)
        };
        closed.push({ key, count: added.length, merged: true });
      }
      continue;
    }

    // Der Bestand von jetzt gehoert nur zu dem Betriebstag, der gerade eben
    // geendet hat. Wird ein aelterer Tag nachtraeglich abgeschlossen, ist der
    // Bestand von damals nicht mehr bekannt - dann bleibt die Spalte leer,
    // statt eine Zahl von heute als Tagesende auszugeben.
    const endedLast = businessDayKey(businessDayEnd(key)) === currentKey;
    dayReports.unshift({
      id: `day_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      businessDay: key,
      createdAt: businessDayEnd(key).toISOString(),
      automatic: true,
      eventName: state.settings?.eventName || "",
      clubName: state.settings?.clubName || "",
      total: dayOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
      orderCount: dayOrders.length,
      orders: dayOrders,
      ...(endedLast ? { stockByArticleId } : {})
    });
    closed.push({ key, count: dayOrders.length, merged: false });
  }

  const expiredIds = new Set(expired.map((order) => order.id));
  return {
    state: { ...state, orders: orders.filter((order) => !expiredIds.has(order.id)), dayReports },
    closed
  };
}

function logBusinessDayClose(closed) {
  for (const entry of closed) {
    console.log(
      `[Festkasse] Tagesabschluss automatisch: Betriebstag ${businessDayLabel(entry.key)}, ` +
      `${entry.count} Buchung(en)${entry.merged ? " nachgetragen" : ""} | ${new Date().toISOString()}`
    );
  }
}

// Abschluss zur Schnittzeit. Laeuft der Pi zu diesem Zeitpunkt nicht, holt ihn
// der naechste Schreibzugriff oder der Start des Servers nach.
async function runBusinessDayClose() {
  const state = await readJson(activePath);
  const result = closeFinishedBusinessDays(state);
  if (!result) return;
  await writeJson(activePath, result.state);
  logBusinessDayClose(result.closed);
}

function scheduleBusinessDayClose() {
  const now = new Date();
  // Eine Minute Abstand zur Schnittzeit, damit eine leicht nachgehende Uhr
  // den Tag nicht eine Sekunde zu frueh abschliesst.
  const next = businessDayEnd(businessDayKey(now)).getTime() + 60 * 1000;
  setTimeout(() => {
    runBusinessDayClose()
      .catch((error) => console.error("[Festkasse] Automatischer Tagesabschluss fehlgeschlagen:", error))
      .finally(scheduleBusinessDayClose);
  }, Math.max(1000, next - now.getTime()));
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { passwordSalt: salt, passwordHash: hashPassword(password, salt) };
}

function verifyPassword(user, password) {
  if (!user?.active) return false;
  if (user.passwordHash && user.passwordSalt) {
    const actual = Buffer.from(hashPassword(password, user.passwordSalt), "hex");
    const expected = Buffer.from(user.passwordHash, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
  return user.password && user.password === password;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// Nur eine aktive Kassen/Admin-Sitzung gleichzeitig, strikt (auch der gleiche
// Benutzer wird abgewiesen, solange die Session noch läuft) - verhindert
// gleichzeitige Schreibzugriffe auf den State von mehreren Kassen. Rein im
// Arbeitsspeicher: ein Absturz/Neustart des Prozesses (z. B. nach Pi-Reboot)
// löscht den Lock automatisch, ohne dass etwas aufgeräumt werden muss.
//
// Die rein lesende Rolle "report" ist davon bewusst ausgenommen: sie kann
// nichts schreiben und daher auch keine Race Condition auslösen, also darf
// sie beliebig oft parallel zur Kasse laufen (eigener, nicht-exklusiver
// Session-Speicher statt des exklusiven Locks).
let activeSession = null;
let takenOverToken = null;
const reportSessions = new Map();

function isSessionActive() {
  if (!activeSession) return false;
  if (activeSession.expiresAt < Date.now()) {
    activeSession = null;
    return false;
  }
  return true;
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const session = { token, id: user.id, username: user.username, role: user.role, expiresAt: Date.now() + SESSION_TTL_MS };
  if (user.role === "report") {
    reportSessions.set(token, session);
    return token;
  }
  if (isSessionActive()) {
    takenOverToken = activeSession.token;
  }
  activeSession = session;
  return token;
}

function getReportSession(token) {
  const session = reportSessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    reportSessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function getSession(token) {
  if (!token) return null;
  if (isSessionActive() && activeSession.token === token) {
    activeSession.expiresAt = Date.now() + SESSION_TTL_MS;
    return activeSession;
  }
  return getReportSession(token);
}

function destroySession(token) {
  if (activeSession && activeSession.token === token) {
    activeSession = null;
    return;
  }
  reportSessions.delete(token);
}

function sessionTokenFromRequest(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function requireSession(req, res) {
  const token = sessionTokenFromRequest(req);
  const session = getSession(token);
  if (!session) {
    if (token && token === takenOverToken) {
      sendJson(res, 401, { error: "Sitzung wurde auf einem anderen Gerät übernommen.", reason: "taken-over" });
    } else {
      sendJson(res, 401, { error: "Anmeldung erforderlich." });
    }
    return null;
  }
  return session;
}

function requireAdminSession(req, res) {
  const session = requireSession(req, res);
  if (!session) return null;
  if (session.role !== "admin") {
    sendJson(res, 403, { error: "Nur für Administratoren." });
    return null;
  }
  return session;
}

// Fuer schreibende/aktive Endpunkte, die "report" (rein lesend) nicht nutzen darf.
function requireWriteSession(req, res) {
  const session = requireSession(req, res);
  if (!session) return null;
  if (session.role === "report") {
    sendJson(res, 403, { error: "Nur lesender Zugriff." });
    return null;
  }
  return session;
}

function createTemplateState(source, eventName = source.settings?.eventName || "Neues Fest") {
  return {
    ...source,
    orders: [],
    cancellations: [],
    dayReports: [],
    articles: (source.articles || []).map((article, index) => ({
      ...article,
      sortOrder: Number.isFinite(Number(article.sortOrder)) ? Number(article.sortOrder) : index + 1
    })),
    settings: {
      ...(source.settings || {}),
      eventName,
      activeEventFile: "active-event.json",
      nextReceiptNumber: 1
    }
  };
}

function safeEventFileName(name) {
  const slug = String(name || "fest")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "fest";
  return `${slug}.json`;
}

function timestampSlug(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("-");
}

function safeEventVersionFileName(name, date = new Date()) {
  return safeEventFileName(`${name}-${timestampSlug(date)}`);
}

function safePrintFileName(prefix = "bon") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = crypto.randomBytes(3).toString("hex");
  return `${prefix}-${stamp}-${random}.txt`;
}

// Das Ausgabeverzeichnis darf das Projektverzeichnis nicht verlassen. Sonst
// genuegt ein "printOutputDir" in einer Anfrage, um per mkdir -p irgendwo im
// Dateisystem ein Verzeichnis anzulegen und Bons hineinzuschreiben. Wer
// bewusst woanders hin schreiben will, setzt FESTKASSE_PRINT_DIR am Server.
function resolvePrintOutputDir(configuredDir) {
  if (process.env.FESTKASSE_PRINT_DIR) {
    return path.resolve(process.env.FESTKASSE_PRINT_DIR);
  }
  const rawDir = String(configuredDir || "data/prints").trim() || "data/prints";
  const resolved = path.resolve(__dirname, rawDir);
  const relative = path.relative(__dirname, resolved);
  if (relative && (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) {
    console.warn(`[Festkasse] Ausgabeverzeichnis "${rawDir}" liegt ausserhalb des Projekts, benutze data/prints.`);
    return printsDir;
  }
  return resolved;
}

// Analog fuer die serielle Schnittstelle: ohne Muster laesst sich ueber
// printerPort ein beliebiger Pfad oeffnen bzw. per fsp.access abfragen, ob er
// existiert und beschreibbar ist.
function resolvePrinterPort(configuredPort) {
  const rawPort = String(configuredPort || "").trim();
  if (/^\/dev\/[A-Za-z0-9._-]+$/.test(rawPort)) return rawPort;
  if (/^COM[0-9]+$/i.test(rawPort)) return rawPort.toUpperCase();
  if (rawPort) {
    console.warn(`[Festkasse] Schnittstelle "${rawPort}" ist kein gueltiger Geraetepfad, benutze ${defaultSerialPrinterPort}.`);
  }
  return defaultSerialPrinterPort;
}

function padText(text, width, align = "left") {
  const value = String(text ?? "");
  if (value.length >= width) return value.slice(0, width);
  const spaces = " ".repeat(width - value.length);
  return align === "right" ? `${spaces}${value}` : `${value}${spaces}`;
}

function centerText(text, width) {
  const value = String(text ?? "");
  if (value.length >= width) return value;
  const left = Math.floor((width - value.length) / 2);
  return `${" ".repeat(left)}${value}`;
}

function wrapText(text, width) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= width) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function moneyText(value, currency = "EUR") {
  if (currency === "EUR") {
    return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)} \u20ac`;
  }
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(Number(value) || 0);
}

function receiptDateTimeText(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

function formatReceiptText(receipt, settings) {
  const width = 42;
  const time = receipt.createdAt ? new Date(receipt.createdAt) : new Date();
  const receiptNumber = formatReceiptNumber(receipt.receiptNumber);
  const lines = [
    centerText(settings.eventName || "Festkasse", width),
    centerText(settings.clubName || "", width),
    "-".repeat(width),
    "",
    ...wrapText(receipt.articleName || "Artikel", width).map((line) => centerText(line, width)),
  ];

  if (!receipt.isFree) {
    lines.push(centerText(moneyText(receipt.price, settings.currency), width));
  }

  lines.push(
    "",
    "-".repeat(width),
    centerText(receipt.isTest ? `Testdruck  ${receiptDateTimeText(time)}` : `Bon #${receiptNumber}  ${receiptDateTimeText(time)}`, width)
  );

  if (receipt.isFree) {
    lines.push("Kostenlos");
  }

  lines.push("", "");
  return `${lines.filter((line) => line !== null && line !== undefined).join("\n")}\n`;
}

function formatReceiptNumber(value) {
  const number = Math.max(0, Number(value) || 0);
  return String(number).padStart(6, "0");
}

function formatReportText(report, settings) {
  const width = 42;
  const time = report.createdAt ? new Date(report.createdAt) : new Date();
  const sections = Array.isArray(report.sections) ? report.sections : [];
  const lines = [
    String(report.title || "Tagesauswertung"),
    String(report.eventName || settings.eventName || "Festkasse"),
    String(report.clubName || settings.clubName || ""),
    time.toLocaleString("de-DE"),
    "-".repeat(width)
  ];

  for (const section of sections) {
    const showSum = Boolean(section.showSum);
    const showStock = Boolean(section.showStock);
    // Jede Zahl bekommt eine eigene, feste Spalte. Vorher standen Anzahl und
    // Betrag als ein Block rechtsbuendig, dadurch sprang die Anzahl je nach
    // Laenge des Betrags hin und her.
    const columns = [
      ...(showStock ? [{ header: "Bestand", width: 9 }] : []),
      { header: "Anzahl", width: showSum ? 8 : 9 },
      ...(showSum ? [{ header: "Summe", width: 12 }] : [])
    ];
    const nameWidth = width - columns.reduce((sum, column) => sum + column.width, 0);
    const renderRow = (name, values) => {
      const valueText = values.map((value, index) => padText(value, columns[index].width, "right")).join("");
      // Lange Artikelnamen laufen in die naechste Zeile, damit die Spalten
      // stehen bleiben.
      const nameLines = wrapText(name, nameWidth);
      return [
        `${padText(nameLines[0], nameWidth)}${valueText}`.trimEnd(),
        ...nameLines.slice(1).map((line) => padText(line, nameWidth).trimEnd())
      ];
    };

    lines.push("", String(section.title || "Abschnitt"), "-".repeat(width));
    lines.push(`${padText("Artikel", nameWidth)}${columns.map((column) => padText(column.header, column.width, "right")).join("")}`);
    lines.push("-".repeat(width));

    const rows = Array.isArray(section.rows) ? section.rows : [];
    if (!rows.length) {
      lines.push("Keine Buchungen");
    } else {
      for (const row of rows) {
        lines.push(...renderRow(String(row.name || "Artikel"), [
          ...(showStock ? [Number.isFinite(row.stock) ? String(row.stock) : "-"] : []),
          String(Number(row.quantity) || 0),
          ...(showSum ? [moneyText(row.sum, settings.currency)] : [])
        ]));
      }
    }

    lines.push("-".repeat(width));
    lines.push(...renderRow("Total Artikel", [
      ...(showStock ? [""] : []),
      String(Number(section.totalCount) || 0),
      ...(showSum ? [""] : [])
    ]));
    if (showSum) {
      lines.push(...renderRow("Total Summe", [
        ...(showStock ? [""] : []),
        "",
        moneyText(section.totalSum, settings.currency)
      ]));
    }
  }

  lines.push("", "");
  return `${lines.join("\n")}\n`;
}

function toPrinterText(text) {
  return String(text || "").replace(/\r?\n/g, "\r\n");
}

function encodePrinterText(text) {
  const cp858 = {
    "\u00c4": 0x8e,
    "\u00d6": 0x99,
    "\u00dc": 0x9a,
    "\u00df": 0xe1,
    "\u00e4": 0x84,
    "\u00f6": 0x94,
    "\u00fc": 0x81,
    "\u00e9": 0x82,
    "\u00e8": 0x8a,
    "\u00e1": 0xa0,
    "\u00e0": 0x85,
    "\u00f1": 0xa4,
    "\u00d1": 0xa5,
    "\u00b0": 0xf8,
    "\u00b5": 0xe6,
    "\u20ac": 0xd5
  };
  const bytes = [];
  for (const char of toPrinterText(text)) {
    const code = char.charCodeAt(0);
    if (cp858[char]) {
      bytes.push(cp858[char]);
    } else if (code <= 0x7f) {
      bytes.push(code);
    } else {
      bytes.push(0x3f);
    }
  }
  return Buffer.from(bytes);
}

function escposPrintBody(text) {
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x74, 0x06]),
    encodePrinterText(text)
  ]);
}

function escposCut() {
  return Buffer.from([0x1d, 0x56, 0x01]);
}

function escposFeed(lines) {
  return Buffer.from([0x1b, 0x64, Math.max(0, Math.min(255, Number(lines) || 0))]);
}

function escposText(text) {
  return encodePrinterText(text);
}

function escposReceiptBody(receipt, settings) {
  const width = 42;
  const time = receipt.createdAt ? new Date(receipt.createdAt) : new Date();
  const receiptNumber = formatReceiptNumber(receipt.receiptNumber);
  const articleLines = wrapText(receipt.articleName || "Artikel", width).map((line) => `${line}\r\n`);
  const chunks = [
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x74, 0x06]),
    Buffer.from([0x1b, 0x61, 0x01]),
    escposText(`${settings.eventName || "Festkasse"}\r\n`),
    escposText(`${settings.clubName || ""}\r\n`),
    escposText(`${"-".repeat(width)}\r\n`),
    Buffer.from([0x1b, 0x45, 0x01]),
    Buffer.from([0x1d, 0x21, 0x01]),
    ...articleLines.map(escposText),
    Buffer.from([0x1d, 0x21, 0x00]),
    Buffer.from([0x1b, 0x45, 0x00])
  ];

  if (!receipt.isFree) {
    chunks.push(escposText(`\r\n${moneyText(receipt.price, settings.currency)}\r\n`));
  } else {
    chunks.push(escposText("\r\nKostenlos\r\n"));
  }

  chunks.push(
    escposText(`\r\n${"-".repeat(width)}\r\n`),
    escposText(`${receipt.isTest ? "Testdruck" : `Bon #${receiptNumber}`}  ${receiptDateTimeText(time)}\r\n`),
    escposFeed(8)
  );
  return Buffer.concat(chunks);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadSerialPort() {
  try {
    return require("serialport").SerialPort;
  } catch (error) {
    throw Object.assign(new Error("Paket 'serialport' ist nicht installiert. Bitte 'npm install' ausführen."), { status: 503, cause: error });
  }
}

function serialErrorMessage(error, portPath) {
  const detail = error?.message ? ` (${error.message})` : "";
  return `Thermodrucker auf ${portPath} nicht erreichbar${detail}.`;
}

async function writeSerialPrinterJobs(jobs, settings) {
  const SerialPort = loadSerialPort();
  const portPath = resolvePrinterPort(settings.printerPort);
  const serialPort = new SerialPort({
    path: portPath,
    baudRate: 9600,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
    xon: true,
    xoff: true,
    rtscts: false,
    autoOpen: false
  });

  try {
    await new Promise((resolve, reject) => serialPort.open((error) => (error ? reject(error) : resolve())));
    for (const job of jobs) {
      if (job.delayMs) {
        await sleep(job.delayMs);
      }
      if (job.buffer?.length) {
        await new Promise((resolve, reject) => serialPort.write(job.buffer, (error) => (error ? reject(error) : resolve())));
        await new Promise((resolve, reject) => serialPort.drain((error) => (error ? reject(error) : resolve())));
      }
    }
  } catch (error) {
    throw Object.assign(new Error(serialErrorMessage(error, portPath)), { status: 503, cause: error });
  } finally {
    if (serialPort.isOpen) {
      await new Promise((resolve) => serialPort.close(() => resolve()));
    }
  }
}

async function writeSerialPrinter(buffer, settings) {
  await writeSerialPrinterJobs([{ buffer }], settings);
}

async function printReceiptsSerial(receipts, settings) {
  const receiptsList = Array.isArray(receipts) ? receipts : [];
  const jobs = receiptsList.flatMap((receipt, index) => [
    { buffer: escposReceiptBody(receipt, settings) },
    { delayMs: 900 },
    { buffer: escposCut() },
    ...(index < receiptsList.length - 1 ? [{ delayMs: 250 }] : [])
  ]);
  if (!jobs.length) return;
  await writeSerialPrinterJobs(jobs, settings);
}

async function printReportSerial(report, settings) {
  await writeSerialPrinterJobs([
    { buffer: escposPrintBody(formatReportText(report, settings)) },
    { delayMs: 900 },
    { buffer: escposFeed(12) },
    { delayMs: 900 },
    { buffer: escposCut() }
  ], settings);
}

async function printerStatus(settings) {
  const mode = settings.printerMode || "browser";
  if (mode !== "serial") {
    return { mode, online: true, label: mode === "textfile" ? "Textdatei" : "Browserdruck" };
  }

  const portPath = resolvePrinterPort(settings.printerPort);
  try {
    loadSerialPort();
    await fsp.access(portPath, fs.constants.R_OK | fs.constants.W_OK);
    return { mode, online: true, label: "Drucker", port: portPath };
  } catch (error) {
    return { mode, online: false, label: "Drucker Offline", port: portPath, error: error.message || "nicht erreichbar" };
  }
}

async function writeReceiptTextFiles(receipts, settings) {
  const outputDir = resolvePrintOutputDir(settings.printOutputDir);
  await fsp.mkdir(outputDir, { recursive: true });

  const files = [];
  for (const receipt of receipts) {
    const fileName = safePrintFileName(receipt.isFree ? "kostenlos" : "bon");
    const filePath = path.join(outputDir, fileName);
    await fsp.writeFile(filePath, formatReceiptText(receipt, settings), "utf8");
    files.push(filePath);
  }
  return files;
}

async function writeReportTextFile(report, settings) {
  const outputDir = resolvePrintOutputDir(settings.printOutputDir);
  await fsp.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, safePrintFileName("auswertung"));
  await fsp.writeFile(filePath, formatReportText(report, settings), "utf8");
  return filePath;
}

// Whitelist fuer den Testdruck: nur die drei Druckfelder, nichts sonst aus
// der Anfrage. Nicht gesetzte Felder bleiben weg, damit die gespeicherten
// Einstellungen greifen.
function testPrintSettings(incoming) {
  const allowedModes = ["browser", "textfile", "serial"];
  const settings = {};
  if (allowedModes.includes(incoming?.printerMode)) settings.printerMode = incoming.printerMode;
  if (incoming?.printerPort) settings.printerPort = resolvePrinterPort(incoming.printerPort);
  if (incoming?.printOutputDir) settings.printOutputDir = String(incoming.printOutputDir).trim();
  return settings;
}

function resolveManagedFile(fileName) {
  const safeName = path.basename(String(fileName || ""));
  const savedPath = path.join(savedDir, safeName);
  if (fs.existsSync(savedPath)) return savedPath;
  throw Object.assign(new Error("Datei nicht gefunden."), { status: 404 });
}

async function listManagedFiles(dir, type) {
  const files = await fsp.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".json")) continue;
    const state = await readJson(path.join(dir, file.name));
    result.push({
      type,
      file: file.name,
      eventName: state.settings?.templateName || state.settings?.eventName || file.name,
      sourceEventName: state.settings?.eventName || file.name,
      clubName: state.settings?.clubName || "",
      orderCount: state.orders?.length || 0,
      dayReportCount: state.dayReports?.length || 0,
      updatedAt: state.settings?.updatedAt || null
    });
  }
  return result.sort((a, b) => a.eventName.localeCompare(b.eventName, "de"));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 15 * 1024 * 1024) {
      throw Object.assign(new Error("Payload zu groß."), { status: 413 });
    }
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendError(res, error) {
  sendJson(res, error.status || 500, { error: error.message || "Serverfehler" });
}

function readPackageVersion() {
  try {
    return readPackageMeta().version || process.env.npm_package_version || "unknown";
  } catch (error) {
    return process.env.npm_package_version || "unknown";
  }
}

function readPackageMeta() {
  try {
    return JSON.parse(fs.readFileSync(packagePath, "utf8"));
  } catch (error) {
    return {};
  }
}

function repositoryUrl(packageMeta) {
  const rawRepository = packageMeta.repository;
  const url = typeof rawRepository === "string" ? rawRepository : rawRepository?.url;
  const cleaned = String(url || "")
    .replace(/^git\+/, "")
    .replace(/\.git$/, "");
  // Nur https zulassen - der Wert landet in den Systeminformationen.
  return /^https:\/\/[^\s"'<>]+$/.test(cleaned) ? cleaned : "";
}

function readGitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: __dirname,
      encoding: "utf8",
      windowsHide: true
    }).trim();
  } catch (error) {
    return "unknown";
  }
}

// Ermittelt die LAN-IP frisch bei jeder Anfrage (nicht beim Start gecacht),
// damit ein IP-Wechsel zwischen Festen (anderes Netz, neue DHCP-Vergabe)
// automatisch berücksichtigt wird, ohne den Server neu zu starten.
function detectLanUrl() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return { ip: iface.address, port, url: `http://${iface.address}:${port}/` };
      }
    }
  }
  return { ip: null, port, url: null };
}

function systemInfo(state = {}) {
  const packageMeta = readPackageMeta();
  return {
    platform: process.platform,
    canShutdown: process.platform === "linux",
    canSetSystemTime: process.platform === "linux",
    appVersion: readPackageVersion(),
    gitCommit: readGitCommit(),
    nodeVersion: process.version,
    license: packageMeta.license || "MIT",
    copyright: "Copyright (c) Andreas Spitzenberg",
    repositoryUrl: repositoryUrl(packageMeta),
    serverTime: new Date().toISOString(),
    defaultPasswordsActive: hasAnyDefaultPassword(state),
    defaultPasswordUsernames: defaultPasswordUsernames(state),
    ...logoInfo()
  };
}

function compareVersions(current, latest) {
  const currentParts = String(current || "0").split(".").map((part) => Number(part) || 0);
  const latestParts = String(latest || "0").split(".").map((part) => Number(part) || 0);
  const length = Math.max(currentParts.length, latestParts.length);
  for (let index = 0; index < length; index += 1) {
    const left = currentParts[index] || 0;
    const right = latestParts[index] || 0;
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
}

function fetchJson(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Festkasse-Community"
      },
      timeout: timeoutMs
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          request.destroy(new Error("Antwort zu groß."));
        }
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Timeout")));
    request.on("error", reject);
  });
}

// Die Versionsnummer kommt aus einer fremden package.json ueber das Netz und
// wird in der Oberflaeche angezeigt - deshalb hier auf ein Zahlenmuster
// festnageln, statt beliebigen Text durchzureichen.
function safeVersionText(value) {
  const version = String(value || "").trim();
  return /^[0-9]+(\.[0-9]+){0,3}(-[0-9A-Za-z.]+)?$/.test(version) ? version : "unknown";
}

async function checkLatestVersion() {
  const currentVersion = readPackageVersion();
  const latestPackage = await fetchJson(latestVersionUrl);
  const latestVersion = safeVersionText(latestPackage.version);
  if (latestVersion === "unknown") {
    return {
      ok: false,
      currentVersion,
      latestVersion,
      isLatest: null,
      updateAvailable: false,
      error: "Die gemeldete Version ist keine gültige Versionsnummer."
    };
  }
  const comparison = compareVersions(currentVersion, latestVersion);
  return {
    ok: true,
    currentVersion,
    latestVersion,
    isLatest: comparison >= 0,
    updateAvailable: comparison < 0,
    source: latestVersionUrl
  };
}

function shutdownSystem() {
  return new Promise((resolve, reject) => {
    execFile("sudo", ["shutdown", "-h", "now"], (error) => {
      if (error) {
        reject(Object.assign(new Error("Herunterfahren fehlgeschlagen. Bitte sudo-Rechte für shutdown prüfen."), { status: 500 }));
        return;
      }
      resolve();
    });
  });
}

function setSystemTimeLinux(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const formatted = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return new Promise((resolve, reject) => {
    execFile("sudo", ["date", "-s", formatted], (error) => {
      if (error) {
        reject(Object.assign(new Error("Uhrzeit konnte nicht gesetzt werden. Bitte sudo-Rechte für date prüfen."), { status: 500 }));
        return;
      }
      resolve();
    });
  });
}

async function handleApi(req, res, urlPath) {
  // Das Einzige, was der Login-Bildschirm vor der Anmeldung braucht: Namen
  // fuer die Kopfzeile, die Kontaktangaben und die Standardzugaenge. Bewusst
  // ohne Benutzerliste und ohne Bestellungen.
  //
  // defaultPasswordUsernames steht hier bewusst vor der Anmeldung: die Box
  // soll pro Zeile verschwinden, sobald das jeweilige Passwort geaendert
  // wurde. Das verraet einem nicht angemeldeten Aufrufer, welches der drei
  // Konten noch das in der Doku veroeffentlichte Passwort hat - in Kauf
  // genommen, weil die Kasse offline oder in einem privaten Netz laeuft und
  // die Passwoerter ohnehin dokumentiert sind. Mehr als diese drei kann der
  // Endpunkt nicht preisgeben: hasDefaultPassword erkennt Konten ueber Salt
  // und Hash der Auslieferung, selbst angelegte Benutzer sind nie dabei.
  if (req.method === "GET" && urlPath === "/api/bootstrap") {
    const state = await readJson(activePath);
    const settings = state.settings || {};
    sendJson(res, 200, {
      settings: {
        eventName: settings.eventName || "",
        clubName: settings.clubName || "",
        calculatorName: settings.calculatorName || "",
        calculatorPhone: settings.calculatorPhone || "",
        calculatorComment: settings.calculatorComment || ""
      },
      system: {
        appVersion: readPackageVersion(),
        defaultPasswordsActive: hasAnyDefaultPassword(state),
        defaultPasswordUsernames: defaultPasswordUsernames(state),
        ...logoInfo()
      }
    });
    return;
  }

  // Das Logo steht im Anmeldebildschirm und ist deshalb bewusst ohne Sitzung
  // abrufbar - genauso wie Fest- und Organisationsname aus /api/bootstrap.
  if (req.method === "GET" && urlPath === "/api/logo") {
    const logo = readLogo();
    if (!logo) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Kein Logo hinterlegt.");
      return;
    }
    const etag = `"${logo.updatedAt || 0}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag });
      res.end();
      return;
    }
    const body = Buffer.from(logo.base64, "base64");
    res.writeHead(200, {
      "Content-Type": logo.mimeType,
      "Content-Length": body.length,
      ETag: etag,
      // Die Oberflaeche haengt die Schreibzeit als ?v= an. Ohne diese Angabe
      // wird jedes Mal nachgefragt, mit ihr darf der Browser dauerhaft cachen.
      "Cache-Control": /[?&]v=/.test(req.url || "") ? "public, max-age=31536000, immutable" : "no-cache"
    });
    res.end(body);
    return;
  }

  if (req.method === "POST" && urlPath === "/api/logo") {
    if (!requireAdminSession(req, res)) return;
    const body = await readBody(req);
    await writeLogoFromDataUrl(body.dataUrl);
    sendJson(res, 200, logoInfo());
    return;
  }

  if (req.method === "DELETE" && urlPath === "/api/logo") {
    if (!requireAdminSession(req, res)) return;
    if (fs.existsSync(logoPath)) await fsp.unlink(logoPath);
    sendJson(res, 200, logoInfo());
    return;
  }

  if (req.method === "GET" && urlPath === "/api/system") {
    if (!requireSession(req, res)) return;
    const state = await readJson(activePath);
    sendJson(res, 200, { system: systemInfo(state) });
    return;
  }

  if (req.method === "GET" && urlPath === "/api/version-check") {
    if (!requireSession(req, res)) return;
    try {
      sendJson(res, 200, await checkLatestVersion());
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        currentVersion: readPackageVersion(),
        latestVersion: "unknown",
        isLatest: null,
        updateAvailable: false,
        error: "Online-Version konnte nicht geprüft werden."
      });
    }
    return;
  }

  if (req.method === "GET" && urlPath === "/api/state") {
    if (!requireSession(req, res)) return;
    const state = await readJson(activePath);
    sendJson(res, 200, { state: sanitizeState(state), system: systemInfo(state) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/state") {
    const session = requireWriteSession(req, res);
    if (!session) return;
    const body = await readBody(req);
    const current = await readJson(activePath);
    let nextState = mergeIncomingState(current, body.state || {}, session.role);
    nextState.settings = { ...(nextState.settings || {}), updatedAt: new Date().toISOString() };
    const closeResult = closeFinishedBusinessDays(nextState);
    if (closeResult) {
      nextState = closeResult.state;
      logBusinessDayClose(closeResult.closed);
    }
    await writeJson(activePath, nextState);
    sendJson(res, 200, { state: sanitizeState(nextState), system: systemInfo(nextState) });
    return;
  }

  if (req.method === "GET" && urlPath === "/api/report/today") {
    const session = requireSession(req, res);
    if (!session) return;
    const state = await readJson(activePath);
    const today = businessDayKey(new Date());
    const orders = filterPaidOrdersForBusinessDay(state.orders || [], today);
    // Trace: Zugriffe auf den Live-Bericht sind schwer zu reproduzieren
    // (separates Geraet/Tab, eigene Session), daher hier sichtbar im
    // Server-Terminal protokollieren, wer wann abgerufen hat.
    console.log(
      `[Festkasse] Report-Abruf: "${session.username}" (Rolle ${session.role}) fuer ${today} | ${new Date().toISOString()}`
    );
    sendJson(res, 200, {
      eventName: state.settings?.eventName || "",
      clubName: state.settings?.clubName || "",
      ...logoInfo(),
      currency: state.settings?.currency || "EUR",
      report: buildReportData(orders),
      buckets: buildIntervalBuckets(orders),
      articleStock: Object.fromEntries((state.articles || []).map((article) => [article.id, article.stock]))
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/login") {
    const body = await readBody(req);
    const state = await readJson(activePath);
    const user = (state.users || []).find((candidate) => candidate.username === body.username);
    if (!verifyPassword(user, body.password || "")) {
      sendJson(res, 401, { error: "Login fehlgeschlagen." });
      return;
    }
    if (user.role !== "report" && isSessionActive() && !body.force) {
      // Diagnose: haelt fest, WER (Rolle/Geraet) hier abgewiesen wurde und
      // wer gerade als aktiv gilt - sichtbar direkt im Server-Terminal.
      console.warn(
        `[Festkasse] Login-Konflikt (409): "${body.username}" (Rolle ${user.role}) abgewiesen, ` +
        `"${activeSession.username}" (Rolle ${activeSession.role}) ist aktiv. ` +
        `User-Agent: ${req.headers["user-agent"] || "unbekannt"} | ${new Date().toISOString()}`
      );
      sendJson(res, 409, { error: `Bereits angemeldet: ${activeSession.username}`, activeUsername: activeSession.username });
      return;
    }
    const { passwordHash, passwordSalt, password, ...safeUser } = user;
    const token = createSession(safeUser);
    sendJson(res, 200, { user: safeUser, token });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/logout") {
    destroySession(sessionTokenFromRequest(req));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && urlPath === "/api/events") {
    if (!requireAdminSession(req, res)) return;
    const active = await readJson(activePath);
    const saved = await listManagedFiles(savedDir, "saved");
    sendJson(res, 200, {
      active: {
        file: "active-event.json",
        eventName: active.settings?.eventName || "Aktuelles Fest",
        clubName: active.settings?.clubName || "",
        orderCount: active.orders?.length || 0,
        dayReportCount: active.dayReports?.length || 0
      },
      defaults: {
        file: "defaults.json",
        eventName: "Default",
        sourceEventName: defaultState.settings.eventName,
        clubName: defaultState.settings.clubName
      },
      saved
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/events/save") {
    if (!requireAdminSession(req, res)) return;
    const body = await readBody(req);
    const active = await readJson(activePath);
    const templateName = String(body.name || active.settings?.eventName || "Vorlage").trim();
    const savedAt = new Date();
    const fileName = safeEventVersionFileName(templateName, savedAt);
    const savedState = {
      ...active,
      settings: {
        ...(active.settings || {}),
        templateName,
        activeEventFile: fileName,
        updatedAt: savedAt.toISOString()
      }
    };
    await writeJson(path.join(savedDir, fileName), savedState);
    sendJson(res, 200, { file: fileName, state: sanitizeState(active), system: systemInfo(active) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/events/load") {
    if (!requireAdminSession(req, res)) return;
    const body = await readBody(req);
    const source = await withoutEmbeddedLogo(
      body.source === "defaults" ? await readJson(defaultsPath) : await readJson(resolveManagedFile(body.file))
    );
    const nextState = body.mode === "template"
      ? createTemplateState(source)
      : { ...source, settings: { ...(source.settings || {}), activeEventFile: "active-event.json" } };
    await writeJson(activePath, nextState);
    sendJson(res, 200, { state: sanitizeState(nextState), system: systemInfo(nextState) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/events/new") {
    if (!requireAdminSession(req, res)) return;
    const body = await readBody(req);
    const source = await withoutEmbeddedLogo(
      body.file ? await readJson(resolveManagedFile(body.file)) : await readJson(defaultsPath)
    );
    const nextState = createTemplateState(source, body.eventName || "Neues Fest");
    await writeJson(activePath, nextState);
    sendJson(res, 200, { state: sanitizeState(nextState), system: systemInfo(nextState) });
    return;
  }

  if (req.method === "DELETE" && urlPath === "/api/events") {
    if (!requireAdminSession(req, res)) return;
    const body = await readBody(req);
    const filePath = resolveManagedFile(body.file);
    await fsp.unlink(filePath);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/users/password") {
    if (!requireAdminSession(req, res)) return;
    const body = await readBody(req);
    const password = String(body.password || "");
    // Clientseitig gibt es bereits minlength=4, der Server darf sich aber
    // nicht darauf verlassen (Request laesst sich ohne Browser abschicken).
    if (password.length < 4) {
      sendJson(res, 400, { error: "Passwort muss mindestens 4 Zeichen haben." });
      return;
    }
    const state = await readJson(activePath);
    const user = (state.users || []).find((candidate) => candidate.username === body.username || candidate.id === body.id);
    if (!user) {
      sendJson(res, 404, { error: "Benutzer nicht gefunden." });
      return;
    }
    Object.assign(user, createPasswordRecord(password));
    delete user.password;
    await writeJson(activePath, state);
    sendJson(res, 200, { user: sanitizeState({ users: [user] }).users[0], system: systemInfo(state) });
    return;
  }

  if (req.method === "GET" && urlPath === "/api/print/status") {
    if (!requireSession(req, res)) return;
    const state = await readJson(activePath);
    sendJson(res, 200, { status: await printerStatus(state.settings || {}) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/print/receipts") {
    if (!requireWriteSession(req, res)) return;
    const body = await readBody(req);
    const state = await readJson(activePath);
    const settings = state.settings || {};
    const mode = settings.printerMode || "browser";

    if (mode === "textfile") {
      const files = await writeReceiptTextFiles(body.receipts || [], settings);
      sendJson(res, 200, { ok: true, mode, files });
      return;
    }

    if (mode === "serial") {
      await printReceiptsSerial(body.receipts || [], settings);
      sendJson(res, 200, { ok: true, mode, files: [] });
      return;
    }

    sendJson(res, 200, { ok: true, mode: "browser", files: [] });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/print/report") {
    if (!requireAdminSession(req, res)) return;
    const body = await readBody(req);
    const state = await readJson(activePath);
    const settings = state.settings || {};
    const mode = settings.printerMode || "browser";

    if (mode === "textfile") {
      const file = await writeReportTextFile(body.report || {}, settings);
      sendJson(res, 200, { ok: true, mode, files: [file] });
      return;
    }

    if (mode === "serial") {
      await printReportSerial(body.report || {}, settings);
      sendJson(res, 200, { ok: true, mode, files: [] });
      return;
    }

    sendJson(res, 200, { ok: true, mode: "browser", files: [] });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/print/test") {
    if (!requireAdminSession(req, res)) return;
    const body = await readBody(req);
    const state = await readJson(activePath);
    // Der Testdruck soll die im Formular eingetragenen, noch nicht
    // gespeicherten Druckeinstellungen pruefen. Deshalb - und nur hier -
    // werden genau diese drei Felder aus der Anfrage uebernommen; sie laufen
    // ueber resolvePrintOutputDir/resolvePrinterPort und koennen das
    // Projektverzeichnis nicht verlassen.
    const settings = { ...(state.settings || {}), ...testPrintSettings(body.settings) };
    const mode = settings.printerMode || "browser";
    const receipt = {
      articleName: "Testbon Festkasse",
      price: 1.23,
      isFree: false,
      isTest: true,
      createdAt: new Date().toISOString(),
      receiptNumber: 0
    };

    if (mode === "textfile" || mode === "browser") {
      const files = await writeReceiptTextFiles([receipt], settings);
      sendJson(res, 200, { ok: true, mode: "textfile", files });
      return;
    }

    if (mode === "serial") {
      await printReceiptsSerial([receipt], settings);
      sendJson(res, 200, { ok: true, mode, files: [] });
      return;
    }

    sendJson(res, 400, { error: "Unbekannter Druckmodus." });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/system/shutdown") {
    if (!requireAdminSession(req, res)) return;
    if (process.platform !== "linux") {
      sendJson(res, 400, { error: "Herunterfahren ist nur auf Linux aktiviert." });
      return;
    }
    sendJson(res, 202, { ok: true });
    shutdownSystem().catch((error) => console.error(error.message));
    return;
  }

  if (req.method === "POST" && urlPath === "/api/system/datetime") {
    const session = requireAdminSession(req, res);
    if (!session) return;
    if (process.platform !== "linux") {
      sendJson(res, 400, { error: "Uhrzeit setzen ist nur auf Linux aktiviert." });
      return;
    }
    const body = await readBody(req);
    const parsed = new Date(body.dateTime);
    if (Number.isNaN(parsed.getTime())) {
      sendJson(res, 400, { error: "Ungültiges Datum/Uhrzeit." });
      return;
    }
    try {
      await setSystemTimeLinux(parsed);
    } catch (error) {
      sendError(res, error);
      return;
    }
    // Eigene Session an die neue Uhrzeit anpassen, damit man sich nicht selbst aussperrt.
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    sendJson(res, 200, { ok: true, serverTime: new Date().toISOString() });
    return;
  }

  if (req.method === "GET" && urlPath === "/api/system/network") {
    if (!requireAdminSession(req, res)) return;
    sendJson(res, 200, detectLanUrl());
    return;
  }

  sendJson(res, 404, { error: "API-Endpunkt nicht gefunden." });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  // URL-Pfade sind immer POSIX-Forward-Slash, unabhängig vom Server-Betriebssystem.
  // path.normalize() (ohne .posix) würde auf Windows "/" in "\" umwandeln und
  // damit sowohl den Alias-Vergleich als auch die "/"-Sonderbehandlung stumm
  // brechen - deshalb hier ausdrücklich path.posix.normalize verwenden.
  const safePath = path.posix.normalize(urlPath).replace(/^(\.\.\/)+/, "");
  const aliases = { "/": "/index.html", "/report": "/report.html" };
  const requestedPath = aliases[safePath] || safePath;
  const filePath = path.join(publicDir, requestedPath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(publicDir, "index.html"), (fallbackError, fallbackContent) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        res.writeHead(200, { "Content-Type": contentTypes[".html"], "Cache-Control": "no-store" });
        res.end(fallbackContent);
      });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const headers = { "Content-Type": contentTypes[extension] || "application/octet-stream" };
    if ([".html", ".js", ".css"].includes(extension)) {
      headers["Cache-Control"] = "no-store";
    }
    res.writeHead(200, headers);
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath.startsWith("/api/")) {
      await handleApi(req, res, urlPath);
      return;
    }
    serveStatic(req, res);
  } catch (error) {
    sendError(res, error);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} ist bereits belegt. Läuft Festkasse schon?`);
    console.error(`Browser-Adresse: http://localhost:${port}`);
    process.exit(1);
  }
  throw error;
});

ensureDataFiles().then(async () => {
  // War die Kasse zur Schnittzeit aus, wird der Abschluss beim Start
  // nachgeholt, bevor die erste Anfrage beantwortet wird.
  await runBusinessDayClose();
  scheduleBusinessDayClose();
  server.listen(port, () => {
    console.log(`Festkasse Community Edition läuft auf http://localhost:${port}`);
  });
}).catch((error) => {
  console.error("Dateninitialisierung fehlgeschlagen:", error);
  process.exit(1);
});
