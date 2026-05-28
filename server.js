const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const eventsDir = path.join(dataDir, "events");
const archiveDir = path.join(dataDir, "archive");
const defaultsPath = path.join(dataDir, "defaults.json");
const activePath = path.join(dataDir, "fest.json");

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
    { id: "art_005", name: "Bratwurst mit Brötchen/Brot", price: 4, stock: 500, warningStock: 5, category: "Grill", categoryColor: "#ffb703", active: true, sortOrder: 5 },
    { id: "art_006", name: "Rindswurst mit Brötchen/Brot", price: 4, stock: 500, warningStock: 5, category: "Grill", categoryColor: "#ffb703", active: true, sortOrder: 6 },
    { id: "art_007", name: "Pommes", price: 3, stock: 500, warningStock: 10, category: "Beilagen", categoryColor: "#22c55e", active: true, sortOrder: 7 },
    { id: "art_008", name: "Kochkäse mit Brot", price: 4, stock: 500, warningStock: 5, category: "Beilagen", categoryColor: "#22c55e", active: true, sortOrder: 8 },
    { id: "art_009", name: "Pinsa Salami", price: 8.5, stock: 500, warningStock: 5, category: "Pinsa", categoryColor: "#8b5cf6", active: true, sortOrder: 9 },
    { id: "art_010", name: "Pinsa vegetarisch", price: 8.5, stock: 500, warningStock: 5, category: "Pinsa", categoryColor: "#8b5cf6", active: true, sortOrder: 10 },
    { id: "art_011", name: "Feta Grillpfännchen", price: 6, stock: 500, warningStock: 5, category: "Vegetarisch", categoryColor: "#14b8a6", active: true, sortOrder: 11 },
    { id: "art_012", name: "Currywurst", price: 4.5, stock: 500, warningStock: 5, category: "Grill", categoryColor: "#ffb703", active: true, sortOrder: 12 },
    { id: "art_013", name: "Schwedensalat", price: 2, stock: 500, warningStock: 5, category: "Salat", categoryColor: "#0ea5e9", active: true, sortOrder: 13 }
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
      { name: "Grill", color: "#ffb703" },
      { name: "Beilagen", color: "#22c55e" },
      { name: "Pinsa", color: "#8b5cf6" },
      { name: "Vegetarisch", color: "#14b8a6" },
      { name: "Salat", color: "#0ea5e9" }
    ]
  }
};

async function ensureDataFiles() {
  await fsp.mkdir(eventsDir, { recursive: true });
  await fsp.mkdir(archiveDir, { recursive: true });
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
      activeEventFile: "fest.json"
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
      eventName: state.settings?.eventName || file.name,
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

async function handleApi(req, res, urlPath) {
  if (req.method === "GET" && urlPath === "/api/state") {
    const state = await readJson(activePath);
    sendJson(res, 200, { state: sanitizeState(state) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/state") {
    const body = await readBody(req);
    const current = await readJson(activePath);
    const nextState = mergeIncomingState(current, body.state || {});
    nextState.settings = { ...(nextState.settings || {}), updatedAt: new Date().toISOString() };
    await writeJson(activePath, nextState);
    sendJson(res, 200, { state: sanitizeState(nextState) });
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
        eventName: defaultState.settings.eventName,
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
    const fileName = safeEventFileName(body.name || active.settings?.eventName);
    active.settings = { ...(active.settings || {}), activeEventFile: fileName, updatedAt: new Date().toISOString() };
    await writeJson(path.join(eventsDir, fileName), active);
    await writeJson(activePath, active);
    sendJson(res, 200, { file: fileName, state: sanitizeState(active) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/events/load") {
    const body = await readBody(req);
    const source = body.source === "defaults" ? await readJson(defaultsPath) : await readJson(resolveManagedFile(body.file));
    const nextState = body.mode === "template"
      ? createTemplateState(source, body.eventName || source.settings?.eventName)
      : { ...source, settings: { ...(source.settings || {}), activeEventFile: "fest.json" } };
    await writeJson(activePath, nextState);
    sendJson(res, 200, { state: sanitizeState(nextState) });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/events/new") {
    const body = await readBody(req);
    const source = body.file ? await readJson(resolveManagedFile(body.file)) : await readJson(defaultsPath);
    const nextState = createTemplateState(source, body.eventName || "Neues Fest");
    await writeJson(activePath, nextState);
    sendJson(res, 200, { state: sanitizeState(nextState) });
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
    sendJson(res, 200, { user: sanitizeState({ users: [user] }).users[0] });
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

        res.writeHead(200, { "Content-Type": contentTypes[".html"] });
        res.end(fallbackContent);
      });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
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

ensureDataFiles().then(() => {
  server.listen(port, () => {
    console.log(`Festkasse Zellhausen läuft auf http://localhost:${port}`);
  });
}).catch((error) => {
  console.error("Dateninitialisierung fehlgeschlagen:", error);
  process.exit(1);
});
