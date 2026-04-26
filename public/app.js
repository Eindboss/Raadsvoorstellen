const tabs = document.querySelectorAll(".tab");
const pdfInput = document.getElementById("pdf-input");
const urlInput = document.getElementById("url-input");
const pdfFileInput = document.getElementById("pdf-file");
const fileNameEl = document.getElementById("file-name");
const submitBtn = document.getElementById("submit-btn");
const statusIdle = document.getElementById("status-idle");
const statusLoading = document.getElementById("status-loading");
const statusError = document.getElementById("status-error");
const errorMessage = document.getElementById("error-message");
const emptyState = document.getElementById("empty-state");
const resultGrid = document.getElementById("result-grid");
const basisView = document.getElementById("basis-view");
const deepView = document.getElementById("deep-view");
const copyReportBtn = document.getElementById("copy-report-btn");
const copyFeedback = document.getElementById("copy-feedback");
const exportPdfSidebarBtn = document.getElementById("export-pdf-sidebar-btn");
const printReport = document.getElementById("print-report");

let mode = "pdf";

const SCAN_STEPS = [
  { label: "Document inladen", duration: 2000 },
  { label: "Tekst extraheren", duration: 3000 },
  { label: "Voorstel classificeren", duration: 4000 },
  { label: "Kandidaten detecteren · Pass 1", duration: 6000 },
  { label: "Bevindingen valideren · Pass 2", duration: null },
];

let scanTimers = [];

function startScanAnimation() {
  const stepEls = document.querySelectorAll(".scan-step");
  stepEls.forEach((el) => { el.className = "scan-step"; });
  let current = 0;
  stepEls[0]?.classList.add("active");

  function advance() {
    if (current >= stepEls.length - 1) return;
    stepEls[current].classList.remove("active");
    stepEls[current].classList.add("done");
    current++;
    stepEls[current].classList.add("active");
    const next = SCAN_STEPS[current];
    if (next?.duration) scanTimers.push(setTimeout(advance, next.duration));
  }

  if (SCAN_STEPS[0]?.duration) scanTimers.push(setTimeout(advance, SCAN_STEPS[0].duration));
}

function stopScanAnimation() {
  scanTimers.forEach((timer) => clearTimeout(timer));
  scanTimers = [];
  document.querySelectorAll(".scan-step").forEach((el) => {
    el.classList.remove("active");
    el.classList.add("done");
  });
}

fileNameEl.addEventListener("click", () => pdfFileInput.click());

pdfFileInput.addEventListener("change", () => {
  const file = pdfFileInput.files[0];
  fileNameEl.textContent = file ? file.name : "Geen bestand gekozen";
  fileNameEl.classList.toggle("has-file", Boolean(file));
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    mode = tab.dataset.mode;
    pdfInput.classList.toggle("hidden", mode !== "pdf");
    urlInput.classList.toggle("hidden", mode !== "url");
  });
});

copyReportBtn?.addEventListener("click", () => copyCurrentReport());
exportPdfSidebarBtn?.addEventListener("click", exportPdf);

document.getElementById("result-view-toggle")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  setResultView(button.dataset.view);
});

deepView?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-detail-tab]");
  if (!button) return;
  setDeepTab(button.dataset.detailTab);
});

submitBtn.addEventListener("click", async () => {
  setStatus("loading");
  submitBtn.disabled = true;

  try {
    const formData = new FormData();

    if (mode === "pdf") {
      const file = pdfFileInput.files[0];
      if (!file) throw new Error("Selecteer een PDF-bestand.");
      formData.append("pdf", file);
    } else {
      const url = document.getElementById("pdf-url").value.trim();
      if (!url) throw new Error("Voer een geldige URL in.");
      formData.append("url", url);
    }

    const res = await fetch("/api/toets", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Er ging iets mis.");

    setStatus("idle");
    renderResult(data);
  } catch (err) {
    setStatus("error", err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

function setStatus(state, msg) {
  statusIdle.classList.add("hidden");
  statusLoading.classList.add("hidden");
  statusError.classList.add("hidden");

  if (state === "idle") {
    statusIdle.classList.remove("hidden");
    stopScanAnimation();
  }
  if (state === "loading") {
    statusLoading.classList.remove("hidden");
    startScanAnimation();
  }
  if (state === "error") {
    stopScanAnimation();
    errorMessage.textContent = msg || "Onbekende fout.";
    statusError.classList.remove("hidden");
  }
}

function renderResult(data) {
  window.lastResult = data || {};

  renderBasisView(window.lastResult);
  renderDeepView(window.lastResult);
  renderScore(window.lastResult.score);
  renderReportActions();
  renderGemeente(window.lastResult);
  setResultView("basis", { persist: false });

  statusIdle.classList.add("hidden");
  emptyState.classList.add("hidden");
  resultGrid.classList.remove("hidden");
  resultGrid.scrollTo({ top: 0, left: 0 });
}

function renderBasisView(data) {
  if (!basisView) return;
  const summary = getDecisionSummary(data);
  const findingPresentation = getFindingPresentation(data);
  const topFindings = findingPresentation.findings;
  const totalFindings = safeArray(data.bevindingen).length;
  const remainingFindings = Math.max(0, totalFindings - topFindings.length);
  const decisions = safeArray(data.beslispunten);
  const underbouwWarnings = getDecisionWarnings(data);
  const blockerText = summary.blokkerend === 1 ? "1 blokkerende bevinding" : `${summary.blokkerend} blokkerende bevindingen`;
  const attentionText = summary.aandacht === 1 ? "1 aandachtspunt" : `${summary.aandacht} aandachtspunten`;

  basisView.innerHTML = `
    <article class="basis-overview">
      <section class="decision-hero ${summary.statusClass}">
        <div class="decision-score">
          <span class="decision-score-number">${escHtml(summary.score)}</span>
          <span class="decision-score-caption">Score</span>
        </div>
        <div class="decision-main">
          <p class="decision-eyebrow">Besluitrijpheidsadvies</p>
          <h2>${escHtml(summary.label)}</h2>
          <div class="decision-conclusion">${escHtml(getDecisionConclusion(summary))}</div>
          <div class="decision-meta">
            <span>${attentionText}</span>
            <span>${blockerText}</span>
            ${summary.vertrouwen ? `<span>Analysebetrouwbaarheid: ${summary.vertrouwen}%</span>` : ""}
          </div>
          ${summary.blokkerend ? `<div class="blocking-callout">Niet besluitrijp: los eerst de blokkerende bevindingen op.</div>` : ""}
        </div>
      </section>

      <section class="basis-section basis-kern">
        <h3>Kern van het voorstel</h3>
        <p>${escHtml(data.kern || "Geen kernsamenvatting beschikbaar.")}</p>
      </section>

      <section class="basis-section">
        <div class="section-title-row">
          <h3>${escHtml(findingPresentation.title)}</h3>
          <span>${escHtml(findingPresentation.label)}</span>
        </div>
        ${findingPresentation.intro ? `<p class="basis-section-intro">${escHtml(findingPresentation.intro)}</p>` : ""}
        ${topFindings.length ? renderFindingSummaryList(topFindings) : `
          <p class="empty-note">Geen bevestigde bevindingen gevonden. Controleer het voorstel altijd zelf voordat het wordt aangeboden.</p>
        `}
        ${remainingFindings ? `<button class="more-findings-link" type="button" id="more-findings-link">En ${remainingFindings} overige punt${remainingFindings === 1 ? "" : "en"} in diepgaande analyse</button>` : ""}
      </section>

      <section class="basis-section compact-decisions">
        <h3>Beslispunten</h3>
        ${decisions.length ? renderCompactDecisions(decisions, data) : `<p class="empty-note">Geen beslispunten herkend.</p>`}
        ${underbouwWarnings.length ? `<div class="decision-warning">${underbouwWarnings.length} beslispunt(en) vragen extra onderbouwing.</div>` : ""}
      </section>

      <div class="primary-actions">
        <button id="copy-report-main" class="action-btn primary" type="button">Kopieer rapport</button>
        <button id="export-pdf-btn" class="action-btn" type="button">Exporteer PDF</button>
        <button id="show-deep-btn" class="action-btn" type="button">Toon diepgaande analyse</button>
      </div>
    </article>
  `;

  document.getElementById("copy-report-main")?.addEventListener("click", () => copyCurrentReport());
  document.getElementById("export-pdf-btn")?.addEventListener("click", exportPdf);
  document.getElementById("show-deep-btn")?.addEventListener("click", () => setResultView("deep"));
  document.getElementById("more-findings-link")?.addEventListener("click", () => {
    setResultView("deep");
    setDeepTab("bevindingen");
  });
}

function renderDeepView(data) {
  if (!deepView) return;
  deepView.innerHTML = `
    <div class="deep-analysis">
      <div class="detail-tabs" role="tablist" aria-label="Diepgaande analyse">
        <button class="detail-tab active" type="button" data-detail-tab="beslispunten">Beslispunten</button>
        <button class="detail-tab" type="button" data-detail-tab="juridisch">Juridisch</button>
        <button class="detail-tab" type="button" data-detail-tab="bevindingen">Bevindingen</button>
        <button class="detail-tab" type="button" data-detail-tab="argumentatie">Argumentatie</button>
        <button class="detail-tab" type="button" data-detail-tab="toegankelijkheid">Toegankelijkheid</button>
        <button class="detail-tab" type="button" data-detail-tab="onderbouwing">Onderbouwing</button>
        <button class="detail-tab" type="button" data-detail-tab="analyseproces">Analyseproces</button>
      </div>

      <section class="detail-section detail-panel active" data-detail-panel="beslispunten">
        <h3>Beslispunten</h3>
        <ol class="detail-list">${renderBeslispunten(data)}</ol>
        ${renderDecisionSummaryNote(data)}
      </section>

      <section class="detail-section detail-panel" data-detail-panel="juridisch">
        <h3>Bevoegdheid</h3>
        ${renderBevoegdheid(data.bevoegdheid)}
      </section>

      <section class="detail-section detail-panel" data-detail-panel="bevindingen">
        <h3>Bevindingen</h3>
        ${renderBevindingen(data)}
      </section>

      <section class="detail-section detail-panel" data-detail-panel="argumentatie">
        <h3>Argumentatielijn</h3>
        ${renderArgumentatie(data)}
      </section>

      <section class="detail-section detail-panel" data-detail-panel="toegankelijkheid">
        <h3>Toegankelijkheid <span>indicatief</span></h3>
        ${renderToegang(data)}
      </section>

      <section class="detail-section detail-panel" data-detail-panel="onderbouwing">
        <h3>Onderbouwing</h3>
        ${renderOnderbouwingCompact(data)}
      </section>

      <section class="detail-section detail-panel technical-analysis" data-detail-panel="analyseproces">
        <h3>Hoe is deze analyse tot stand gekomen?</h3>
        <p class="process-intro">Deze gegevens helpen om te controleren hoe de analyse tot stand kwam. Ze zijn vooral bedoeld voor controle en foutopsporing.</p>
        <details>
          <summary>Analysegegevens tonen</summary>
          ${renderTechnicalDetails(data)}
        </details>
      </section>
    </div>
  `;
}

function setResultView(view, options = {}) {
  const selected = view === "deep" ? "deep" : "basis";
  basisView?.classList.toggle("hidden", selected !== "basis");
  deepView?.classList.toggle("hidden", selected !== "deep");
  document.querySelectorAll(".view-toggle").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === selected);
  });
  if (options.persist !== false) localStorage.setItem("rv_result_view", selected);
  resultGrid?.scrollTo({ top: 0, left: 0 });
}

function setDeepTab(tab) {
  const selected = tab || "beslispunten";
  deepView?.querySelectorAll("[data-detail-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.detailTab === selected);
  });
  deepView?.querySelectorAll("[data-detail-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.detailPanel === selected);
  });
}

function getDecisionSummary(data) {
  const score = getScoreTotal(data);
  const bevindingen = safeArray(data?.bevindingen);
  const blokkerend = bevindingen.filter((item) => normalizeErnst(item) === "BLOKKEREND").length;
  const aandacht = bevindingen.filter((item) => normalizeErnst(item) === "AANDACHT").length;
  const optionieel = bevindingen.filter((item) => normalizeErnst(item) === "OPTIONEEL").length;
  const label = blokkerend ? "Niet besluitrijp" : normalizeScoreLabel(data?.score_label, score);
  const statusClass = blokkerend || score < 50 ? "danger" : score >= 85 ? "good" : score >= 65 ? "mild" : "warn";
  return {
    score,
    label,
    statusClass,
    blokkerend,
    aandacht,
    optionieel,
    vertrouwen: Number.isFinite(data?.vertrouwen) ? data.vertrouwen : null,
  };
}

function getScoreTotal(data) {
  if (Number.isFinite(data?.score?.totaal)) return data.score.totaal;
  if (Number.isFinite(data?.score)) return data.score;
  return 0;
}

function getDecisionConclusion(summary) {
  if (summary.blokkerend) return "Niet besluitrijp - los eerst de blokkerende punten op";
  if (summary.aandacht > 0) return "Besluit mogelijk na aanpassing";
  return "Direct besluitrijp";
}

function getTopFindings(data, limit = 3) {
  return safeArray(data?.bevindingen)
    .slice()
    .sort((a, b) => severityRank(b) - severityRank(a))
    .slice(0, limit);
}

function getFindingPresentation(data) {
  const bevindingen = safeArray(data?.bevindingen);
  const blockers = bevindingen.filter((item) => normalizeErnst(item) === "BLOKKEREND");
  const attention = bevindingen.filter((item) => normalizeErnst(item) === "AANDACHT");
  const optional = bevindingen.filter((item) => normalizeErnst(item) === "OPTIONEEL");

  if (blockers.length) {
    return {
      title: "Eerst herstellen",
      label: `Top ${Math.min(3, bevindingen.length)}`,
      intro: "",
      findings: getTopFindings(data, 3),
    };
  }

  if (attention.length) {
    const findings = [...attention, ...optional].slice(0, 3);
    return {
      title: "Belangrijkste herstelacties",
      label: `Top ${findings.length}`,
      intro: "",
      findings,
    };
  }

  if (optional.length) {
    return {
      title: "Kleine optimalisaties",
      label: "Optioneel",
      intro: "Geen blokkerende punten of noodzakelijke aandachtspunten gevonden.",
      findings: optional.slice(0, 2),
    };
  }

  return {
    title: "Geen bevestigde bevindingen",
    label: "Geen bevindingen",
    intro: "",
    findings: [],
  };
}

function renderFindingSummaryList(findings) {
  return `<ul class="finding-summary-list">
    ${findings.map((item) => `
      <li class="${escClass(normalizeErnst(item))}">
        <div class="finding-line">
          <span class="finding-severity">${escHtml(labelForSeverity(item))}</span>
          ${renderRecoveryLabel(item)}
        </div>
        <strong>${escHtml(item.bevinding || "Bevinding zonder titel")}</strong>
        ${item.herstelactie ? `<p><span>Herstelactie:</span> ${escHtml(item.herstelactie)}</p>` : ""}
      </li>
    `).join("")}
  </ul>`;
}

function renderCompactDecisions(decisions, data) {
  const checks = safeArray(data.beslispunten_check);
  return `<ol class="compact-decision-list">
    ${decisions.map((punt, index) => {
      const check = findBeslispuntCheck(punt, checks, index);
      const statusClass = check && typeof check.onderbouwd === "boolean" ? (check.onderbouwd ? "ok" : "warn") : "";
      return `<li>${statusClass ? `<span class="decision-status ${statusClass}" aria-hidden="true"></span>` : ""}${escHtml(punt)}</li>`;
    }).join("")}
  </ol>`;
}

function renderBeslispunten(data) {
  const beslispunten = safeArray(data?.beslispunten);
  const checks = safeArray(data?.beslispunten_check);
  if (!beslispunten.length) return `<li class="empty-note">Geen beslispunten herkend.</li>`;
  return beslispunten.map((punt, index) => {
    const check = findBeslispuntCheck(punt, checks, index);
    const statusClass = check && typeof check.onderbouwd === "boolean" ? (check.onderbouwd ? "ok" : "warn") : "";
    const signal = check?.onderbouwd === false
      ? `<span class="decision-inline-warning">Onvoldoende onderbouwing</span>`
      : "";
    return `<li>${statusClass ? `<span class="decision-status ${statusClass}" aria-hidden="true"></span>` : ""}<span>${escHtml(punt)}</span>${signal}</li>`;
  }).join("");
}

function renderDecisionSummaryNote(data) {
  const warnings = getDecisionWarnings(data);
  if (!warnings.length) return "";
  const count = warnings.length;
  return `<p class="decision-summary-note">${count} beslispunt${count === 1 ? "" : "en"} ${count === 1 ? "vraagt" : "vragen"} nadere onderbouwing. Zie tab Bevindingen voor bewijs en herstelacties.</p>`;
}

function findBeslispuntCheck(punt, checks, index) {
  if (!Array.isArray(checks) || !checks.length) return null;
  if (checks[index]) return checks[index];
  const normalized = normalizeText(punt);
  return checks.find((check) => {
    const candidate = normalizeText(check.beslispunt || "");
    return candidate && (candidate.includes(normalized) || normalized.includes(candidate));
  }) || null;
}

function renderBevindingen(data) {
  const bevindingen = safeArray(data?.bevindingen);
  if (!bevindingen.length) return `<p class="empty-note">Geen bevestigde bevindingen.</p>`;
  return `<ul class="full-finding-list">
    ${bevindingen.map((b) => `
      <li class="${escClass(normalizeErnst(b))}">
        <div class="finding-line">
          <span class="finding-severity">${escHtml(labelForSeverity(b))}</span>
          <span class="finding-rubric">${escHtml(b.rubriek || "Algemeen")}</span>
          ${renderRecoveryLabel(b)}
        </div>
        <strong>${escHtml(b.bevinding || "")}</strong>
        ${b.bewijs ? `<p><span>Bewijs:</span> ${escHtml(b.bewijs)}</p>` : ""}
        ${b.herstelactie ? `<p><span>Herstelactie:</span> ${escHtml(b.herstelactie)}</p>` : ""}
      </li>
    `).join("")}
  </ul>`;
}

function renderArgumentatie(data) {
  const argumentatie = data?.argumentatie || {};
  const items = getArgumentatieFindings(data);
  const oordeel = argumentatie.oordeel || (items.length ? "Aandachtspunten gevonden" : "Geen afzonderlijke aandachtspunten");
  const toelichting = argumentatie.toelichting || (items.length
    ? "Onderstaande bevindingen raken de lijn probleem, keuze en besluit."
    : "Geen afzonderlijke aandachtspunten bij de argumentatielijn gevonden.");

  return `
    <div class="argumentatie-summary">
      <strong>${escHtml(oordeel)}</strong>
      <p>${escHtml(toelichting)}</p>
    </div>
    ${items.length ? renderBevindingen({ bevindingen: items }) : ""}
  `;
}

function getArgumentatieFindings(data) {
  return safeArray(data?.bevindingen).filter((item) => /argument/i.test(String(item.rubriek || "")));
}

function renderRecoveryLabel(bevinding) {
  if (typeof bevinding?.herstelbaar_voor_behandeling !== "boolean") return "";
  return `<span class="recovery-label ${bevinding.herstelbaar_voor_behandeling ? "green" : "red"}">${bevinding.herstelbaar_voor_behandeling ? "Herstelbaar vóór behandeling" : "Vereist nader traject"}</span>`;
}

function renderBevoegdheid(bev = {}) {
  bev = bev || {};
  const oordeel = bev.oordeel || "onduidelijk";
  const labels = {
    ja: "Bevoegdheid aangetoond",
    onduidelijk: "Onduidelijk",
    nee: "Ontbreekt",
    "niet van toepassing": "Niet van toepassing",
  };
  return `
    <div class="bevoegdheid-oordeel ${escClass(oordeel)}">${escHtml(labels[oordeel] || oordeel)}</div>
    <p class="bevoegdheid-toelichting">${escHtml(bev.toelichting || "Geen toelichting beschikbaar.")}</p>
    ${bev.grondslag && bev.grondslag !== "niet gevonden" ? `<p class="bevoegdheid-grondslag">Grondslag: ${escHtml(bev.grondslag)}</p>` : ""}
  `;
}

function renderToegang(data) {
  const rows = [];
  const tc = data?.titelcheck;
  const lb = data?.leesbaarheid;
  const b1 = data?.b1 || data?.taal_b1;

  if (tc?.oordeel) {
    rows.push(renderAccessRow("Titel", tc.oordeel, tc.oordeel === "Duidelijk" ? "ok" : tc.oordeel === "Matig" ? "warn" : "err", tc.suggestie));
  }
  if (lb?.zelfstandig_leesbaar) {
    const cls = lb.zelfstandig_leesbaar === "Zelfstandig leesbaar" ? "ok" : lb.zelfstandig_leesbaar === "Beperkt zelfstandig" ? "warn" : "err";
    const toelichting = String(lb.zonder_bijlagen || "").toLowerCase() === "nee" ? "Kern staat deels alleen in bijlagen" : lb.zonder_bijlagen_toelichting;
    rows.push(renderAccessRow("Leesbaarheid", lb.zelfstandig_leesbaar, cls, toelichting));
  }
  if (b1?.oordeel) {
    const cls = ["Goed", "B1-conform"].includes(b1.oordeel) ? "ok" : b1.oordeel === "Matig" ? "warn" : "err";
    const toelichting = b1.toelichting || (Array.isArray(b1.voorbeelden) ? b1.voorbeelden.slice(0, 2).join(" ") : "");
    rows.push(renderAccessRow("Taal B1", b1.oordeel, cls, toelichting));
  }

  return rows.length ? rows.join("") : `<p class="toeg-leeg">Geen toegankelijkheidsdata beschikbaar.</p>`;
}

function renderAccessRow(label, value, cls, toelichting) {
  return `<div class="toeg-row">
    <div class="toeg-label">${escHtml(label)}</div>
    <div class="toeg-val ${escClass(cls)}">${escHtml(value)}${toelichting ? `<div class="toeg-toelichting">${escHtml(toelichting)}</div>` : ""}</div>
  </div>`;
}

function renderTechnicalDetails(data) {
  const gaps = safeArray(data.gaps_gebruikt);
  const articles = safeArray(data.wetsartikelen_gebruikt);
  const rows = [
    ["Voorsteltype", data.hoofd_type || data.classificatie?.hoofdType || "Onbekend"],
    ["Extra context gebruikt", data.dynamische_context_actief ? "Ja" : "Nee"],
    ["Gaps gebruikt", gaps.length ? gaps.join(", ") : "Geen"],
    ["Juridische context gebruikt", data.juridische_context_actief ? "Ja" : "Nee"],
    ["Wetsartikelen", articles.length ? articles.join(", ") : "Geen"],
    ["Mogelijke bevindingen gevonden in eerste analyse", Number.isFinite(data.kandidaten_count) ? data.kandidaten_count : "Onbekend"],
    ["Verworpen na bewijscheck", Number.isFinite(data.verworpen_kandidaten) ? `${data.verworpen_kandidaten} niet bevestigd na controle op tekstbewijs` : "Onbekend"],
    ["Terugvalroute gebruikt", data.pass2_fallback ? "Ja" : "Nee"],
  ];
  return `<dl>${rows.map(([label, value]) => `<div><dt>${escHtml(label)}</dt><dd>${escHtml(value)}</dd></div>`).join("")}</dl>`;
}

function renderOnderbouwingCompact(data) {
  const sections = extractOnderbouwingSections(data?.onderbouwing || "");
  const advies = sections.advies || "Geen apart advies beschikbaar. Bekijk de volledige onderbouwing.";
  return `
    <div class="advies-block">
      <h4>Advies</h4>
      <p>${escHtml(advies)}</p>
    </div>
    <details class="onderbouwing-details">
      <summary>Volledige onderbouwing tonen</summary>
      <div class="rapport-scroll">${formatOnderbouwing(data?.onderbouwing || "")}</div>
    </details>
  `;
}

function extractOnderbouwingSections(text) {
  const value = String(text || "");
  return {
    aandachtspunten: extractSection(value, "Aandachtspunten"),
    risicos: extractSection(value, "Risico's"),
    advies: extractSection(value, "Advies"),
    volledig: value,
  };
}

function extractSection(text, heading) {
  const value = String(text || "");
  const headings = ["Aandachtspunten", "Risico's", "Advies"];
  const start = value.search(new RegExp(`(^|\\n)\\s*${escapeRegExp(heading)}\\s*\\n?`, "i"));
  if (start === -1) return "";
  const afterHeading = value.slice(start).replace(new RegExp(`^\\s*${escapeRegExp(heading)}\\s*`, "i"), "");
  let end = afterHeading.length;
  headings.filter((item) => item !== heading).forEach((item) => {
    const idx = afterHeading.search(new RegExp(`\\n\\s*${escapeRegExp(item)}\\s*\\n?`, "i"));
    if (idx !== -1 && idx < end) end = idx;
  });
  return afterHeading.slice(0, end).trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderScore(score) {
  if (!score) return;
  const summary = getDecisionSummary(window.lastResult || {});
  const panel = document.getElementById("score-panel");
  const ring = document.getElementById("score-ring");
  const numEl = document.getElementById("score-number");
  const labelEl = document.getElementById("score-label");
  const trustEl = document.getElementById("trust-label");
  const catsEl = document.getElementById("score-cats");
  const circumference = 213.6;
  const offset = circumference - (summary.score / 100) * circumference;
  const kleur = summary.statusClass === "good" ? "#22c55e" : summary.statusClass === "mild" ? "#eab308" : summary.statusClass === "warn" ? "#f59e0b" : "#ef4444";

  ring.style.strokeDashoffset = offset;
  ring.style.stroke = kleur;
  numEl.textContent = summary.score;
  labelEl.textContent = summary.label;
  trustEl.textContent = summary.vertrouwen ? `Analysebetrouwbaarheid: ${summary.vertrouwen}%` : "";
  catsEl.innerHTML = Object.entries(score.onderdelen || {})
    .map(([naam, status]) => `<div class="score-cat"><span class="score-dot ${escClass(status)}"></span><span>${escHtml(naam)}</span></div>`)
    .join("");
  ring.style.transition = "stroke-dashoffset 1s ease, stroke 0.3s ease";
  panel.classList.remove("hidden");
  const sd = document.getElementById("score-divider");
  if (sd) sd.style.display = "";
}

function formatOnderbouwing(tekst) {
  const value = String(tekst || "");
  const secties = ["Aandachtspunten", "Risico's", "Advies"];
  const parts = [];
  let remaining = value;

  secties.forEach((sectie, i) => {
    const idx = remaining.indexOf(sectie);
    if (idx === -1) return;
    const before = remaining.slice(0, idx).trim();
    if (before && i === 0) parts.push(`<p>${escHtml(before)}</p>`);
    const nextIdx = secties.slice(i + 1).reduce((acc, s) => {
      const pos = remaining.indexOf(s, idx + sectie.length);
      return pos !== -1 && (acc === -1 || pos < acc) ? pos : acc;
    }, -1);
    const content = nextIdx !== -1 ? remaining.slice(idx + sectie.length, nextIdx).trim() : remaining.slice(idx + sectie.length).trim();
    parts.push(`<div class="rapport-sectie"><h4>${sectie}</h4><p>${escHtml(content)}</p></div>`);
    remaining = nextIdx !== -1 ? remaining.slice(nextIdx) : "";
  });

  return parts.join("") || `<p>${escHtml(value || "Geen onderbouwing beschikbaar.")}</p>`;
}

function buildPrintableReportHtml(data) {
  const summary = getDecisionSummary(data);
  const b1 = data.b1 || data.taal_b1 || {};
  const bev = data.bevoegdheid || {};
  return `
    <div class="print-document">
      <h1>Kwaliteitstoets raadsvoorstel</h1>
      <h2 class="print-verdict ${escClass(summary.statusClass)}">${escHtml(summary.label)}</h2>
      <p>Datum analyse: ${escHtml(new Date().toLocaleString("nl-NL"))}</p>
      <p>Gemeente: ${escHtml(data.gemeente && data.gemeente !== "Onbekend" ? data.gemeente : "Onbekend")}</p>

      <h2>Oordeel</h2>
      <p>Score: ${escHtml(summary.score)}</p>
      <p>Oordeel: ${escHtml(summary.label)}</p>
      ${summary.vertrouwen ? `<p>Analysebetrouwbaarheid: ${summary.vertrouwen}%</p>` : ""}

      <h2>Kern van het voorstel</h2>
      <p>${escHtml(data.kern || "Geen kernsamenvatting beschikbaar.")}</p>

      <h2>Beslispunten</h2>
      <ol>${safeArray(data.beslispunten).map((punt) => `<li>${escHtml(punt)}</li>`).join("") || "<li>Geen beslispunten herkend.</li>"}</ol>

      <h2>Bevindingen</h2>
      ${safeArray(data.bevindingen).length ? safeArray(data.bevindingen).map((b) => `
        <section>
          <h3>${escHtml(labelForSeverity(b))} - ${escHtml(b.rubriek || "Algemeen")}</h3>
          <p><strong>Bevinding:</strong> ${escHtml(b.bevinding || "")}</p>
          ${b.bewijs ? `<p><strong>Bewijs:</strong> ${escHtml(b.bewijs)}</p>` : ""}
          ${b.herstelactie ? `<p><strong>Herstelactie:</strong> ${escHtml(b.herstelactie)}</p>` : ""}
          ${typeof b.herstelbaar_voor_behandeling === "boolean" ? `<p><strong>Herstelbaar vóór behandeling:</strong> ${b.herstelbaar_voor_behandeling ? "Ja" : "Nee"}</p>` : ""}
        </section>
      `).join("") : "<p>Geen bevestigde bevindingen gevonden.</p>"}

      <h2>Argumentatie</h2>
      ${getArgumentatieFindings(data).length ? getArgumentatieFindings(data).map((b) => `
        <section>
          <h3>${escHtml(labelForSeverity(b))}</h3>
          <p><strong>Bevinding:</strong> ${escHtml(b.bevinding || "")}</p>
          ${b.bewijs ? `<p><strong>Bewijs:</strong> ${escHtml(b.bewijs)}</p>` : ""}
          ${b.herstelactie ? `<p><strong>Herstelactie:</strong> ${escHtml(b.herstelactie)}</p>` : ""}
        </section>
      `).join("") : `<p>${escHtml(data.argumentatie?.toelichting || "Geen afzonderlijke aandachtspunten bij de argumentatielijn gevonden.")}</p>`}

      <h2>Bevoegdheid</h2>
      <p>Oordeel: ${escHtml(bev.oordeel || "Onbekend")}</p>
      <p>Toelichting: ${escHtml(bev.toelichting || "Geen toelichting beschikbaar.")}</p>
      ${bev.grondslag ? `<p>Grondslag: ${escHtml(bev.grondslag)}</p>` : ""}

      <h2>Toegankelijkheid</h2>
      <p>Titel: ${escHtml(data.titelcheck?.oordeel || "Niet beoordeeld")}</p>
      <p>Leesbaarheid: ${escHtml(data.leesbaarheid?.zelfstandig_leesbaar || "Niet beoordeeld")}</p>
      <p>Taal B1: ${escHtml(b1.oordeel || "Niet beoordeeld")}</p>

      <h2>Onderbouwing</h2>
      <div>${formatOnderbouwing(data.onderbouwing || "")}</div>

      <h2>Totstandkoming van de analyse</h2>
      ${renderTechnicalDetails(data)}
    </div>
  `;
}

function exportPdf() {
  if (!window.lastResult || !printReport) return;
  printReport.innerHTML = buildPrintableReportHtml(window.lastResult);
  window.print();
}

function buildPlainTextReport(data) {
  const summary = getDecisionSummary(data);
  const b1 = data.b1 || data.taal_b1 || {};
  const lines = [
    "Kwaliteitstoets raadsvoorstel",
    `Datum analyse: ${new Date().toLocaleString("nl-NL")}`,
    data.gemeente && data.gemeente !== "Onbekend" ? `Gemeente: ${data.gemeente}` : "",
    "",
    `Score: ${summary.score}`,
    `Oordeel: ${summary.label}`,
    summary.vertrouwen ? `Analysebetrouwbaarheid: ${summary.vertrouwen}%` : "",
    "",
    "Kern van het voorstel",
    data.kern || "Geen kernsamenvatting beschikbaar.",
    "",
    "Beslispunten",
    ...safeArray(data.beslispunten).map((punt, index) => `${index + 1}. ${punt}`),
    "",
    "Bevindingen",
  ].filter((line) => line !== "");

  if (!safeArray(data.bevindingen).length) {
    lines.push("- Geen bevestigde bevindingen gevonden.");
  } else {
    safeArray(data.bevindingen).forEach((b, index) => {
      lines.push(`${index + 1}. ${labelForSeverity(b)} - ${b.bevinding || ""}`);
      if (b.rubriek) lines.push(`   Rubriek: ${b.rubriek}`);
      if (b.bewijs) lines.push(`   Bewijs: ${b.bewijs}`);
      if (b.herstelactie) lines.push(`   Herstelactie: ${b.herstelactie}`);
      if (typeof b.herstelbaar_voor_behandeling === "boolean") lines.push(`   Herstelbaar vóór behandeling: ${b.herstelbaar_voor_behandeling ? "ja" : "nee"}`);
    });
  }

  const bev = data.bevoegdheid || {};
  lines.push("", "Bevoegdheid", `Oordeel: ${bev.oordeel || "Onbekend"}`, `Toelichting: ${bev.toelichting || "Geen toelichting beschikbaar."}`);
  if (bev.grondslag) lines.push(`Grondslag: ${bev.grondslag}`);
  lines.push("", "Argumentatie");
  const argumentatieItems = getArgumentatieFindings(data);
  if (argumentatieItems.length) {
    argumentatieItems.forEach((b, index) => {
      lines.push(`${index + 1}. ${b.bevinding || ""}`);
      if (b.bewijs) lines.push(`   Bewijs: ${b.bewijs}`);
      if (b.herstelactie) lines.push(`   Herstelactie: ${b.herstelactie}`);
    });
  } else {
    lines.push(data.argumentatie?.toelichting || "Geen afzonderlijke aandachtspunten bij de argumentatielijn gevonden.");
  }
  lines.push("", "Toegankelijkheid", `Titel: ${data.titelcheck?.oordeel || "Niet beoordeeld"}`, `Leesbaarheid: ${data.leesbaarheid?.zelfstandig_leesbaar || "Niet beoordeeld"}`, `Taal B1: ${b1.oordeel || "Niet beoordeeld"}`);
  lines.push("", "Onderbouwing", stripHtml(formatOnderbouwing(data.onderbouwing || "")));
  lines.push("", "Totstandkoming van de analyse", stripHtml(renderTechnicalDetails(data)));
  return lines.join("\n");
}

async function copyCurrentReport() {
  if (!window.lastResult) return;
  try {
    await copyTextToClipboard(buildPlainTextReport(window.lastResult));
    if (copyFeedback) {
      copyFeedback.textContent = "Gekopieerd ✓";
      setTimeout(() => { copyFeedback.textContent = ""; }, 2000);
    }
  } catch (err) {
    if (copyFeedback) copyFeedback.textContent = "Kopiëren mislukt";
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      // Fallback voor browseromgevingen die clipboard-permissie weigeren.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) throw new Error("Clipboard niet beschikbaar.");
}

function renderGemeente(data) {
  const heeftGemeente = data.gemeente && data.gemeente !== "Onbekend";
  const badge = document.getElementById("gemeente-badge");
  const info = document.getElementById("voorstel-info");
  if (heeftGemeente) {
    document.getElementById("gemeente-naam").textContent = data.gemeente;
    badge?.classList.remove("hidden");
    info?.classList.remove("hidden");
  } else {
    badge?.classList.add("hidden");
    info?.classList.add("hidden");
  }
}

function renderReportActions() {
  const actions = document.getElementById("report-actions");
  if (!actions) return;
  actions.classList.toggle("hidden", !window.lastResult);
}

function getDecisionWarnings(data) {
  return safeArray(data.beslispunten_check).filter((check) => check && check.onderbouwd === false);
}

function normalizeScoreLabel(label, score) {
  if (label === "Verbeterd voor behandeling") return "Verbeteren vóór behandeling";
  if (label) return label;
  if (score >= 85) return "Besluitrijp";
  if (score >= 65) return "Lichte verbeterpunten";
  if (score >= 50) return "Verbeteren vóór behandeling";
  return "Niet besluitrijp";
}

function normalizeErnst(item) {
  return String(item?.ernst || "AANDACHT").toUpperCase();
}

function labelForSeverity(item) {
  const ernst = normalizeErnst(item);
  if (ernst === "BLOKKEREND") return "Blokkerende bevinding";
  if (ernst === "OPTIONEEL") return "Optioneel";
  return "Aandachtspunt";
}

function severityRank(item) {
  const ernst = normalizeErnst(item);
  if (ernst === "BLOKKEREND") return 3;
  if (ernst === "AANDACHT") return 2;
  return 1;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  const tmp = document.createElement("div");
  tmp.innerHTML = value;
  return tmp.textContent || tmp.innerText || "";
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

function escClass(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}
