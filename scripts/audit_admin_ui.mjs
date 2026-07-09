#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_VIEWPORTS = [
  { key: "desktop", width: 1920, height: 1080 },
  { key: "mobile", width: 390, height: 844 },
];

const DEFAULT_THEMES = ["dark", "light"];

function usage() {
  return `Usage:
  node audit_admin_ui.mjs --base-url http://127.0.0.1:5059 --cookie "<session>" --route pantalla=/ruta-a-auditar --out instance/validation/ui-audit

Options:
  --base-url <url>            Required base URL.
  --cookie <value>            Optional Flask session cookie value.
  --cookie-file <path>        Optional file containing cookie value.
  --out <dir>                 Output dir. Default: instance/validation/ui-audit
  --route <key=path>          Route to audit. Can be repeated.
  --routes <json>             JSON route list: [{"key":"name","path":"/url"}]
  --viewports <spec>          Example: desktop=1920x1080,mobile=390x844
  --themes <list>             Example: dark,light
  --chrome-executable <path>  Optional Chrome executable path.
  --no-screenshots            Skip PNG screenshots.
  --help                      Show this help.
`;
}

function parseArgs(argv) {
  const args = {
    out: "instance/validation/ui-audit",
    routes: [],
    viewports: DEFAULT_VIEWPORTS,
    themes: DEFAULT_THEMES,
    screenshots: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--no-screenshots") args.screenshots = false;
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--cookie") args.cookie = argv[++i];
    else if (a === "--cookie-file") args.cookieFile = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--route") args.routes.push(parseRouteSpec(argv[++i], `route-${args.routes.length + 1}`));
    else if (a === "--routes") args.routesFile = argv[++i];
    else if (a === "--viewports") args.viewports = parseViewports(argv[++i]);
    else if (a === "--themes") args.themes = argv[++i].split(",").map((x) => x.trim()).filter(Boolean);
    else if (a === "--chrome-executable") args.chromeExecutable = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function parseRouteSpec(spec, fallbackKey) {
  const raw = String(spec || "").trim();
  if (!raw) throw new Error("Route spec cannot be empty");
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
    const [width, height] = size.split("x").map((x) => Number(x));
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
  }
  if (!Array.isArray(routes)) throw new Error("--routes must be a JSON array");
  routes = [...routes, ...args.routes];
  if (!routes.length) throw new Error("At least one --route or --routes entry is required.");
  for (const r of routes) {
    if (!r || typeof r.key !== "string" || typeof r.path !== "string") {
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
    throw new Error(
      "Playwright is required for browser audit. Install it or run browser checks manually. " +
      `Original error: ${err.message || err}`
    );
  }
}

function buildUrl(baseUrl, routePath) {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;
}

function evaluatePage(payload) {
  const { route, viewport, theme, screenshot } = payload;
  const visible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
  };
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
  const all = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
  const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
  const style = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
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
      borderLeftColor: cs.borderLeftColor,
      boxShadow: cs.boxShadow,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      gridTemplateColumns: cs.gridTemplateColumns,
      gap: cs.gap,
    };
  };
  const parseColor = (value) => {
    const match = String(value || "").match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(",").map((x) => Number(String(x).trim()));
    if (parts.length < 3) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length >= 4 ? parts[3] : 1 };
  };
  const blend = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a <= 0) return { r: 255, g: 255, b: 255, a: 1 };
    return {
      r: Math.round((top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a),
      g: Math.round((top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a),
      b: Math.round((top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a),
      a,
    };
  };
  const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const effectiveBg = (el) => {
    const layers = [];
    for (let cur = el; cur && cur instanceof Element; cur = cur.parentElement) {
      const bg = parseColor(getComputedStyle(cur).backgroundColor);
      if (bg && bg.a > 0) layers.push(bg);
    }
    layers.push(bodyBg);
    let out = layers.pop();
    while (layers.length) out = blend(layers.pop(), out);
    return out;
  };
  const luminance = (c) => {
    const channel = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  };
  const contrast = (fg, bg) => {
    const a = luminance(fg);
    const b = luminance(bg);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  };

  const root = document.documentElement;
  const admin = document.querySelector(".admin-board-main");
  const main = admin || document.querySelector("main") || document.body;
  const titleEl = document.querySelector(".admin-board-main h1, .page-title, h1");
  const lowContrast = [];
  const candidates = Array.from(main.querySelectorAll("h1,h2,h3,p,span,small,strong,button,a,label,th,td,dt,dd,li,code,b,div"))
    .filter((el) => visible(el) && text(el))
    .slice(0, 500);
  for (const el of candidates) {
    const fg = parseColor(getComputedStyle(el).color);
    if (!fg) continue;
    const bg = effectiveBg(el);
    const ratio = contrast(fg, bg);
    if (ratio < 4.5) {
      lowContrast.push({
        ratio,
        tag: el.tagName.toLowerCase(),
        className: el.className || "",
        text: text(el).slice(0, 120),
        color: getComputedStyle(el).color,
        effectiveBg: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
        rect: rect(el),
      });
      if (lowContrast.length >= 40) break;
    }
  }

  const gradients = Array.from(main.querySelectorAll("*"))
    .filter(visible)
    .filter((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      return bg && bg !== "none";
    })
    .slice(0, 40)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: el.className || "",
      text: text(el).slice(0, 80),
      backgroundImage: getComputedStyle(el).backgroundImage.slice(0, 180),
      rect: rect(el),
    }));

  const buttons = all("button, .cf-btn, .btn, select, input[type=button], input[type=submit]")
    .slice(0, 80)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: el.className || "",
      text: text(el).slice(0, 80),
      rect: rect(el),
      style: {
        height: getComputedStyle(el).height,
        minHeight: getComputedStyle(el).minHeight,
        fontSize: getComputedStyle(el).fontSize,
      },
    }));

  return {
    route,
    viewport,
    theme,
    url: location.href,
    screenshot,
    title: text(titleEl),
    status: {
      redirectedToLogin: location.pathname.includes("login"),
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
    },
    scroll: {
      innerWidth,
      innerHeight,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
    },
    rects: {
      header: rect(document.querySelector(".top")),
      sidebar: rect(document.querySelector(".module-group-sidebar, .sidebar, .fin-sidebar, aside")),
      main: rect(main),
      title: rect(titleEl),
      overview: rect(document.querySelector(".admin-overview, .cf-overview, .kpi-grid, .cards, .dash-grid")),
      firstCard: rect(document.querySelector(".admin-board-main .cf-card, .card, .vr-card, .cf-card")),
    },
    counts: {
      cards: all(".cf-card, .card, .vr-card, .admin-kpi, .cf-kpi").length,
      kpis: all(".admin-kpi, .cf-kpi, .kpi-card, .vr-card").length,
      buttons: buttons.length,
      tables: all("table").length,
      inputs: all("input, select, textarea").length,
      inlineStyles: Array.from(main.querySelectorAll("[style]")).filter(visible).length,
    },
    styles: {
      title: style(titleEl),
      firstButton: style(all("button, .cf-btn, .btn, select")[0]),
      firstCard: style(document.querySelector(".admin-board-main .cf-card, .card, .vr-card, .cf-card")),
    },
    samples: { buttons },
    findings: { gradients, lowContrast },
  };
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
  const results = [];

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

        for (const route of routes) {
          const page = await context.newPage();
          const url = buildUrl(args.baseUrl, route.path);
          let screenshot = "";
          let record;
          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
            await page.waitForTimeout(500);
            if (args.screenshots) {
              screenshot = path.join(outDir, `${safeName(route.key)}-${safeName(viewport.key)}-${safeName(theme)}.png`);
              await page.screenshot({ path: screenshot, fullPage: true });
            }
            record = await page.evaluate(evaluatePage, { route, viewport, theme, screenshot });
          } catch (err) {
            record = { route, viewport, theme, url, screenshot, error: String(err.message || err) };
          }
          results.push(record);
          await page.close();
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    records: results.length,
    errors: results.filter((r) => r.error).map((r) => ({ key: r.route?.key, viewport: r.viewport?.key, theme: r.theme, error: r.error })),
    redirectedToLogin: results.filter((r) => r.status?.redirectedToLogin).map((r) => `${r.route.key}/${r.viewport.key}/${r.theme}`),
    horizontalOverflow: results.filter((r) => r.status?.horizontalOverflow).map((r) => `${r.route.key}/${r.viewport.key}/${r.theme}`),
    gradients: results.filter((r) => r.findings?.gradients?.length).map((r) => ({ key: `${r.route.key}/${r.viewport.key}/${r.theme}`, count: r.findings.gradients.length })),
    lowContrast: results.filter((r) => r.findings?.lowContrast?.length).map((r) => ({
      key: `${r.route.key}/${r.viewport.key}/${r.theme}`,
      count: r.findings.lowContrast.length,
      first: r.findings.lowContrast[0],
    })),
    tallestPages: results
      .filter((r) => r.scroll)
      .map((r) => ({ key: `${r.route.key}/${r.viewport.key}/${r.theme}`, height: r.scroll.scrollHeight, viewport: r.scroll.innerHeight }))
      .sort((a, b) => b.height - a.height)
      .slice(0, 10),
  };

  await fs.writeFile(path.join(outDir, "audit.json"), JSON.stringify(results, null, 2), "utf8");
  await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(`[audit_admin_ui] ${err.message || err}`);
  process.exit(1);
});
