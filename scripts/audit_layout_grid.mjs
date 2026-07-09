#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_VIEWPORTS = [
  { key: "desktop", width: 1920, height: 1080 },
  { key: "mobile", width: 390, height: 844 },
];

const DEFAULT_THEMES = ["dark", "light"];

const DEFAULT_ROUTES = [];

const SEVERITY_RANK = { P1: 1, P2: 2, P3: 3 };

function usage() {
  return `Usage:
  node audit_layout_grid.mjs --base-url http://127.0.0.1:5059 --cookie "<session>" --route pantalla=/ruta-a-auditar --out instance/validation/ui-grid

Options:
  --base-url <url>            Required base URL.
  --cookie <value>            Optional Flask session cookie value.
  --cookie-file <path>        Optional file containing cookie value.
  --compare <path|key=path>   Optional one-run comparison route.
  --route <key=path>          Route to audit. Can be repeated.
  --routes <json>             JSON route list: [{"key":"name","path":"/url"}]
  --viewports <spec>          Example: desktop=1920x1080,mobile=390x844
  --themes <list>             Example: dark,light
  --out <dir>                 Output dir. Default: instance/validation/ui-grid
  --tolerance <px>            Comparison tolerance. Default: 4
  --fail-on <P1|P2|P3|none>   Exit non-zero for findings at or above severity. Default: P1
  --chrome-executable <path>  Optional Chrome executable path.
  --no-screenshots            Skip clean and grid screenshots.
  --no-html                   Skip HTML report.
  --help                      Show this help.
`;
}

function parseArgs(argv) {
  const args = {
    out: "instance/validation/ui-grid",
    routes: [],
    viewports: DEFAULT_VIEWPORTS,
    themes: DEFAULT_THEMES,
    reference: null,
    tolerance: 4,
    screenshots: true,
    html: true,
    failOn: "P1",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--cookie") args.cookie = argv[++i];
    else if (a === "--cookie-file") args.cookieFile = argv[++i];
    else if (a === "--compare") args.reference = parseRouteSpec(argv[++i], "comparison");
    else if (a === "--route") args.routes.push(parseRouteSpec(argv[++i], `route-${args.routes.length + 1}`));
    else if (a === "--routes") args.routesFile = argv[++i];
    else if (a === "--viewports") args.viewports = parseViewports(argv[++i]);
    else if (a === "--themes") args.themes = argv[++i].split(",").map((x) => x.trim()).filter(Boolean);
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--tolerance") args.tolerance = Number(argv[++i]);
    else if (a === "--fail-on") args.failOn = argv[++i];
    else if (a === "--chrome-executable") args.chromeExecutable = argv[++i];
    else if (a === "--no-screenshots") args.screenshots = false;
    else if (a === "--no-html") args.html = false;
    else throw new Error(`Unknown argument: ${a}`);
  }

  if (!Number.isFinite(args.tolerance) || args.tolerance < 0) {
    throw new Error("--tolerance must be a positive number");
  }
  if (!["P1", "P2", "P3", "none"].includes(args.failOn)) {
    throw new Error("--fail-on must be P1, P2, P3, or none");
  }
  return args;
}

function parseRouteSpec(spec, fallbackKey) {
  const raw = String(spec || "").trim();
  if (!raw) throw new Error("Route spec cannot be empty");
  const eq = raw.indexOf("=");
  if (eq === -1) {
    return { key: fallbackKey, path: raw.startsWith("/") ? raw : `/${raw}` };
  }
  const key = raw.slice(0, eq).trim();
  const routePath = raw.slice(eq + 1).trim();
  if (!key || !routePath) throw new Error(`Invalid route spec: ${spec}`);
  return { key, path: routePath.startsWith("/") ? routePath : `/${routePath}` };
}

function parseViewports(spec) {
  return spec.split(",").map((item) => {
    const [key, size] = item.split("=");
    const [width, height] = String(size || "").split("x").map((x) => Number(x));
    if (!key || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error(`Invalid viewport spec: ${item}`);
    }
    return { key, width, height };
  });
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
}

async function loadRoutes(args) {
  let routes = [];
  if (args.routesFile) {
    const raw = await fs.readFile(args.routesFile, "utf8");
    routes = JSON.parse(raw);
    if (!Array.isArray(routes)) throw new Error("--routes must be a JSON array");
  }
  routes = [...routes, ...args.routes];
  if (!routes.length) routes = DEFAULT_ROUTES;
  for (const route of routes) {
    if (!route || typeof route.key !== "string" || typeof route.path !== "string") {
      throw new Error("Each route must have string key and path");
    }
  }
  if (!routes.length) {
    throw new Error("At least one --route or --routes entry is required.");
  }
  if (!args.reference) return routes;
  const withoutReference = routes.filter((route) => !(route.key === args.reference.key && route.path === args.reference.path));
  return [args.reference, ...withoutReference];
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
    throw new Error(
      "Playwright is required for DOM measurement. Use direct browser/CDP checks if it is unavailable. " +
      `Original error: ${err.message || err}`
    );
  }
}

function buildUrl(baseUrl, routePath) {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;
}

function finding(severity, code, message, details = {}) {
  return { severity, code, message, details };
}

function delta(a, b) {
  if (a == null || b == null) return null;
  return Math.round(Math.abs(Number(a) - Number(b)) * 100) / 100;
}

function addReferenceFinding(findings, severity, code, message, details) {
  findings.push(finding(severity, code, message, details));
}

function compareMetric(findings, current, reference, pathKey, label, tolerance, severity = "P1") {
  const cur = pathKey.split(".").reduce((obj, key) => obj?.[key], current);
  const ref = pathKey.split(".").reduce((obj, key) => obj?.[key], reference);
  const d = delta(cur, ref);
  if (d != null && d > tolerance) {
    addReferenceFinding(findings, severity, `${pathKey}-drift`, `${label} drifts ${d}px from comparison route`, {
      current: cur,
      comparison: ref,
      delta: d,
      tolerance,
    });
  }
}

function compareStyle(findings, current, reference, pathKey, label, severity = "P2") {
  const cur = pathKey.split(".").reduce((obj, key) => obj?.[key], current);
  const ref = pathKey.split(".").reduce((obj, key) => obj?.[key], reference);
  if (cur && ref && cur !== ref) {
    addReferenceFinding(findings, severity, `${pathKey}-style-drift`, `${label} differs from comparison route`, {
      current: cur,
      comparison: ref,
    });
  }
}

function compareToReference(current, reference, tolerance) {
  const findings = [];
  if (!current?.metrics || !reference?.metrics) return findings;
  if (current.route.key === reference.route.key && current.route.path === reference.route.path) return findings;

  compareMetric(findings, current, reference, "metrics.header.height", "Header height", 1, "P1");
  compareMetric(findings, current, reference, "metrics.main.left", "Main left origin", tolerance, "P1");
  compareMetric(findings, current, reference, "metrics.title.left", "Title left origin", tolerance, "P1");
  compareMetric(findings, current, reference, "metrics.title.top", "Title top origin", tolerance + 4, "P2");
  compareMetric(findings, current, reference, "metrics.sidebar.width", "Sidebar width", 2, "P1");
  compareMetric(findings, current, reference, "metrics.firstCardRow.top", "First card row top", tolerance + 4, "P2");
  compareMetric(findings, current, reference, "metrics.firstCardRow.height", "First card row height", 4, "P2");

  compareStyle(findings, current, reference, "metrics.sidebar.backgroundColor", "Sidebar background", "P1");
  compareStyle(findings, current, reference, "metrics.title.fontFamily", "Title font family", "P2");
  compareStyle(findings, current, reference, "metrics.title.fontSize", "Title font size", "P2");
  compareStyle(findings, current, reference, "metrics.firstCard.backgroundColor", "Card surface", "P2");
  compareStyle(findings, current, reference, "metrics.firstCard.borderRadius", "Card radius", "P3");

  return findings;
}

function metricValue(record, pathKey) {
  return pathKey.split(".").reduce((obj, key) => obj?.[key], record);
}

function appendGroupConsistencyFindings(records, tolerance) {
  const groups = new Map();
  for (const record of records) {
    if (record.error || !record.metrics) continue;
    const key = `${record.viewport?.key || "viewport"}/${record.theme || "theme"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const checks = [
    { path: "metrics.header.height", label: "Header height", tolerance: 1, severity: "P1" },
    { path: "metrics.sidebar.width", label: "Sidebar width", tolerance: 2, severity: "P1" },
    { path: "metrics.main.left", label: "Main left origin", tolerance, severity: "P1" },
    { path: "metrics.title.left", label: "Title left origin", tolerance, severity: "P1" },
    { path: "metrics.title.top", label: "Title top origin", tolerance: tolerance + 4, severity: "P2" },
    { path: "metrics.firstCardRow.top", label: "First card row top", tolerance: tolerance + 4, severity: "P2" },
    { path: "metrics.firstCardRow.height", label: "First card row height", tolerance: 4, severity: "P2" },
    { path: "metrics.firstButtonRow.height", label: "First button row height", tolerance: 2, severity: "P2" },
  ];

  for (const [groupKey, groupRecords] of groups.entries()) {
    if (groupRecords.length < 2) continue;
    for (const check of checks) {
      const values = groupRecords
        .map((record) => ({ record, value: metricValue(record, check.path) }))
        .filter((item) => Number.isFinite(item.value));
      if (values.length < 2) continue;
      const min = Math.min(...values.map((item) => item.value));
      const max = Math.max(...values.map((item) => item.value));
      const d = Math.round((max - min) * 100) / 100;
      if (d <= check.tolerance) continue;
      const details = {
        group: groupKey,
        metric: check.path,
        delta: d,
        tolerance: check.tolerance,
        routes: values.map((item) => ({ key: item.record.route.key, path: item.record.route.path, value: item.value })),
      };
      for (const item of values.filter((candidate) => candidate.value === min || candidate.value === max)) {
        item.record.findings = item.record.findings || [];
        item.record.findings.push(finding(check.severity, "sibling-route-rail-drift", `${check.label} changes across sibling routes in the same audit run`, details));
      }
    }
  }
}

function evaluatePage(payload) {
  const { route, viewport, theme } = payload;

  const visible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
  };

  const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
  const className = (el) => String(el?.getAttribute?.("class") || "");
  const all = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);

  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x * 100) / 100,
      y: Math.round(r.y * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      top: Math.round(r.top * 100) / 100,
      right: Math.round(r.right * 100) / 100,
      bottom: Math.round(r.bottom * 100) / 100,
      left: Math.round(r.left * 100) / 100,
    };
  };

  const style = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      position: cs.position,
      width: cs.width,
      height: cs.height,
      minHeight: cs.minHeight,
      maxHeight: cs.maxHeight,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      borderRadius: cs.borderRadius,
      boxShadow: cs.boxShadow,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
    };
  };

  const groupRows = (items, tolerance = 6) => {
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
    return rows.map((row) => ({ ...row, items: row.items.sort((a, b) => a.rect.left - b.rect.left) }));
  };

  const range = (values) => {
    const nums = values.filter((value) => Number.isFinite(value));
    if (!nums.length) return 0;
    return Math.round((Math.max(...nums) - Math.min(...nums)) * 100) / 100;
  };

  const snapDrift = (value, step = 4) => {
    if (!Number.isFinite(value)) return 0;
    const nearest = Math.round(value / step) * step;
    return Math.round(Math.abs(value - nearest) * 100) / 100;
  };

  const numericCss = (value) => {
    const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  };

  const hasScrollableAncestor = (el, axis = "y") => {
    for (let cur = el?.parentElement; cur && cur !== document.body; cur = cur.parentElement) {
      const cs = getComputedStyle(cur);
      const overflow = axis === "y" ? cs.overflowY : cs.overflowX;
      const canScroll = /(auto|scroll)/.test(overflow);
      if (canScroll && (axis === "y" ? cur.scrollHeight > cur.clientHeight + 1 : cur.scrollWidth > cur.clientWidth + 1)) {
        return { className: className(cur), rect: rect(cur), overflow };
      }
    }
    return null;
  };

  const expectedControlMaxWidth = (el) => {
    const tag = el.tagName.toLowerCase();
    const type = String(el.getAttribute("type") || "").toLowerCase();
    const name = `${el.getAttribute("name") || ""} ${el.id || ""} ${className(el)} ${el.getAttribute("placeholder") || ""}`.toLowerCase();
    const label = text(el) || el.getAttribute("placeholder") || "";
    if (tag === "textarea") return 460;
    if (tag === "select") return label.length <= 18 || /estado|status|tipo|categoria|periodo/.test(name) ? 280 : 360;
    if (type === "date" || type === "month" || type === "time") return 220;
    if (type === "number" || /precio|price|monto|amount|total|neto|sueldo|comision|deduccion|cantidad|qty|porcentaje|percent/.test(name)) return 190;
    if (type === "search" || /buscar|search/.test(name)) return 520;
    if (label.length <= 24) return 320;
    return 420;
  };

  const isTabLikeRow = (row) => {
    if (row.items.length < 2) return false;
    const textItems = row.items.filter((item) => item.text);
    const classHit = row.items.some((item) => /tab|segment|segmented|pill|filter|estado|status/i.test(item.className));
    const activeHit = row.items.some((item) => /active|selected|is-active|current/i.test(item.className));
    const uppercaseHit = textItems.length >= 2 && textItems.every((item) => item.text.length <= 18 && item.text === item.text.toUpperCase());
    return classHit || activeHit || uppercaseHit;
  };

  const makeFinding = (severity, code, message, details = {}) => ({ severity, code, message, details });
  const findings = [];
  const root = document.documentElement;
  const header = document.querySelector(".top");
  const sidebars = all(".module-group-sidebar, .fin-sidebar, .sidebar, aside").filter((el) => !el.closest(".modal, dialog, [role='dialog']"));
  const sidebar = sidebars[0] || null;
  const main = document.querySelector(".admin-board-main") || document.querySelector("main") || document.querySelector(".content") || document.body;
  const title = document.querySelector(".admin-board-main h1, main h1, .page-title, h1");
  const cardSelector = ".cf-card, .card, .admin-kpi, .cf-kpi, .vr-card, [class*='card'], [class*='kpi']";
  const buttonSelector = "button, .cf-btn, .btn, a[role='button'], input[type='button'], input[type='submit']";
  const controlSelector = "button, .cf-btn, .btn, a[role='button'], input[type='button'], input[type='submit'], select, input:not([type='hidden']), textarea";
  const cards = all(cardSelector)
    .filter((el) => el.closest("body") && !el.matches(buttonSelector) && !el.closest(".modal, dialog, [role='dialog']"))
    .map((el, index) => ({ index, tag: el.tagName.toLowerCase(), className: className(el), text: text(el).slice(0, 80), rect: rect(el), style: style(el) }))
    .filter((item) => item.rect.width * item.rect.height >= 1200);
  const buttons = all(buttonSelector)
    .filter((el) => !el.closest(".modal, dialog, [role='dialog']"))
    .map((el, index) => ({ index, tag: el.tagName.toLowerCase(), className: className(el), text: text(el).slice(0, 80), rect: rect(el), style: style(el) }));
  const controlElements = all(controlSelector)
    .filter((el) => !el.closest(".modal, dialog, [role='dialog']"));
  const controls = controlElements
    .map((el, index) => ({ index, tag: el.tagName.toLowerCase(), className: className(el), text: text(el).slice(0, 80), rect: rect(el), style: style(el) }));

  if (root.scrollWidth > root.clientWidth + 1) {
    findings.push(makeFinding("P1", "horizontal-overflow", "The page has global horizontal overflow", {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
    }));
  }

  if (sidebars.length > 1) {
    findings.push(makeFinding("P1", "multiple-sidebars", "More than one visible sidebar exists", {
      count: sidebars.length,
      sidebars: sidebars.map((el) => ({ className: className(el), rect: rect(el) })).slice(0, 6),
    }));
  }

  if (sidebar && !/module-group-sidebar|sidebar/i.test(className(sidebar))) {
    findings.push(makeFinding("P2", "unrecognized-sidebar", "Visible sidebar does not use a known Motomania sidebar class", {
      className: className(sidebar),
      rect: rect(sidebar),
    }));
  }

  const buttonRows = groupRows(buttons, 7).filter((row) => row.items.length >= 2);
  for (const [rowIndex, row] of buttonRows.entries()) {
    const heightRange = range(row.items.map((item) => item.rect.height));
    const topRange = range(row.items.map((item) => item.rect.top));
    const widthRange = range(row.items.map((item) => item.rect.width));
    const readableItems = row.items.filter((item) => item.text && item.text.length > 1);
    const tabLike = isTabLikeRow(row);
    if (heightRange > 2) {
      findings.push(makeFinding("P1", "button-row-height-mismatch", "Buttons in the same row have different heights", {
        rowIndex,
        heightRange,
        items: row.items.map((item) => ({ text: item.text, className: item.className, rect: item.rect })),
      }));
    }
    if (topRange > 1.5) {
      findings.push(makeFinding("P2", "button-row-top-mismatch", "Buttons in the same row are not top-aligned", {
        rowIndex,
        topRange,
        items: row.items.map((item) => ({ text: item.text, rect: item.rect })),
      }));
    }
    if (row.items.length >= 3 && readableItems.length >= 3 && widthRange > 12) {
      findings.push(makeFinding("P2", "button-row-width-mismatch", "A button row mixes widths enough to feel inconsistent", {
        rowIndex,
        widthRange,
        items: row.items.map((item) => ({ text: item.text, className: item.className, rect: item.rect })),
      }));
    }
    if (tabLike && widthRange > 2) {
      findings.push(makeFinding("P1", "tab-row-width-drift", "Tab or segmented controls must keep static peer widths", {
        rowIndex,
        widthRange,
        items: row.items.map((item) => ({ text: item.text, className: item.className, rect: item.rect })),
      }));
    }
  }

  for (const item of buttons) {
    const lineHeight = numericCss(item.style.lineHeight || item.style.fontSize);
    const estimatedLines = lineHeight > 0 ? item.rect.height / lineHeight : 1;
    if (item.text.length > 18 && estimatedLines > 1.9) {
      findings.push(makeFinding("P2", "button-label-wrap", "Long button label appears to wrap; use a shorter label, icon, or tooltip", {
        text: item.text,
        className: item.className,
        rect: item.rect,
        estimatedLines: Math.round(estimatedLines * 100) / 100,
      }));
    }
  }

  const cardRows = groupRows(cards, 10).filter((row) => row.items.length >= 2);
  for (const [rowIndex, row] of cardRows.entries()) {
    const topRange = range(row.items.map((item) => item.rect.top));
    const heightRange = range(row.items.map((item) => item.rect.height));
    const gaps = [];
    for (let i = 1; i < row.items.length; i += 1) {
      gaps.push(Math.round((row.items[i].rect.left - row.items[i - 1].rect.right) * 100) / 100);
    }
    const gapRange = range(gaps);
    if (topRange > 2) {
      findings.push(makeFinding("P1", "card-row-top-mismatch", "Cards in the same row are not top-aligned", {
        rowIndex,
        topRange,
        items: row.items.map((item) => ({ text: item.text, className: item.className, rect: item.rect })),
      }));
    }
    if (heightRange > 3) {
      findings.push(makeFinding("P1", "card-row-height-mismatch", "Cards in the same row have different heights", {
        rowIndex,
        heightRange,
        items: row.items.map((item) => ({ text: item.text, className: item.className, rect: item.rect })),
      }));
    }
    if (gaps.length >= 2 && gapRange > 4) {
      findings.push(makeFinding("P2", "card-row-gap-mismatch", "Card gaps are not evenly spaced", {
        rowIndex,
        gapRange,
        gaps,
      }));
    }
  }

  for (const card of cards.slice(0, 40)) {
    const radius = numericCss(card.style.borderRadius);
    if (Number.isFinite(radius) && radius > 8) {
      findings.push(makeFinding("P2", "card-radius-drift", "Card/container radius exceeds the restrained hierarchy", {
        text: card.text,
        className: card.className,
        radius,
        rect: card.rect,
      }));
    }
    const tokens = card.text.split(/\s+/).filter(Boolean).length;
    const area = card.rect.width * card.rect.height;
    if (area > 36000 && tokens > 0 && tokens < 12 && !/modal|dialog/i.test(card.className)) {
      findings.push(makeFinding("P3", "card-dead-space", "Large card has little information and may be wasting space", {
        text: card.text,
        className: card.className,
        area: Math.round(area),
        tokens,
        rect: card.rect,
      }));
    }
  }

  for (const button of buttons) {
    const containingCard = cards.find((card) => {
      return button.rect.left >= card.rect.left &&
        button.rect.right <= card.rect.right &&
        button.rect.top >= card.rect.top &&
        button.rect.bottom <= card.rect.bottom;
    });
    if (!containingCard) continue;
    const relativeCenter = ((button.rect.top + button.rect.height / 2) - containingCard.rect.top) / containingCard.rect.height;
    if (relativeCenter > 0.34 && relativeCenter < 0.72 && containingCard.rect.height > 130) {
      findings.push(makeFinding("P3", "button-floating-inside-card", "Button appears in the middle of a card instead of a stable action rail", {
        button: { text: button.text, className: button.className, rect: button.rect },
        card: { text: containingCard.text, className: containingCard.className, rect: containingCard.rect },
        relativeCenter: Math.round(relativeCenter * 100) / 100,
      }));
    }
  }

  for (const el of controlElements) {
    const r = rect(el);
    if (!r) continue;
    const maxWidth = expectedControlMaxWidth(el);
    if (r.width > maxWidth + 16) {
      findings.push(makeFinding("P2", "oversized-control", "Control is wider than its realistic content needs", {
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || "",
        name: el.getAttribute("name") || "",
        placeholder: el.getAttribute("placeholder") || "",
        className: className(el),
        width: r.width,
        expectedMaxWidth: maxWidth,
        rect: r,
      }));
    }
  }

  const scrollContainers = all("main *, .content *, .admin-board-main *")
    .filter((el) => {
      if (el === document.body || el === root) return false;
      const r = rect(el);
      if (!r || r.width < 180 || r.height < 32) return false;
      return el.scrollWidth > el.clientWidth + 8;
    })
    .slice(0, 40);
  for (const el of scrollContainers) {
    const table = el.matches("table") ? el : el.querySelector("table");
    const firstRow = table?.rows?.[0] ? Array.from(table.rows[0].cells || []) : [];
    const inputCount = el.querySelectorAll("input, select, textarea").length;
    const overflow = Math.round((el.scrollWidth - el.clientWidth) * 100) / 100;
    const likelyAvoidable = inputCount > 0 || firstRow.length <= 8;
    const elRect = rect(el);
    const narrowGrid = !!table && elRect.width < root.clientWidth * 0.72;
    findings.push(makeFinding(likelyAvoidable ? "P2" : "P3", "internal-horizontal-scroll", "Container has horizontal scroll; verify it is real data density, not oversized controls or empty spacing", {
      tag: el.tagName.toLowerCase(),
      className: className(el),
      overflow,
      width: elRect.width,
      tableColumns: firstRow.length,
      inputCount,
      likelyAvoidable,
      rect: elRect,
      suggestion: narrowGrid
        ? "Grid is horizontally scrollable inside a narrow column. Prefer making the grid span the full row and moving secondary panels below or into a separate stacked column."
        : "First reduce oversized controls, long labels, dead columns, and empty spacing before accepting horizontal scroll.",
    }));
    if (narrowGrid) {
      findings.push(makeFinding("P1", "narrow-grid-causes-scroll", "A grid/table is horizontally scrollable while constrained to a narrow column", {
        tag: el.tagName.toLowerCase(),
        className: className(el),
        rect: elRect,
        viewportWidth: root.clientWidth,
        tableColumns: firstRow.length,
        overflow,
        suggestion: "Let the grid use the full available row, then place summary/side panels below or stacked. Do not force a wide operational grid into a cramped column.",
      }));
    }
  }

  const tables = all("table").map((table, index) => ({ table, index })).filter(({ table }) => rect(table).width > 120 && rect(table).height > 80);
  for (const { table, index } of tables) {
    const rows = Array.from(table.rows || []).filter(visible);
    const rowRects = rows.map(rect);
    const rowHeightRange = range(rowRects.slice(0, 12).map((r) => r.height));
    if (rowHeightRange > 8 && rows.length >= 4) {
      findings.push(makeFinding("P2", "table-row-height-drift", "Table row heights vary enough to hurt scanning", {
        tableIndex: index,
        rowHeightRange,
        rowHeights: rowRects.slice(0, 12).map((r) => r.height),
      }));
    }
    const columnStats = [];
    const maxColumns = Math.max(0, ...rows.slice(0, 12).map((row) => Array.from(row.cells || []).filter(visible).length));
    for (let col = 0; col < maxColumns; col += 1) {
      const cells = rows.slice(0, 12)
        .map((row) => Array.from(row.cells || []).filter(visible)[col])
        .filter((cell) => cell && Number(cell.colSpan || 1) === 1)
        .map(rect);
      if (cells.length < 3) continue;
      const leftRange = range(cells.map((r) => r.left));
      const widthRange = range(cells.map((r) => r.width));
      columnStats.push({ col, leftRange, widthRange });
      if (leftRange > 1.5 || widthRange > 2.5) {
        findings.push(makeFinding("P1", "table-column-misaligned", "A table/grid column does not stay on the same vertical rail", {
          tableIndex: index,
          column: col,
          leftRange,
          widthRange,
        }));
      }
    }
    if (rows.length > 12 && !hasScrollableAncestor(table, "y")) {
      findings.push(makeFinding("P2", "long-grid-without-internal-scroll", "Grid/list has more than 10 visible rows without an internal scroll owner", {
        tableIndex: index,
        rows: rows.length,
        rect: rect(table),
      }));
    }
  }

  const gradientElements = all("*").filter((el) => {
    if (!main.contains(el)) return false;
    const bg = getComputedStyle(el).backgroundImage;
    return bg && bg !== "none" && /gradient/i.test(bg);
  });
  if (gradientElements.length) {
    findings.push(makeFinding("P2", "local-gradient", "Operational UI contains local gradients", {
      count: gradientElements.length,
      samples: gradientElements.slice(0, 8).map((el) => ({ tag: el.tagName.toLowerCase(), className: className(el), text: text(el).slice(0, 60) })),
    }));
  }

  const baselineTargets = [
    { name: "main", item: rect(main) },
    { name: "title", item: rect(title) },
    ...cards.slice(0, 12).map((item, index) => ({ name: `card-${index}`, item: item.rect })),
    ...controls.slice(0, 20).map((item, index) => ({ name: `control-${index}`, item: item.rect })),
  ].filter((target) => target.item);
  const baselineDrifts = [];
  for (const target of baselineTargets) {
    for (const prop of ["top", "left", "height"]) {
      const drift = snapDrift(target.item[prop], 4);
      if (drift > 0.6) baselineDrifts.push({ name: target.name, prop, value: target.item[prop], drift });
    }
  }
  if (baselineDrifts.length) {
    findings.push(makeFinding("P3", "baseline-grid-drift", "Some key UI edges do not land on the 4px baseline grid", {
      count: baselineDrifts.length,
      samples: baselineDrifts.slice(0, 24),
    }));
  }

  const firstCardRow = cardRows[0] || null;
  const firstButtonRow = buttonRows[0] || null;
  const firstCard = cards[0] || null;

  return {
    route,
    viewport,
    theme,
    url: location.href,
    title: text(title),
    status: {
      redirectedToLogin: location.pathname.includes("login"),
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
    },
    scroll: {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
    },
    metrics: {
      header: rect(header),
      sidebar: {
        ...rect(sidebar),
        backgroundColor: sidebar ? getComputedStyle(sidebar).backgroundColor : null,
        className: sidebar ? className(sidebar) : "",
      },
      main: rect(main),
      title: {
        ...rect(title),
        fontFamily: title ? getComputedStyle(title).fontFamily : null,
        fontSize: title ? getComputedStyle(title).fontSize : null,
        lineHeight: title ? getComputedStyle(title).lineHeight : null,
      },
      firstCard: firstCard ? {
        ...firstCard.rect,
        backgroundColor: firstCard.style.backgroundColor,
        borderRadius: firstCard.style.borderRadius,
        boxShadow: firstCard.style.boxShadow,
        className: firstCard.className,
      } : null,
      firstCardRow: firstCardRow ? {
        top: Math.round(Math.min(...firstCardRow.items.map((item) => item.rect.top)) * 100) / 100,
        height: Math.round((firstCardRow.items.reduce((sum, item) => sum + item.rect.height, 0) / firstCardRow.items.length) * 100) / 100,
        count: firstCardRow.items.length,
      } : null,
      firstButtonRow: firstButtonRow ? {
        top: Math.round(Math.min(...firstButtonRow.items.map((item) => item.rect.top)) * 100) / 100,
        height: Math.round((firstButtonRow.items.reduce((sum, item) => sum + item.rect.height, 0) / firstButtonRow.items.length) * 100) / 100,
        count: firstButtonRow.items.length,
      } : null,
    },
    counts: {
      cards: cards.length,
      buttons: buttons.length,
      controls: controls.length,
      tables: tables.length,
      sidebars: sidebars.length,
    },
    samples: {
      buttons: buttons.slice(0, 40).map((item) => ({ text: item.text, className: item.className, rect: item.rect })),
      cards: cards.slice(0, 24).map((item) => ({ text: item.text, className: item.className, rect: item.rect })),
    },
    findings,
  };
}

async function injectGridOverlay(page) {
  const cssPath = path.resolve(__dirname, "../assets/grid-overlay.css");
  const css = await fs.readFile(cssPath, "utf8");
  await page.addStyleTag({ content: css });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-mm-audit-outline", "1");
    document.body.setAttribute("data-mm-audit-outline", "1");
  });
}

function recordKey(record) {
  return `${record.route.key}/${record.viewport.key}/${record.theme}`;
}

function buildSummary(records) {
  const allFindings = records.flatMap((record) => (record.findings || []).map((findingItem) => ({ ...findingItem, record: recordKey(record) })));
  const bySeverity = { P1: 0, P2: 0, P3: 0 };
  for (const item of allFindings) bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
  return {
    generatedAt: new Date().toISOString(),
    records: records.length,
    bySeverity,
    totalFindings: allFindings.length,
    redirectedToLogin: records.filter((record) => record.status?.redirectedToLogin).map(recordKey),
    horizontalOverflow: records.filter((record) => record.status?.horizontalOverflow).map(recordKey),
    findings: allFindings,
  };
}

function markdownReport(summary, records) {
  const lines = [];
  lines.push("# Motomania UI Grid Audit");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Records: ${summary.records}`);
  lines.push(`Findings: P1=${summary.bySeverity.P1 || 0}, P2=${summary.bySeverity.P2 || 0}, P3=${summary.bySeverity.P3 || 0}`);
  lines.push("");
  for (const record of records) {
    lines.push(`## ${recordKey(record)}`);
    lines.push("");
    if (record.error) {
      lines.push(`- ERROR: ${record.error}`);
      lines.push("");
      continue;
    }
    lines.push(`- URL: ${record.url}`);
    lines.push(`- Title: ${record.title || "(none)"}`);
    lines.push(`- Counts: cards=${record.counts?.cards || 0}, buttons=${record.counts?.buttons || 0}, tables=${record.counts?.tables || 0}, sidebars=${record.counts?.sidebars || 0}`);
    if (record.screenshots?.clean) lines.push(`- Clean screenshot: ${record.screenshots.clean}`);
    if (record.screenshots?.grid) lines.push(`- Grid screenshot: ${record.screenshots.grid}`);
    const findings = record.findings || [];
    if (!findings.length) {
      lines.push("- Findings: none");
    } else {
      for (const item of findings) {
        lines.push(`- ${item.severity} ${item.code}: ${item.message}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlReport(summary, records) {
  const rows = [];
  for (const record of records) {
    const findings = record.findings?.length ? record.findings : [finding("OK", "ok", "No findings")];
    for (const item of findings) {
      rows.push(`<tr data-severity="${htmlEscape(item.severity)}">
        <td>${htmlEscape(recordKey(record))}</td>
        <td><span class="sev ${htmlEscape(item.severity)}">${htmlEscape(item.severity)}</span></td>
        <td>${htmlEscape(item.code)}</td>
        <td>${htmlEscape(item.message)}</td>
        <td>${record.overlay ? `<a href="${htmlEscape(path.basename(record.overlay))}">overlay</a>` : record.screenshots?.grid ? `<a href="${htmlEscape(path.basename(record.screenshots.grid))}">grid</a>` : ""}</td>
      </tr>`);
    }
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Motomania UI Grid Audit</title>
<style>
body{font-family:Inter,Arial,sans-serif;margin:24px;background:#f4f4f5;color:#111827}
h1{font-size:24px;margin:0 0 8px}
.summary{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
.pill{background:white;border:1px solid #d4d4d8;border-radius:6px;padding:7px 10px}
table{border-collapse:collapse;width:100%;background:white}
th,td{border-bottom:1px solid #e4e4e7;font-size:12px;padding:8px;text-align:left;vertical-align:top}
th{background:#fafafa;font-size:11px;text-transform:uppercase}
.sev{border-radius:4px;color:white;display:inline-block;font-size:11px;font-weight:700;min-width:28px;padding:3px 5px;text-align:center}
.P1{background:#b91c1c}.P2{background:#92400e}.P3{background:#1d4ed8}.OK{background:#166534}
</style>
</head>
<body>
<h1>Motomania UI Grid Audit</h1>
<div>Generated: ${htmlEscape(summary.generatedAt)}</div>
<div class="summary">
  <div class="pill">Records: ${summary.records}</div>
  <div class="pill">P1: ${summary.bySeverity.P1 || 0}</div>
  <div class="pill">P2: ${summary.bySeverity.P2 || 0}</div>
  <div class="pill">P3: ${summary.bySeverity.P3 || 0}</div>
</div>
<table>
<thead><tr><th>Route</th><th>Severity</th><th>Code</th><th>Message</th><th>Screenshot</th></tr></thead>
<tbody>${rows.join("\n")}</tbody>
</table>
</body>
</html>
`;
}

function looksLikeRect(value) {
  return value &&
    typeof value === "object" &&
    Number.isFinite(value.left) &&
    Number.isFinite(value.top) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width > 0 &&
    value.height > 0;
}

function collectRects(value, out = []) {
  if (!value || typeof value !== "object") return out;
  if (looksLikeRect(value)) {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRects(item, out);
    return out;
  }
  for (const child of Object.values(value)) collectRects(child, out);
  return out;
}

function overlayHtml(record, screenshotName, boxes) {
  const rows = (record.findings || []).map((item) => `<li><strong>${htmlEscape(item.severity)} ${htmlEscape(item.code)}</strong>: ${htmlEscape(item.message)}</li>`).join("\n");
  const boxHtml = boxes.map((box, index) => {
    const label = `${box.severity} ${box.code}`;
    return `<div class="box ${htmlEscape(box.severity)}" style="left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px"><span>${htmlEscape(label)} #${index + 1}</span></div>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(recordKey(record))} overlay</title>
<style>
body{font-family:Inter,Arial,sans-serif;margin:0;background:#111827;color:white}
.summary{padding:14px 16px;background:#1f2937;position:sticky;top:0;z-index:3}
.summary h1{font-size:16px;margin:0 0 6px}.summary ul{margin:8px 0 0;padding-left:18px;max-height:160px;overflow:auto}
.stage{position:relative;display:inline-block}
.stage img{display:block;max-width:none}
.box{position:absolute;border:3px solid #ef4444;background:rgba(239,68,68,.13);box-sizing:border-box;pointer-events:none}
.box span{position:absolute;left:0;top:-24px;background:#ef4444;color:white;font:700 11px/1 Inter,Arial,sans-serif;padding:4px 6px;white-space:nowrap}
.box.P2{border-color:#f59e0b;background:rgba(245,158,11,.13)}.box.P2 span{background:#f59e0b;color:#111827}
.box.P3{border-color:#3b82f6;background:rgba(59,130,246,.13)}.box.P3 span{background:#3b82f6}
</style>
</head>
<body>
<div class="summary">
<h1>${htmlEscape(recordKey(record))}</h1>
<div>Visual overlay: red/orange/blue boxes mark measured findings. Use this with the JSON details.</div>
<ul>${rows || "<li>No findings</li>"}</ul>
</div>
<div class="stage">
<img src="${htmlEscape(screenshotName)}" alt="screenshot">
${boxHtml}
</div>
</body>
</html>
`;
}

async function generateOverlayReports(records, outDir) {
  for (const record of records) {
    const screenshot = record.screenshots?.clean || record.screenshots?.grid;
    if (!screenshot || !record.findings?.length) continue;
    const boxes = [];
    for (const item of record.findings) {
      const rects = collectRects(item.details || {}).slice(0, 12);
      for (const rect of rects) {
        boxes.push({
          severity: item.severity,
          code: item.code,
          left: Math.max(0, Math.round(rect.left)),
          top: Math.max(0, Math.round(rect.top)),
          width: Math.max(1, Math.round(rect.width)),
          height: Math.max(1, Math.round(rect.height)),
        });
      }
    }
    if (!boxes.length) continue;
    const overlayPath = path.join(outDir, `${safeName(record.route.key)}-${safeName(record.viewport.key)}-${safeName(record.theme)}-overlay.html`);
    await fs.writeFile(overlayPath, overlayHtml(record, path.basename(screenshot), boxes), "utf8");
    record.overlay = overlayPath;
  }
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
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
        });
        if (cookie) {
          await context.addCookies([{ name: "session", value: cookie, url: args.baseUrl, httpOnly: true, sameSite: "Lax" }]);
        }
        await context.addInitScript((themeName) => {
          try { localStorage.setItem("mm-theme", themeName); } catch (_) {}
          if (themeName === "light") document.documentElement.setAttribute("data-theme", "light");
          else document.documentElement.removeAttribute("data-theme");
        }, theme);

        const referenceRoute = args.reference
          ? routes.find((route) => route.key === args.reference.key && route.path === args.reference.path) || args.reference
          : null;
        let referenceRecord = null;

        for (const route of routes) {
          const page = await context.newPage();
          const url = buildUrl(args.baseUrl, route.path);
          const screenshots = {};
          let record;
          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
            await page.waitForTimeout(650);
            record = await page.evaluate(evaluatePage, { route, viewport, theme });
            if (args.screenshots) {
              screenshots.clean = path.join(outDir, `${safeName(route.key)}-${safeName(viewport.key)}-${safeName(theme)}-clean.png`);
              await page.screenshot({ path: screenshots.clean, fullPage: true });
              await injectGridOverlay(page);
              screenshots.grid = path.join(outDir, `${safeName(route.key)}-${safeName(viewport.key)}-${safeName(theme)}-grid.png`);
              await page.screenshot({ path: screenshots.grid, fullPage: true });
            }
            record.screenshots = screenshots;
            if (referenceRoute && route.key === referenceRoute.key && route.path === referenceRoute.path) {
              referenceRecord = record;
            } else if (referenceRoute && referenceRecord) {
              record.findings = [...(record.findings || []), ...compareToReference(record, referenceRecord, args.tolerance)];
            }
          } catch (err) {
            record = { route, viewport, theme, url, screenshots, error: String(err.message || err), findings: [finding("P1", "route-render-error", String(err.message || err))] };
          }
          records.push(record);
          await page.close();
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  appendGroupConsistencyFindings(records, args.tolerance);
  await generateOverlayReports(records, outDir);
  const summary = buildSummary(records);
  await fs.writeFile(path.join(outDir, "grid-audit.json"), JSON.stringify(records, null, 2), "utf8");
  await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  await fs.writeFile(path.join(outDir, "summary.md"), markdownReport(summary, records), "utf8");
  if (args.html) {
    await fs.writeFile(path.join(outDir, "grid-audit.html"), htmlReport(summary, records), "utf8");
  }

  console.log(JSON.stringify({
    outDir,
    records: summary.records,
    findings: summary.bySeverity,
    totalFindings: summary.totalFindings,
    summary: path.join(outDir, "summary.md"),
    html: args.html ? path.join(outDir, "grid-audit.html") : null,
  }, null, 2));

  if (args.failOn !== "none") {
    const failRank = SEVERITY_RANK[args.failOn];
    const shouldFail = summary.findings.some((item) => SEVERITY_RANK[item.severity] <= failRank);
    if (shouldFail) process.exit(2);
  }
}

main().catch((err) => {
  console.error(`[audit_layout_grid] ${err.message || err}`);
  process.exit(1);
});
