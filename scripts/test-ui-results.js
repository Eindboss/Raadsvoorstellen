const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP_JS = path.join(ROOT, "public", "app.js");
const FIXTURE_DIR = path.join(ROOT, "test-fixtures");

const REQUIRED_IDS = [
  "pdf-input",
  "url-input",
  "pdf-file",
  "file-name",
  "submit-btn",
  "status-idle",
  "status-loading",
  "status-error",
  "error-message",
  "empty-state",
  "result-grid",
  "basis-view",
  "deep-view",
  "copy-report-btn",
  "copy-feedback",
  "export-pdf-sidebar-btn",
  "print-report",
  "result-view-toggle",
  "basis-toggle",
  "deep-toggle",
  "score-panel",
  "score-ring",
  "score-number",
  "score-label",
  "trust-label",
  "score-cats",
  "score-divider",
  "report-actions",
  "gemeente-badge",
  "gemeente-naam",
  "voorstel-info",
];

class FakeClassList {
  constructor(initial = "") {
    this.items = new Set(String(initial).split(/\s+/).filter(Boolean));
  }
  add(...names) {
    names.forEach((name) => this.items.add(name));
  }
  remove(...names) {
    names.forEach((name) => this.items.delete(name));
  }
  toggle(name, force) {
    if (force === true) {
      this.items.add(name);
      return true;
    }
    if (force === false) {
      this.items.delete(name);
      return false;
    }
    if (this.items.has(name)) {
      this.items.delete(name);
      return false;
    }
    this.items.add(name);
    return true;
  }
  contains(name) {
    return this.items.has(name);
  }
  toString() {
    return Array.from(this.items).join(" ");
  }
}

class FakeElement {
  constructor(id = "", className = "") {
    this.id = id;
    this.dataset = {};
    this.style = {};
    this.value = "";
    this.files = [];
    this._innerHTML = "";
    this._textContent = "";
    this.classList = new FakeClassList(className);
  }
  set className(value) {
    this.classList = new FakeClassList(value);
  }
  get className() {
    return this.classList.toString();
  }
  set innerHTML(value) {
    this._innerHTML = String(value || "");
  }
  get innerHTML() {
    return this._innerHTML;
  }
  set textContent(value) {
    this._textContent = String(value || "");
  }
  get textContent() {
    if (this._textContent) return this._textContent;
    return stripTags(this._innerHTML);
  }
  get innerText() {
    return this.textContent;
  }
  set innerText(value) {
    this.textContent = value;
  }
  addEventListener() {}
  appendChild() {}
  removeChild() {}
  focus() {}
  select() {}
  setSelectionRange() {}
  setAttribute(name, value) {
    this[name] = value;
  }
  scrollTo() {}
  querySelectorAll(selector) {
    if (selector === "[data-detail-tab]") return detailButtonsFromHtml(this._innerHTML);
    if (selector === "[data-detail-panel]") return detailPanelsFromHtml(this._innerHTML);
    return [];
  }
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detailButtonsFromHtml(html) {
  return [...String(html).matchAll(/data-detail-tab="([^"]+)"/g)].map((match) => {
    const el = new FakeElement();
    el.dataset.detailTab = match[1];
    return el;
  });
}

function detailPanelsFromHtml(html) {
  return [...String(html).matchAll(/data-detail-panel="([^"]+)"/g)].map((match) => {
    const el = new FakeElement();
    el.dataset.detailPanel = match[1];
    return el;
  });
}

function createDom() {
  const elements = new Map();
  REQUIRED_IDS.forEach((id) => elements.set(id, new FakeElement(id)));
  elements.get("status-loading").classList.add("hidden");
  elements.get("status-error").classList.add("hidden");
  elements.get("result-grid").classList.add("hidden");
  elements.get("deep-view").classList.add("hidden");
  elements.get("score-panel").classList.add("hidden");
  elements.get("report-actions").classList.add("hidden");
  elements.get("basis-toggle").dataset.view = "basis";
  elements.get("deep-toggle").dataset.view = "deep";
  elements.get("basis-toggle").classList.add("view-toggle", "active");
  elements.get("deep-toggle").classList.add("view-toggle");

  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement(id));
      return elements.get(id);
    },
    querySelectorAll(selector) {
      if (selector === ".tab") return [];
      if (selector === ".view-toggle") return [elements.get("basis-toggle"), elements.get("deep-toggle")];
      if (selector === ".scan-step") return [];
      return [];
    },
    createElement(tag) {
      return new FakeElement(tag);
    },
    body: new FakeElement("body"),
    execCommand() {
      return true;
    },
  };
  return { document, elements };
}

function loadApp() {
  const { document, elements } = createDom();
  const context = {
    console,
    document,
    window: {},
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: {
      store: {},
      setItem(key, value) { this.store[key] = String(value); },
      getItem(key) { return this.store[key] || null; },
    },
    FormData: class {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(APP_JS, "utf8"), context, { filename: APP_JS });
  return { context, elements };
}

function readFixtures() {
  return fs.readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({
      name: path.basename(file, ".json"),
      data: JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), "utf8")),
    }));
}

function assert(checks, condition, label, detail = "") {
  checks.push({ ok: Boolean(condition), label, detail });
}

function renderFixture(data) {
  const { context, elements } = loadApp();
  context.renderResult(data);
  const basis = elements.get("basis-view").innerHTML;
  const deep = elements.get("deep-view").innerHTML;
  const print = context.buildPrintableReportHtml(data);
  const plain = context.buildPlainTextReport(data);
  const sidebarLabel = elements.get("score-label").textContent;
  const heroLabel = (basis.match(/<h2>(.*?)<\/h2>/) || [null, ""])[1].replace(/&amp;/g, "&");
  return { context, elements, basis, deep, print, plain, sidebarLabel, heroLabel };
}

function runFixtureChecks(name, data) {
  const checks = [];
  const rendered = renderFixture(data);
  const allHtml = `${rendered.basis}\n${rendered.deep}\n${rendered.print}\n${rendered.plain}`;

  assert(checks, !/\bundefined\b|\bnull\b/.test(allHtml), "geen undefined/null in output");
  assert(checks, rendered.sidebarLabel === rendered.heroLabel, "sidebarlabel is gelijk aan herolabel", `${rendered.sidebarLabel} !== ${rendered.heroLabel}`);
  assert(checks, !rendered.elements.get("score-panel").classList.contains("hidden"), "sidebar-score verschijnt na analyse");
  assert(checks, rendered.basis.includes("Besluitrijpheidsadvies"), "basisweergave rendert oordeelkaart");
  assert(checks, rendered.deep.includes("Argumentatie"), "deep view bevat tab Argumentatie");
  assert(checks, rendered.deep.includes("Analyseproces"), "deep view hernoemt Technisch naar Analyseproces");
  assert(checks, !rendered.deep.includes(">Technisch<"), "geen tab met naam Technisch");
  assert(checks, rendered.print.includes("Totstandkoming van de analyse"), "PDF bevat totstandkoming achteraan");
  assert(checks, rendered.print.includes("Onderbouwing"), "PDF bevat volledige onderbouwing");

  if (name === "geen-bevindingen") {
    assert(checks, rendered.basis.includes("Geen bevestigde bevindingen"), "geen-bevindingen toont rustige lege staat");
  }

  if (name === "alleen-optioneel") {
    assert(checks, rendered.basis.includes("Kleine optimalisaties"), "alleen optioneel toont kleine optimalisaties");
    assert(checks, rendered.basis.includes("Geen blokkerende punten of noodzakelijke aandachtspunten gevonden."), "alleen optioneel toont positief signaal");
    const optionalCount = (rendered.basis.match(/class="optioneel"/g) || []).length;
    assert(checks, optionalCount <= 2, "alleen optioneel toont maximaal twee optimalisaties", `gevonden: ${optionalCount}`);
  }

  if (name === "aandacht") {
    const decisionPanel = panelHtml(rendered.deep, "beslispunten");
    assert(checks, rendered.basis.includes("Belangrijkste herstelacties"), "aandacht toont herstelacties");
    assert(checks, decisionPanel.includes("Onvoldoende onderbouwing"), "beslispunten-tab toont compact signaal");
    assert(checks, !decisionPanel.includes("De toelichting onderbouwt onvoldoende"), "beslispunten-tab herhaalt geen uitgebreide analyse");
    assert(checks, decisionPanel.includes("Zie tab Bevindingen"), "beslispunten-tab verwijst naar bevindingen");
  }

  if (name === "blokkerend") {
    assert(checks, rendered.basis.includes("Eerst herstellen"), "blokkerend toont Eerst herstellen");
    assert(checks, rendered.basis.includes("Niet besluitrijp"), "blokkerend forceert Niet besluitrijp");
    assert(checks, rendered.basis.includes("blocking-callout"), "blokkerend toont prominente callout");
  }

  if (name === "argumentatie") {
    const argumentPanel = panelHtml(rendered.deep, "argumentatie");
    assert(checks, argumentPanel.includes("Alternatieven worden genoemd"), "argumentatiebevinding staat in argumentatietab");
    assert(checks, rendered.deep.includes("Bevindingen") && rendered.deep.includes("Alternatieven worden genoemd"), "argumentatiebevinding blijft in algemene bevindingen");
    assert(checks, rendered.print.includes("Argumentatie"), "PDF bevat argumentatie");
    checks.push({ ok: true, warning: true, label: "handmatige review: controleer argumentatiebevinding op politieke neutraliteit" });
  }

  if (name === "missing-data") {
    assert(checks, allHtml.includes("Onbekend") || allHtml.includes("Geen"), "ontbrekende metadata krijgt fallback");
  }

  if (name === "lege-beslispunten") {
    assert(checks, rendered.basis.includes("Geen beslispunten herkend"), "lege beslispunten toont fallback");
  }

  if (name === "een-bevinding") {
    assert(checks, rendered.basis.includes("Top 1"), "een bevinding gebruikt geen Top 3-label");
  }

  return checks;
}

function panelHtml(deepHtml, panelName) {
  const start = deepHtml.indexOf(`data-detail-panel="${panelName}"`);
  if (start === -1) return "";
  const next = deepHtml.indexOf('data-detail-panel="', start + 1);
  return next === -1 ? deepHtml.slice(start) : deepHtml.slice(start, next);
}

function main() {
  const fixtures = readFixtures();
  let failed = 0;
  let warnings = 0;

  console.log(`UI-resultaattests: ${fixtures.length} fixtures\n`);

  for (const fixture of fixtures) {
    const checks = runFixtureChecks(fixture.name, fixture.data);
    const hasFailure = checks.some((check) => !check.ok);
    if (hasFailure) failed++;
    console.log(`${hasFailure ? "✗" : "✓"} ${fixture.name}`);
    checks.forEach((check) => {
      if (check.warning) {
        warnings++;
        console.log(`  ⚠ ${check.label}`);
      } else {
        console.log(`  ${check.ok ? "✓" : "✗"} ${check.label}${!check.ok && check.detail ? ` (${check.detail})` : ""}`);
      }
    });
    console.log("");
  }

  console.log(`Samenvatting: ${fixtures.length - failed}/${fixtures.length} fixtures geslaagd, ${warnings} review-signaal(en).`);
  if (failed) process.exit(1);
}

main();
