// Festkasse Community Edition
// Zielgruppe: Feuerwehren, Vereine und ehrenamtliche Organisationen.

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { execFile, execFileSync } = require("child_process");

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const eventsDir = path.join(dataDir, "events");
const archiveDir = path.join(dataDir, "archive");
const printsDir = path.join(dataDir, "prints");
const defaultsPath = path.join(dataDir, "defaults.json");
const activePath = path.join(dataDir, "fest.json");
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
    printerName: "Browserdruck",
    printerMode: "browser",
    printerPort: defaultSerialPrinterPort,
    printOutputDir: "data/prints",
    receiptFooter: "Vielen Dank!",
    logoDataUrl: "",
    calculatorName: "Kassenleitung",
    calculatorPhone: "",
    calculatorComment: "",
    menuVersion: 5,
    activeEventFile: "fest.json",
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
  await fsp.mkdir(eventsDir, { recursive: true });
  await fsp.mkdir(archiveDir, { recursive: true });
  await fsp.mkdir(printsDir, { recursive: true });
  if (!fs.existsSync(defaultsPath)) {
    await writeJson(defaultsPath, defaultState);
  }
  if (!fs.existsSync(activePath)) {
    const defaults = await readJson(defaultsPath);
    await writeJson(activePath, createTemplateState(defaults, defaults.settings.eventName));
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

function hasDefaultPassword(user) {
  const defaults = {
    kasse: {
      passwordSalt: "default-kasse",
      passwordHash: "80f7c7004e02d83a00b6b179409fc6736c0335277eddd0f6234b81dc14418d31"
    },
    admin: {
      passwordSalt: "default-admin",
      passwordHash: "48451a874317ae58ad068ea737fd3fbb1a9689958087047794809a74bbc5ff79"
    }
  };
  const expected = defaults[user?.username];
  return Boolean(expected && user.passwordSalt === expected.passwordSalt && user.passwordHash === expected.passwordHash);
}

function hasAnyDefaultPassword(state) {
  return (state.users || []).some(hasDefaultPassword);
}

function mergeIncomingState(current, incoming) {
  return {
    ...current,
    ...incoming,
    users: preserveUserSecrets(current.users || [], incoming.users || current.users || []),
    settings: {
      ...(current.settings || {}),
      ...(incoming.settings || {})
    }
  };
}

function preserveUserSecrets(currentUsers, incomingUsers) {
  return incomingUsers.map((incomingUser) => {
    const existing = currentUsers.find((user) => user.id === incomingUser.id || user.username === incomingUser.username);
    return {
      ...existing,
      ...incomingUser,
      passwordSalt: incomingUser.passwordSalt || existing?.passwordSalt,
      passwordHash: incomingUser.passwordHash || existing?.passwordHash
    };
  });
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

function createTemplateState(source, eventName = source.settings?.eventName || "Neues Fest") {
  return {
    ...source,
    orders: [],
    cancellations: [],
    dayReports: [],
    articles: (source.articles || []).map((article, index) => ({
      ...article,
      stock: 500,
      sortOrder: Number.isFinite(Number(article.sortOrder)) ? Number(article.sortOrder) : index + 1
    })),
    settings: {
      ...(source.settings || {}),
      eventName,
      activeEventFile: "fest.json",
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

function resolvePrintOutputDir(configuredDir) {
  const rawDir = String(configuredDir || "data/prints").trim() || "data/prints";
  return path.isAbsolute(rawDir) ? rawDir : path.join(__dirname, rawDir);
}

function padText(text, width, align = "left") {
  const value = String(text ?? "");
  if (value.length >= width) return value.slice(0, width);
  const spaces = " ".repeat(width - value.length);
  return align === "right" ? `${spaces}${value}` : `${value}${spaces}`;
}

function moneyText(value, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(Number(value) || 0);
}

function formatReceiptText(receipt, settings) {
  const width = 42;
  const time = receipt.createdAt ? new Date(receipt.createdAt) : new Date();
  const receiptNumber = formatReceiptNumber(receipt.receiptNumber);
  const lines = [
    settings.eventName || "Festkasse",
    settings.clubName || "",
    "-".repeat(width),
    "",
    String(receipt.articleName || "Artikel"),
  ];

  if (!receipt.isFree) {
    lines.push(moneyText(receipt.price, settings.currency));
  }

  lines.push(
    "",
    "-".repeat(width),
    `Bon #${receiptNumber}  ${time.toLocaleDateString("de-DE")} ${time.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`
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
    lines.push("", String(section.title || "Abschnitt"), "-".repeat(width));
    const rows = Array.isArray(section.rows) ? section.rows : [];
    if (!rows.length) {
      lines.push("Keine Buchungen");
    } else {
      for (const row of rows) {
        const quantity = Number(row.quantity) || 0;
        const name = String(row.name || "Artikel");
        const amount = section.showSum ? moneyText(row.sum, settings.currency) : "";
        const right = section.showSum ? `${quantity} ${amount}` : String(quantity);
        lines.push(`${padText(name, 26)}${padText(right, 16, "right")}`);
      }
    }
    lines.push("-".repeat(width));
    lines.push(`${padText("Total Artikel", 26)}${padText(section.totalCount || 0, 16, "right")}`);
    if (section.showSum) {
      lines.push(`${padText("Total Summe", 26)}${padText(moneyText(section.totalSum, settings.currency), 16, "right")}`);
    }
  }

  lines.push("", "");
  return `${lines.join("\n")}\n`;
}

function toPrinterText(text) {
  return String(text || "").replace(/\r?\n/g, "\r\n");
}

function escposPrintJob(text) {
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    Buffer.from(toPrinterText(text), "utf8"),
    Buffer.from([0x1d, 0x56, 0x41, 0x10])
  ]);
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

async function writeSerialPrinter(buffer, settings) {
  const SerialPort = loadSerialPort();
  const portPath = String(settings.printerPort || defaultSerialPrinterPort).trim() || defaultSerialPrinterPort;
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
    await new Promise((resolve, reject) => serialPort.write(buffer, (error) => (error ? reject(error) : resolve())));
    await new Promise((resolve, reject) => serialPort.drain((error) => (error ? reject(error) : resolve())));
  } catch (error) {
    throw Object.assign(new Error(serialErrorMessage(error, portPath)), { status: 503, cause: error });
  } finally {
    if (serialPort.isOpen) {
      await new Promise((resolve) => serialPort.close(() => resolve()));
    }
  }
}

async function printReceiptsSerial(receipts, settings) {
  const jobs = (Array.isArray(receipts) ? receipts : []).map((receipt) => escposPrintJob(formatReceiptText(receipt, settings)));
  if (!jobs.length) return;
  await writeSerialPrinter(Buffer.concat(jobs), settings);
}

async function printReportSerial(report, settings) {
  await writeSerialPrinter(escposPrintJob(formatReportText(report, settings)), settings);
}

async function printerStatus(settings) {
  const mode = settings.printerMode || "browser";
  if (mode !== "serial") {
    return { mode, online: true, label: mode === "textfile" ? "Textdatei" : "Browserdruck" };
  }

  const portPath = String(settings.printerPort || defaultSerialPrinterPort).trim() || defaultSerialPrinterPort;
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

function resolveManagedFile(fileName) {
  const safeName = path.basename(String(fileName || ""));
  const eventPath = path.join(eventsDir, safeName);
  const archivePath = path.join(archiveDir, safeName);
  if (fs.existsSync(eventPath)) return eventPath;
  if (fs.existsSync(archivePath)) return archivePath;
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
  return String(url || "")
    .replace(/^git\+/, "")
    .replace(/\.git$/, "");
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

function systemInfo(state = {}) {
  const packageMeta = readPackageMeta();
  return {
    platform: process.platform,
    canShutdown: process.platform === "linux",
    appVersion: readPackageVersion(),
    gitCommit: readGitCommit(),
    nodeVersion: process.version,
    license: packageMeta.license || "MIT",
    copyright: "Copyright (c) Andreas Spitzenberg",
    repositoryUrl: repositoryUrl(packageMeta),
    serverTime: new Date().toISOString(),
    defaultPasswordsActive: hasAnyDefaultPassword(state)
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

async function checkLatestVersion() {
  const currentVersion = readPackageVersion();
  const latestPackage = await fetchJson(latestVersionUrl);
  const latestVersion = latestPackage.version || "unknown";
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

async function handleApi(req, res, urlPath) {
  if (req.method === "GET" && urlPath === "/api/system") {
    const state = await readJson(activePath);
    sendJson(res, 200, { system: systemInfo(state) });
    return;
  }

  if (req.method === "GET" && urlPath === "/api/version-check") {
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
    const state = await readJson(activePath);
    sendJson(res, 200, { state: sanitizeState(state), system: systemInfo(state) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/state") {
    const body = await readBody(req);
    const current = await readJson(activePath);
    const nextState = mergeIncomingState(current, body.state || {});
    nextState.settings = { ...(nextState.settings || {}), updatedAt: new Date().toISOString() };
    await writeJson(activePath, nextState);
    sendJson(res, 200, { state: sanitizeState(nextState), system: systemInfo(nextState) });
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
    const { passwordHash, passwordSalt, password, ...safeUser } = user;
    sendJson(res, 200, { user: safeUser });
    return;
  }

  if (req.method === "GET" && urlPath === "/api/events") {
    const active = await readJson(activePath);
    const events = await listManagedFiles(eventsDir, "event");
    const archive = await listManagedFiles(archiveDir, "archive");
    sendJson(res, 200, {
      active: {
        file: "fest.json",
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
      events,
      archive
    });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/events/save") {
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
    await writeJson(path.join(eventsDir, fileName), savedState);
    sendJson(res, 200, { file: fileName, state: sanitizeState(active), system: systemInfo(active) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/events/load") {
    const body = await readBody(req);
    const source = body.source === "defaults" ? await readJson(defaultsPath) : await readJson(resolveManagedFile(body.file));
    const nextState = body.mode === "template"
      ? createTemplateState(source, body.eventName || source.settings?.eventName)
      : { ...source, settings: { ...(source.settings || {}), activeEventFile: "fest.json" } };
    await writeJson(activePath, nextState);
    sendJson(res, 200, { state: sanitizeState(nextState), system: systemInfo(nextState) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/events/new") {
    const body = await readBody(req);
    const source = body.file ? await readJson(resolveManagedFile(body.file)) : await readJson(defaultsPath);
    const nextState = createTemplateState(source, body.eventName || "Neues Fest");
    await writeJson(activePath, nextState);
    sendJson(res, 200, { state: sanitizeState(nextState), system: systemInfo(nextState) });
    return;
  }

  if (req.method === "DELETE" && urlPath === "/api/events") {
    const body = await readBody(req);
    const filePath = resolveManagedFile(body.file);
    await fsp.unlink(filePath);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/users/password") {
    const body = await readBody(req);
    const state = await readJson(activePath);
    const user = (state.users || []).find((candidate) => candidate.username === body.username || candidate.id === body.id);
    if (!user) {
      sendJson(res, 404, { error: "Benutzer nicht gefunden." });
      return;
    }
    Object.assign(user, createPasswordRecord(body.password || ""));
    delete user.password;
    await writeJson(activePath, state);
    sendJson(res, 200, { user: sanitizeState({ users: [user] }).users[0], system: systemInfo(state) });
    return;
  }

  if (req.method === "GET" && urlPath === "/api/print/status") {
    const state = await readJson(activePath);
    sendJson(res, 200, { status: await printerStatus(state.settings || {}) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/print/receipts") {
    const body = await readBody(req);
    const state = await readJson(activePath);
    const settings = { ...(state.settings || {}), ...(body.settings || {}) };
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
    const body = await readBody(req);
    const state = await readJson(activePath);
    const settings = { ...(state.settings || {}), ...(body.settings || {}) };
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
    const body = await readBody(req);
    const state = await readJson(activePath);
    const settings = { ...(state.settings || {}), ...(body.settings || {}) };
    const mode = settings.printerMode || "browser";
    const receipt = {
      articleName: "Testbon Festkasse",
      price: 1.23,
      isFree: false,
      createdAt: new Date().toISOString(),
      receiptNumber: Number(state.settings?.nextReceiptNumber) || 1
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
    if (process.platform !== "linux") {
      sendJson(res, 400, { error: "Herunterfahren ist nur auf Linux aktiviert." });
      return;
    }
    sendJson(res, 202, { ok: true });
    shutdownSystem().catch((error) => console.error(error.message));
    return;
  }

  sendJson(res, 404, { error: "API-Endpunkt nicht gefunden." });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const requestedPath = safePath === "/" ? "/index.html" : safePath;
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

ensureDataFiles().then(() => {
  server.listen(port, () => {
    console.log(`Festkasse Community Edition läuft auf http://localhost:${port}`);
  });
}).catch((error) => {
  console.error("Dateninitialisierung fehlgeschlagen:", error);
  process.exit(1);
});
