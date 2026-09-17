// Gemeinsame, reine Funktionen fuer Tagesauswertung und 30-Minuten-Verkaufschart.
// Wird von der Admin-Oberflaeche (app.js), der mobilen Report-Seite (report.js)
// UND vom Server (server.js, per require) genutzt, damit die Berechnung an
// genau einer Stelle gepflegt wird.

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

// Das Logo liegt seit 1.6.0 in einer eigenen Datei und kommt ueber /api/logo.
// Die Schreibzeit haengt als Version daran, damit ein neu hochgeladenes Logo
// den Browser-Cache sicher verdraengt. Erwartet wird ein Objekt mit hasLogo
// und logoVersion - also die Systeminfo oder die Antwort des Berichts.
function logoSrc(info) {
  if (!info?.hasLogo) return "";
  return `/api/logo?v=${encodeURIComponent(info.logoVersion || 0)}`;
}

function moneyText(value, currency = "EUR") {
  if (currency === "EUR") {
    return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)} €`;
  }
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(Number(value) || 0);
}

// Ein Kassentag laeuft von 05:00 bis 05:00 und nicht von Mitternacht bis
// Mitternacht. Ein Fest endet regelmaessig erst nach Mitternacht - an der
// Zellhaeuser Kerb lag die staerkste Stunde zwischen 00:00 und 01:00 - und ein
// Schnitt um Mitternacht wuerde denselben Abend in zwei Berichte zerlegen. Um
// 05:00 bucht garantiert niemand mehr.
const BUSINESS_DAY_START_HOUR = 5;

// Der Betriebstag, zu dem ein Zeitpunkt gehoert, als "JJJJ-MM-TT". Gerechnet
// wird in Ortszeit: die Buchungen stehen zwar als UTC-ISO-String in der Datei,
// der Kassenzettel meint aber immer die Uhr an der Wand.
function businessDayKey(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - BUSINESS_DAY_START_HOUR * 60 * 60 * 1000);
  const month = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${shifted.getFullYear()}-${month}-${day}`;
}

// Zeitpunkt, an dem der Betriebstag endet - also der naechste Morgen um 05:00.
function businessDayEnd(key) {
  const [year, month, day] = String(key).split("-").map(Number);
  if (!year || !month || !day) return new Date(NaN);
  return new Date(year, month - 1, day + 1, BUSINESS_DAY_START_HOUR, 0, 0, 0);
}

function businessDayLabel(key) {
  const [year, month, day] = String(key).split("-").map(Number);
  if (!year || !month || !day) return "";
  return `${day}.${month}.${year}`;
}

function filterPaidOrdersForBusinessDay(orders, key) {
  return (orders || []).filter((order) => order.status === "paid" && businessDayKey(order.createdAt) === key);
}

function totalsByMode(orders, isFree) {
  const totals = {};
  orders.forEach((order) => {
    order.items.forEach((item) => {
      if (isFree !== null && Boolean(item.isFree) !== isFree) return;
      totals[item.articleId] ||= { articleId: item.articleId, name: item.name, quantity: 0, sum: 0 };
      totals[item.articleId].quantity += item.quantity;
      totals[item.articleId].sum += item.lineTotal;
    });
  });
  return Object.values(totals).sort((a, b) => a.name.localeCompare(b.name, "de"));
}

// Ergaenzt Zeilen um den aktuellen Bestand (nur fuer die laufende, nicht
// archivierte Auswertung sinnvoll - historische Tagesabschluesse zeigen
// bewusst keinen Bestand, da der sich seitdem laengst geaendert haben kann).
function attachStock(rows, stockByArticleId) {
  return rows.map((row) => ({ ...row, stock: stockByArticleId?.[row.articleId] }));
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

// Bucketed ab dem ersten Bon des Tages (nicht an volle Stunden ausgerichtet),
// damit auch ein spaeter Start (z.B. 14:07) saubere 30-Minuten-Fenster ergibt.
function buildIntervalBuckets(orders, intervalMinutes = 30) {
  if (!orders.length) return [];
  const sorted = [...orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const firstMs = new Date(sorted[0].createdAt).getTime();
  const lastMs = new Date(sorted[sorted.length - 1].createdAt).getTime();
  const intervalMs = intervalMinutes * 60 * 1000;
  const bucketCount = Math.floor((lastMs - firstMs) / intervalMs) + 1;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    start: new Date(firstMs + index * intervalMs),
    end: new Date(firstMs + (index + 1) * intervalMs),
    count: 0,
    revenue: 0
  }));

  sorted.forEach((order) => {
    const orderMs = new Date(order.createdAt).getTime();
    const index = Math.min(bucketCount - 1, Math.floor((orderMs - firstMs) / intervalMs));
    const receiptCount = Array.isArray(order.receiptNumbers) ? order.receiptNumbers.length : 1;
    buckets[index].count += receiptCount;
    buckets[index].revenue += Number(order.total) || 0;
  });

  return buckets;
}

function reportTableTemplate(title, rows, showSum, totalCount, totalSum, currency = "EUR", showStock = false) {
  const emptyColumns = 2 + (showStock ? 1 : 0) + (showSum ? 1 : 0);
  const rowsHtml = rows.length
    ? rows.map((item) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        ${showStock ? `<td>${Number.isFinite(item.stock) ? item.stock : "-"}</td>` : ""}
        <td>${item.quantity}</td>
        ${showSum ? `<td>${moneyText(item.sum, currency)}</td>` : ""}
      </tr>
    `).join("")
    : `<tr><td colspan="${emptyColumns}">Noch keine Buchungen.</td></tr>`;

  return `
    <article class="report-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="table-wrap">
        <table class="report-table">
          <thead>
            <tr>
              <th>Artikel</th>
              ${showStock ? "<th>Bestand</th>" : ""}
              <th>Anzahl</th>
              ${showSum ? "<th>Summe</th>" : ""}
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr>
              <td>Total Artikel</td>
              ${showStock ? "<td></td>" : ""}
              <td>${totalCount}</td>
              ${showSum ? "<td></td>" : ""}
            </tr>
            ${showSum ? `<tr><td>Total Summe</td>${showStock ? "<td></td>" : ""}<td></td><td>${moneyText(totalSum, currency)}</td></tr>` : ""}
          </tfoot>
        </table>
      </div>
    </article>
  `;
}

function intervalTimeLabel(date) {
  // bucket.start/end sind echte Date-Objekte, wenn buildIntervalBuckets im
  // selben Browser-Kontext lief (Admin-Auswertung) - kommen sie aber ueber
  // /api/report/today per JSON vom Server, wurden sie zu ISO-Strings
  // serialisiert. new Date(...) macht beides gleich behandelbar.
  return new Date(date).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

// Rendert zwei kompakte Saeulen-Charts (Bons, Umsatz) statt eines
// Dual-Achsen-Charts, da beide Groessen unterschiedliche Skalen haben.
function intervalChartTemplate(buckets, currency = "EUR") {
  if (!buckets.length) {
    return `<p class="hint">Noch keine Buchungen fuer ein Zeitfenster-Diagramm.</p>`;
  }

  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const maxRevenue = Math.max(1, ...buckets.map((bucket) => bucket.revenue));

  // Achsenbeschriftung nur an jedem zweiten Balken (= volle Stunde bei
  // 30-Minuten-Fenstern), sonst wird es bei vielen Balken zu voll - und nur
  // die Stundenzahl, keine vollen Uhrzeiten.
  const tickLabel = (bucket, index) => (index % 2 === 0
    ? String(new Date(bucket.start).getHours()).padStart(2, "0")
    : "");

  const bars = (valueKey, max, formatValue) => buckets.map((bucket, index) => {
    const value = bucket[valueKey];
    const heightPercent = Math.round((value / max) * 100);
    const isPeak = value === max && value > 0;
    const title = `${intervalTimeLabel(bucket.start)}–${intervalTimeLabel(bucket.end)}: ${formatValue(value)}`;
    const tick = tickLabel(bucket, index);
    return `
      <div class="interval-bar-slot" title="${escapeHtml(title)}">
        <div class="interval-bar${isPeak ? " interval-bar-is-peak" : ""}" style="--bar-height: ${heightPercent}%">
          <span class="interval-bar-value">${escapeHtml(formatValue(value))}</span>
        </div>
        ${tick ? `<span class="interval-bar-tick">${escapeHtml(tick)}</span>` : ""}
      </div>
    `;
  }).join("");

  return `
    <div class="interval-chart-group">
      <div class="interval-chart">
        <div class="interval-chart-title">Bons je 30&nbsp;Min.</div>
        <div class="interval-bar-row">${bars("count", maxCount, (value) => String(value))}</div>
      </div>
      <div class="interval-chart">
        <div class="interval-chart-title">Umsatz je 30&nbsp;Min.</div>
        <div class="interval-bar-row">${bars("revenue", maxRevenue, (value) => moneyText(value, currency))}</div>
      </div>
    </div>
  `;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    escapeHtml,
    logoSrc,
    moneyText,
    BUSINESS_DAY_START_HOUR,
    businessDayKey,
    businessDayEnd,
    businessDayLabel,
    filterPaidOrdersForBusinessDay,
    attachStock,
    totalsByMode,
    buildReportData,
    buildIntervalBuckets,
    intervalTimeLabel,
    intervalChartTemplate,
    reportTableTemplate
  };
}
