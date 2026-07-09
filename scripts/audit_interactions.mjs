#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_VIEWPORTS = [{ key: "desktop", width: 1920, height: 1080 }];
const DEFAULT_THEMES = ["dark"];
const SEVERITY_RANK = { P1: 1, P2: 2, P3: 3 };

function usage() {
  return `Usage:
  node audit_interactions.mjs --base-url http://127.0.0.1:5059 --cookie "<session>" --route pantalla=/ruta-a-auditar --click-text "ESTADO A,ESTADO B"

Options:
  --base-url <url>            Required base URL.
  --cookie <value>            Optional Flask session cookie value.
  --cookie-file <path>        Optional file containing cookie value.
  --route <key=path>          Route to audit. Can repeat.
  --routes <json>             JSON route list: [{"key":"name","path":"/url"}]
  --click-text <list>         Comma-separated visible text to click. If omitted, auto-clicks tab/filter-like controls.
  --max-clicks <n>            Max auto-click targets per route when --click-text is omitted. Default: 16
  --viewports <spec>          Example: desktop=1920x1080,mobile=390x844
  --themes <list>             Example: dark,light
  --out <dir>                 Output dir. Default: instance/validation/ui-interactions
  --fail-on <P1|P2|P3|none>   Exit non-zero for findings at or above severity. Default: P1
  --chrome-executable <path>  Optional Chrome executable path.
  --no-screenshots            Skip screenshots.
  --help                      Show this help.
`;
}

function parseArgs(argv) {
  const args = {
    routes: [],
    viewports: DEFAULT_VIEWPORTS,
    themes: DEFAULT_THEMES,
    out: "instance/validation/ui-interactions",
    failOn: "P1",
    screenshots: true,
    maxClicks: 16,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--base-url") args.baseUrl = argv[++i];
    else if (arg === "--cookie") args.cookie = argv[++i];
    else if (arg === "--cookie-file") args.cookieFile = argv[++i];
    else if (arg === "--route") args.routes.push(parseRouteSpec(argv[++i], `route-${args.routes.length + 1}`));
    else if (arg === "--routes") args.routesFile = argv[++i];
    else if (arg === "--click-text") args.clickText = argv[++i].split(",").map((x) => x.trim()).filter(Boolean);
    else if (arg === "--max-clicks") args.maxClicks = Number(argv[++i]);
    else if (arg === "--viewports") args.viewports = parseViewports(argv[++i]);
    else if (arg === "--themes") args.themes = argv[++i].split(",").map((x) => x.trim()).filter(Boolean);
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--fail-on") args.failOn = argv[++i];
    else if (arg === "--chrome-executable") args.chromeExecutable = argv[++i];
    else if (arg === "--no-screenshots") args.screenshots = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!["P1", "P2", "P3", "none"].includes(args.failOn)) {
    throw new Error("--fail-on must be P1, P2, P3, or none");
  }
  if (!Number.isInteger(args.maxClicks) || args.maxClicks < 1) {
    throw new Error("--max-clicks must be a positive integer");
  }
  return args;
}

function parseRouteSpec(spec, fallbackKey) {
  const raw = String(spec || "").trim();
  const eq = raw.indexOf("=");
  if (eq === -1) return { key: fallbackKey, path: raw.startsWith("/") ? raw : `/${raw}` };
  const key = raw.slice(0, eq).trim();
  const routePath = raw.slice(eq + 1).trim();
  if (!key || !routePath) throw new Error(`Invalid route spec: ${spec}`);
  return { key, path: routePath.startsWith("/") ? routePath : `/${routePath}` };
}

function parseViewports(spec) {
  return spec.split(",").map((item) => {
    const [key, size] = item.split("=");
    const [width, height] = String(size || "").split("x").map((x) => Number(x));
    if (!key || !Number.isFinite(width) || !Number.isFinite(height)) throw new Error(`Invalid viewport spec: ${item}`);
    return { key, width, height };
  });
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function loadRoutes(args) {
  let routes = [];
  if (args.routesFile) {
    routes = JSON.parse(await fs.readFile(args.routesFile, "utf8"));
    if (!Array.isArray(routes)) throw new Error("--routes must be a JSON array");
  }
  routes = [...routes, ...args.routes];
  if (!routes.length) throw new Error("At least one --route or --routes entry is required.");
  for (const route of routes) {
    if (!route || typeof route.key !== "string" || typeof route.path !== "string") {
      throw new Error("Each route must have string key and path");
    }
  }
  return routes;
}

async function loadCookie(args) {
  if (args.cookie) return args.cookie.trim();
  if (args.cookieFile) return (await fs.readFile(args.cookieFile, "utf8")).trim();
  return "";
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (err) {
    throw new Error(`Playwright is required for interaction audit. Original error: ${err.message || err}`);
  }
}

function buildUrl(baseUrl, routePath) {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;
}

function finding(severity, code, message, details = {}) {
  return { severity, code, message, details };
}

function recordKey(record) {
  return `${record.route.key}/${record.viewport.key}/${record.theme}/${record.state}`;
}

function evaluateSnapshot(payload) {
  const { route, viewport, theme, state } = payload;
  const visible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
  };
  const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
  const cls = (el) => String(el?.getAttribute?.("class") || "");
  const all = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left * 100) / 100,
      top: Math.round(r.top * 100) / 100,
      right: Math.round(r.right * 100) / 100,
      bottom: Math.round(r.bottom * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
    };
  };
  const groupRows = (items, tolerance = 7) => {
    const rows = [];
    for (const item of [...items].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)) {
      const center = item.rect.top + item.rect.height / 2;
      let row = rows.find((candidate) => Math.abs(candidate.center - center) <= tolerance);
      if (!row) {
        row = { center, items: [] };
        rows.push(row);
      }
      row.items.push(item);
      row.center = row.items.reduce((sum, x) => sum + x.rect.top + x.rect.height / 2, 0) / row.items.length;
    }
    return rows.map((row, index) => ({ index, center: row.center, items: row.items.sort((a, b) => a.rect.left - b.rect.left) }));
  };
  const range = (values) => {
    const nums = values.filter((x) => Number.isFinite(x));
    if (!nums.length) return 0;
    return Math.round((Math.max(...nums) - Math.min(...nums)) * 100) / 100;
  };
  const buttons = all("button, .btn, .cf-btn, a[role='button'], [data-filter], [data-tab]")
    .filter((el) => !el.closest(".modal, dialog, [role='dialog']"))
    .map((el, index) => ({ index, text: text(el), className: cls(el), tag: el.tagName.toLowerCase(), rect: rect(el) }))
    .filter((item) => item.text || /tab|filter|segmented|estado|status/i.test(item.className));
  const rows = groupRows(buttons);
  const tabRows = rows.filter((row) => {
    if (row.items.length < 2) return false;
    const classHit = row.items.some((item) => /tab|filter|segmented|estado|status|active|selected/i.test(item.className));
    const textHit = row.items.filter((item) => item.text).length >= 2 &&
      row.items.every((item) => !item.text || (item.text.length <= 22 && item.text === item.text.toUpperCase()));
    return classHit || textHit;
  });
  const tables = all("table").map((table, index) => ({
    index,
    rect: rect(table),
    rows: table.rows?.length || 0,
    columns: table.rows?.[0]?.cells?.length || 0,
    scrollableAncestor: (() => {
      for (let cur = table.parentElement; cur && cur !== document.body; cur = cur.parentElement) {
        const cs = getComputedStyle(cur);
        if (/(auto|scroll)/.test(cs.overflowX) || /(auto|scroll)/.test(cs.overflowY)) {
          return { className: cls(cur), rect: rect(cur), overflowX: cs.overflowX, overflowY: cs.overflowY, scrollWidth: cur.scrollWidth, clientWidth: cur.clientWidth };
        }
      }
      return null;
    })(),
  }));
  const root = document.documentElement;
  const filterArea = tabRows[0] ? {
    top: Math.min(...tabRows[0].items.map((item) => item.rect.top)),
    left: Math.min(...tabRows[0].items.map((item) => item.rect.left)),
    right: Math.max(...tabRows[0].items.map((item) => item.rect.right)),
    bottom: Math.max(...tabRows[0].items.map((item) => item.rect.bottom)),
    width: Math.max(...tabRows[0].items.map((item) => item.rect.right)) - Math.min(...tabRows[0].items.map((item) => item.rect.left)),
    height: Math.max(...tabRows[0].items.map((item) => item.rect.bottom)) - Math.min(...tabRows[0].items.map((item) => item.rect.top)),
  } : null;
  const findings = [];
  for (const row of tabRows) {
    const widthRange = range(row.items.map((item) => item.rect.width));
    const heightRange = range(row.items.map((item) => item.rect.height));
    if (widthRange > 2) {
      findings.push(finding("P1", "tab-peer-width-drift", "Tab/filter peers do not share static widths", {
        row: row.index,
        widthRange,
        items: row.items.map((item) => ({ text: item.text, className: item.className, rect: item.rect })),
      }));
    }
    if (heightRange > 2) {
      findings.push(finding("P1", "tab-peer-height-drift", "Tab/filter peers do not share static heights", {
        row: row.index,
        heightRange,
        items: row.items.map((item) => ({ text: item.text, rect: item.rect })),
      }));
    }
  }
  if (root.scrollWidth > root.clientWidth + 1) {
    findings.push(finding("P1", "state-horizontal-overflow", "State has global horizontal overflow", {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
    }));
  }
  return {
    route,
    viewport,
    theme,
    state,
    url: location.href,
    status: { redirectedToLogin: location.pathname.includes("login") },
    scroll: {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
    },
    filterArea,
    tabRows,
    tables,
    findings,
    controls: buttons.slice(0, 80),
  };
}

async function discoverClickTargets(page, requested, maxClicks) {
  return await page.evaluate(({ requestedTexts, limit }) => {
    const visible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
    };
    const text = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const groupRows = (items, tolerance = 7) => {
      const rows = [];
      for (const item of [...items].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)) {
        const center = item.rect.top + item.rect.height / 2;
        let row = rows.find((candidate) => Math.abs(candidate.center - center) <= tolerance);
        if (!row) {
          row = { center, items: [] };
          rows.push(row);
        }
        row.items.push(item);
        row.center = row.items.reduce((sum, x) => sum + x.rect.top + x.rect.height / 2, 0) / row.items.length;
      }
      return rows;
    };
    const unsafeAction = (value) => /cerrar|eliminar|borrar|guardar|crear|confirmar|pagar|enviar|cancelar|actualizar|nuevo|registrar|delete|remove|save|create|confirm|pay|send|cancel|update|new/i.test(value);
    const elements = Array.from(document.querySelectorAll("button, .btn, .cf-btn, a[role='button'], [role='tab'], [aria-pressed], [data-filter], [data-tab]"))
      .filter(visible)
      .filter((el) => !el.closest(".modal, dialog, [role='dialog']"));
    elements.forEach((el, index) => el.setAttribute("data-mm-interaction-target", String(index)));
    const candidates = elements
      .map((el, index) => ({
        index,
        text: text(el),
        className: String(el.getAttribute("class") || ""),
        role: String(el.getAttribute("role") || ""),
        hasDataMarker: el.hasAttribute("data-filter") || el.hasAttribute("data-tab"),
        ariaPressed: el.hasAttribute("aria-pressed"),
        rect: rect(el),
        selector: `[data-mm-interaction-target="${index}"]`,
      }))
      .filter((item) => item.text);
    if (requestedTexts?.length) {
      return candidates.filter((item) => requestedTexts.some((needle) => item.text.toLowerCase().includes(needle.toLowerCase())));
    }
    const rows = groupRows(candidates).filter((row) => row.items.length >= 2);
    const peerIndexes = new Set();
    for (const row of rows) {
      const safeUppercasePeers = row.items.filter((item) => (
        item.text.length <= 22 &&
        item.text === item.text.toUpperCase() &&
        !unsafeAction(item.text)
      ));
      if (safeUppercasePeers.length >= 2) {
        for (const item of safeUppercasePeers) peerIndexes.add(item.index);
      }
    }
    return candidates.filter((item) => {
      if (unsafeAction(item.text)) return false;
      const classHit = /tab|filter|segmented|estado|status|active|selected/i.test(item.className);
      const semanticHit = item.role === "tab" || item.hasDataMarker || item.ariaPressed;
      const textHit = peerIndexes.has(item.index);
      return classHit || semanticHit || textHit;
    }).slice(0, limit);
  }, { requestedTexts: requested || [], limit: maxClicks });
}

function rowBounds(row) {
  const items = row?.items || [];
  if (!items.length) return null;
  const left = Math.min(...items.map((item) => item.rect.left));
  const top = Math.min(...items.map((item) => item.rect.top));
  const right = Math.max(...items.map((item) => item.rect.right));
  const bottom = Math.max(...items.map((item) => item.rect.bottom));
  return {
    left: Math.round(left * 100) / 100,
    top: Math.round(top * 100) / 100,
    right: Math.round(right * 100) / 100,
    bottom: Math.round(bottom * 100) / 100,
    width: Math.round((right - left) * 100) / 100,
    height: Math.round((bottom - top) * 100) / 100,
  };
}

function rectDelta(before, after) {
  if (!before || !after) return null;
  return {
    left: Math.round(Math.abs(after.left - before.left) * 100) / 100,
    top: Math.round(Math.abs(after.top - before.top) * 100) / 100,
    width: Math.round(Math.abs(after.width - before.width) * 100) / 100,
    height: Math.round(Math.abs(after.height - before.height) * 100) / 100,
  };
}

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function matchingItem(beforeRow, afterRow, beforeItem, itemIndex) {
  const label = normalizedText(beforeItem.text);
  if (label) {
    const duplicateIndex = beforeRow.items
      .slice(0, itemIndex)
      .filter((item) => normalizedText(item.text) === label)
      .length;
    const matches = afterRow.items.filter((item) => normalizedText(item.text) === label);
    if (matches[duplicateIndex]) return matches[duplicateIndex];
  }
  return afterRow.items[itemIndex] || null;
}

function compareSnapshots(before, after, target) {
  const findings = [];
  const filterDelta = before.filterArea && after.filterArea ? {
    left: Math.round(Math.abs(after.filterArea.left - before.filterArea.left) * 100) / 100,
    top: Math.round(Math.abs(after.filterArea.top - before.filterArea.top) * 100) / 100,
    width: Math.round(Math.abs(after.filterArea.width - before.filterArea.width) * 100) / 100,
    height: Math.round(Math.abs(after.filterArea.height - before.filterArea.height) * 100) / 100,
  } : null;
  if (filterDelta && (filterDelta.left > 2 || filterDelta.top > 2 || filterDelta.width > 2 || filterDelta.height > 2)) {
    findings.push(finding("P1", "interaction-control-rail-shift", "Clicking a state control changes the control rail dimensions or position", {
      target,
      delta: filterDelta,
      before: before.filterArea,
      after: after.filterArea,
      suggestion: "Use fixed-width/equal-width segmented controls and keep active/inactive padding and borders identical.",
    }));
  }
  const beforeRows = before.tabRows || [];
  const afterRows = after.tabRows || [];
  for (const beforeRow of beforeRows) {
    const afterRow = afterRows.find((row) => row.index === beforeRow.index);
    if (!afterRow) {
      findings.push(finding("P1", "interaction-control-row-disappears", "Clicking a state control changes the control row structure", {
        target,
        row: beforeRow.index,
        before: rowBounds(beforeRow),
        suggestion: "State controls must stay in the same container and keep the same structural role after click.",
      }));
      continue;
    }
    const beforeBounds = rowBounds(beforeRow);
    const afterBounds = rowBounds(afterRow);
    const rowDelta = rectDelta(beforeBounds, afterBounds);
    if (rowDelta && (rowDelta.left > 2 || rowDelta.top > 2 || rowDelta.width > 2 || rowDelta.height > 2)) {
      findings.push(finding("P1", "interaction-control-row-shift", "Clicking a state control moves or resizes the whole control row", {
        target,
        row: beforeRow.index,
        delta: rowDelta,
        before: beforeBounds,
        after: afterBounds,
        suggestion: "Keep the control row on a fixed grid. Active state may change color/emphasis, but not width, height, padding, border size, or row position.",
      }));
    }
    const moved = [];
    const resized = [];
    beforeRow.items.forEach((beforeItem, itemIndex) => {
      const afterItem = matchingItem(beforeRow, afterRow, beforeItem, itemIndex);
      if (!afterItem) return;
      const itemDelta = rectDelta(beforeItem.rect, afterItem.rect);
      if (!itemDelta) return;
      const sample = { text: beforeItem.text, before: beforeItem.rect, after: afterItem.rect, delta: itemDelta };
      if (itemDelta.left > 2 || itemDelta.top > 2) moved.push(sample);
      if (itemDelta.width > 2 || itemDelta.height > 2) resized.push(sample);
    });
    if (moved.length) {
      findings.push(finding("P1", "interaction-peer-control-move", "Clicking a state control moves peer controls in the same row", {
        target,
        row: beforeRow.index,
        samples: moved.slice(0, 8),
        suggestion: "State changes must be static. Only color/icon emphasis should change; neighboring controls should keep the same x/y rails.",
      }));
    }
    if (resized.length) {
      findings.push(finding("P1", "interaction-peer-control-resize", "Clicking a state control resizes peer controls in the same row", {
        target,
        row: beforeRow.index,
        samples: resized.slice(0, 8),
        suggestion: "Make selected/unselected controls share identical box metrics and handle long explanations with a tooltip or hidden accessible label.",
      }));
    }
  }
  if (after.scroll.scrollWidth > after.scroll.clientWidth + 1 && after.scroll.scrollWidth > before.scroll.scrollWidth + 1) {
    findings.push(finding("P1", "interaction-introduces-overflow", "Clicking this state introduces or worsens global horizontal overflow", {
      target,
      before: before.scroll,
      after: after.scroll,
      suggestion: "Check oversized controls, long labels, counters, and unnecessary columns in this state.",
    }));
  }
  const beforeTables = before.tables || [];
  const afterTables = after.tables || [];
  for (const table of afterTables) {
    const beforeTable = beforeTables.find((candidate) => candidate.index === table.index);
    if (!beforeTable) continue;
    const ancestor = table.scrollableAncestor;
    const beforeAncestor = beforeTable.scrollableAncestor;
    if (ancestor && ancestor.scrollWidth > ancestor.clientWidth + 8) {
      findings.push(finding("P2", "interaction-table-horizontal-scroll", "Clicked state has table/grid horizontal scroll that must be justified", {
        target,
        tableIndex: table.index,
        columns: table.columns,
        before: beforeAncestor,
        after: ancestor,
        suggestion: table.rect.width < after.scroll.clientWidth * 0.72
          ? "Grid is inside a narrow column; consider making the grid span the full row and moving summary panels below or to a separate row."
          : "Remove redundant columns, compact short-value columns, or reduce oversized controls before accepting horizontal scroll.",
      }));
    }
  }
  return findings;
}

function buildSummary(records) {
  const findings = records.flatMap((record) => (record.findings || []).map((item) => ({ ...item, record: recordKey(record) })));
  const bySeverity = { P1: 0, P2: 0, P3: 0 };
  for (const item of findings) bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
  return { generatedAt: new Date().toISOString(), records: records.length, bySeverity, totalFindings: findings.length, findings };
}

function markdownReport(summary, records) {
  const lines = ["# Motomania UI Interaction Audit", "", `Generated: ${summary.generatedAt}`, `Findings: P1=${summary.bySeverity.P1 || 0}, P2=${summary.bySeverity.P2 || 0}, P3=${summary.bySeverity.P3 || 0}`, ""];
  for (const record of records) {
    lines.push(`## ${recordKey(record)}`, "");
    if (record.target) lines.push(`- Click target: ${record.target.text}`);
    if (record.screenshot) lines.push(`- Screenshot: ${record.screenshot}`);
    if (!record.findings?.length) lines.push("- Findings: none");
    for (const item of record.findings || []) {
      lines.push(`- ${item.severity} ${item.code}: ${item.message}`);
      if (item.details?.suggestion) lines.push(`  Suggestion: ${item.details.suggestion}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.baseUrl) throw new Error("--base-url is required");
  const routes = await loadRoutes(args);
  const cookie = await loadCookie(args);
  const outDir = path.resolve(args.out);
  await fs.mkdir(outDir, { recursive: true });
  const { chromium } = await loadPlaywright();
  const launchOptions = { headless: true };
  if (args.chromeExecutable) launchOptions.executablePath = args.chromeExecutable;
  const browser = await chromium.launch(launchOptions);
  const records = [];

  try {
    for (const viewport of args.viewports) {
      for (const theme of args.themes) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
        if (cookie) await context.addCookies([{ name: "session", value: cookie, url: args.baseUrl, httpOnly: true, sameSite: "Lax" }]);
        await context.addInitScript((themeName) => {
          try { localStorage.setItem("mm-theme", themeName); } catch (_) {}
          if (themeName === "light") document.documentElement.setAttribute("data-theme", "light");
          else document.documentElement.removeAttribute("data-theme");
        }, theme);

        for (const route of routes) {
          const page = await context.newPage();
          try {
            await page.goto(buildUrl(args.baseUrl, route.path), { waitUntil: "domcontentloaded", timeout: 45000 });
            await page.waitForTimeout(700);
            const baseline = await page.evaluate(evaluateSnapshot, { route, viewport, theme, state: "baseline" });
            if (args.screenshots) {
              baseline.screenshot = path.join(outDir, `${safeName(route.key)}-${safeName(viewport.key)}-${safeName(theme)}-baseline.png`);
              await page.screenshot({ path: baseline.screenshot, fullPage: true });
            }
            records.push(baseline);
            const targets = await discoverClickTargets(page, args.clickText, args.maxClicks);
            for (const target of targets) {
              await page.goto(buildUrl(args.baseUrl, route.path), { waitUntil: "domcontentloaded", timeout: 45000 });
              await page.waitForTimeout(500);
              await discoverClickTargets(page, args.clickText, args.maxClicks);
              const before = await page.evaluate(evaluateSnapshot, { route, viewport, theme, state: `before-${target.text}` });
              const handle = await page.$(`[data-mm-interaction-target="${target.index}"]`);
              if (!handle) continue;
              await handle.click({ timeout: 5000 });
              await page.waitForTimeout(750);
              const after = await page.evaluate(evaluateSnapshot, { route, viewport, theme, state: `after-${target.text}` });
              after.target = target;
              after.findings = [...(after.findings || []), ...compareSnapshots(before, after, target)];
              if (args.screenshots) {
                after.screenshot = path.join(outDir, `${safeName(route.key)}-${safeName(viewport.key)}-${safeName(theme)}-${safeName(target.text)}.png`);
                await page.screenshot({ path: after.screenshot, fullPage: true });
              }
              records.push(after);
            }
          } catch (err) {
            records.push({ route, viewport, theme, state: "error", error: String(err.message || err), findings: [finding("P1", "interaction-audit-error", String(err.message || err))] });
          } finally {
            await page.close();
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const summary = buildSummary(records);
  await fs.writeFile(path.join(outDir, "interaction-audit.json"), JSON.stringify(records, null, 2), "utf8");
  await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  await fs.writeFile(path.join(outDir, "summary.md"), markdownReport(summary, records), "utf8");
  console.log(JSON.stringify({ outDir, records: summary.records, findings: summary.bySeverity, totalFindings: summary.totalFindings, summary: path.join(outDir, "summary.md") }, null, 2));

  if (args.failOn !== "none") {
    const rank = SEVERITY_RANK[args.failOn];
    if (summary.findings.some((item) => SEVERITY_RANK[item.severity] <= rank)) process.exit(2);
  }
}

main().catch((err) => {
  console.error(`[audit_interactions] ${err.message || err}`);
  process.exit(1);
});
