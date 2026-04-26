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
const copyReportBtn = document.getElementById("copy-report-btn");
const copyFeedback = document.getElementById("copy-feedback");

let mode = "pdf";

// ── Scan animatie ──────────────────────────────────────────
const SCAN_STEPS = [
  { label: "Document inladen",                 duration: 2000 },
  { label: "Tekst extraheren",                 duration: 3000 },
  { label: "Voorstel classificeren",           duration: 4000 },
  { label: "Kandidaten detecteren - Pass 1",   duration: 6000 },
  { label: "Bevindingen valideren - Pass 2",   duration: null },  // wacht op response
];

let scanTimers = [];

function startScanAnimation() {
  const stepEls = document.querySelectorAll(".scan-step");
  stepEls.forEach(el => el.className = "scan-step");

  let current = 0;
  stepEls[0].classList.add("active");

  function advance() {
    if (current >= stepEls.length - 1) return;
    stepEls[current].classList.remove("active");
    stepEls[current].classList.add("done");
    current++;
    stepEls[current].classList.add("active");
    const next = SCAN_STEPS[current];
    if (next && next.duration) {
      scanTimers.push(setTimeout(advance, next.duration));
    }
  }

  const first = SCAN_STEPS[0];
  if (first.duration) {
    scanTimers.push(setTimeout(advance, first.duration));
  }
}

function stopScanAnimation() {
  scanTimers.forEach(t => clearTimeout(t));
  scanTimers = [];
  // Alle stappen afronden
  document.querySelectorAll(".scan-step").forEach(el => {
    el.classList.remove("active");
    el.classList.add("done");
  });
}

// Klik op file-name opent file dialog
fileNameEl.addEventListener("click", () => pdfFileInput.click());

pdfFileInput.addEventListener("change", () => {
  const file = pdfFileInput.files[0];
  if (file) {
    fileNameEl.textContent = file.name;
    fileNameEl.classList.add("has-file");
  } else {
    fileNameEl.textContent = "Geen bestand gekozen";
    fileNameEl.classList.remove("has-file");
  }
});

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    mode = tab.dataset.mode;
    pdfInput.classList.toggle("hidden", mode !== "pdf");
    urlInput.classList.toggle("hidden", mode !== "url");
  });
});

copyReportBtn?.addEventListener("click", async () => {
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
  window.lastResult = data;

  renderBeslispunten(data);

  // Kern
  document.getElementById("kern-text").textContent = data.kern || "";

  renderTitelcheck(data.titelcheck);
  renderLeesbaarheid(data.leesbaarheid);

  // Bevestigde bevindingen
  renderBevindingen(data);

  // Raadsvragen
  const vragen = data.verwachte_raadsvragen?.vragen || data.raadsvragen || [];
  document.getElementById("vragen-list").innerHTML = vragen.length
    ? vragen.map(v => `<li>${escHtml(v)}</li>`).join("")
    : `<li class="vragen-leeg">Geen vragen gegenereerd voor dit type voorstel.</li>`;

  // Gemeente
  const heeftGemeente = data.gemeente && data.gemeente !== "Onbekend";
  if (heeftGemeente) {
    document.getElementById("gemeente-naam").textContent = data.gemeente;
    document.getElementById("gemeente-badge").classList.remove("hidden");
  }

  if (heeftGemeente) {
    document.getElementById("voorstel-info").classList.remove("hidden");
  }

  // Bevoegdheid
  const bev = data.bevoegdheid || {};
  const oordeel = bev.oordeel || "onduidelijk";
  const labels = {
    ja: "Bevoegdheid aangetoond",
    onduidelijk: "Onduidelijk",
    nee: "Ontbreekt",
    "niet van toepassing": "Niet van toepassing"
  };
  document.getElementById("bevoegdheid-content").innerHTML = `
    <div class="bevoegdheid-oordeel ${oordeel}">${labels[oordeel] || oordeel}</div>
    <p class="bevoegdheid-toelichting">${escHtml(bev.toelichting || "")}</p>
    ${bev.grondslag && bev.grondslag !== "niet gevonden"
      ? `<p class="bevoegdheid-grondslag">Grondslag: ${escHtml(bev.grondslag)}</p>`
      : ""}
  `;

  // Onderbouwing
  document.getElementById("rapport-content").innerHTML =
    formatOnderbouwing(data.onderbouwing || "");

  renderScore(data.score);
  renderQualityIndicators(data);
  renderReportActions();

  statusIdle.classList.add("hidden");
  emptyState.classList.add("hidden");
  resultGrid.classList.remove("hidden");
  resetResultScrollPositions();
}

function renderBeslispunten(data) {
  const beslispunten = data.beslispunten || [];
  const checks = data.beslispunten_check || [];
  document.getElementById("beslispunten-list").innerHTML = beslispunten
    .map((punt, index) => {
      const check = findBeslispuntCheck(punt, checks, index);
      const status = check && typeof check.onderbouwd === "boolean"
        ? `<span class="decision-status ${check.onderbouwd ? "ok" : "warn"}">${check.onderbouwd ? "✓" : "⚠"}</span>`
        : "";
      const missing = check && check.onderbouwd === false && check.ontbrekende_onderbouwing
        ? `<div class="decision-missing">${escHtml(check.ontbrekende_onderbouwing)}</div>`
        : "";
      return `<li>${status}<span class="decision-text">${escHtml(punt)}</span>${missing}</li>`;
    })
    .join("");
}

function findBeslispuntCheck(punt, checks, index) {
  if (!Array.isArray(checks) || !checks.length) return null;
  if (checks[index]) return checks[index];
  const normalized = normalizeText(punt);
  return checks.find(check => {
    const candidate = normalizeText(check.beslispunt || "");
    return candidate && (candidate.includes(normalized) || normalized.includes(candidate));
  }) || null;
}

function renderBevindingen(data) {
  const bevindingen = data.bevindingen || [];
  const blokkerend = bevindingen.filter(b => String(b.ernst || "").toUpperCase() === "BLOKKEREND").length;
  const banner = document.getElementById("blocking-banner");
  if (banner) {
    if (blokkerend) {
      banner.textContent = `${blokkerend} blokkerende bevinding${blokkerend === 1 ? "" : "en"} - voorstel is niet besluitrijp`;
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
      banner.textContent = "";
    }
  }

  document.getElementById("verbeter-list").innerHTML = bevindingen.length
    ? bevindingen.map(b => `
      <li class="bevinding-item ${escClass(b.ernst)}">
        <strong>${escHtml(b.ernst || "AANDACHT")} · ${escHtml(b.rubriek || "Algemeen")}</strong>
        ${renderRecoveryLabel(b)}
        <span>${escHtml(b.bevinding || "")}</span>
        ${b.bewijs ? `<small>Bewijs: ${escHtml(b.bewijs)}</small>` : ""}
        ${b.herstelactie ? `<small>Herstel: ${escHtml(b.herstelactie)}</small>` : ""}
      </li>`).join("")
    : `<li class="bevinding-item geen">Geen bevestigde bevindingen.</li>`;
}

function renderRecoveryLabel(bevinding) {
  if (typeof bevinding.herstelbaar_voor_behandeling !== "boolean") return "";
  const herstelbaar = bevinding.herstelbaar_voor_behandeling;
  return `<span class="recovery-label ${herstelbaar ? "green" : "red"}">${herstelbaar ? "Herstelbaar vóór behandeling" : "Vereist nader traject"}</span>`;
}

function renderScore(score) {
  if (!score) return;
  const panel = document.getElementById("score-panel");
  const ring = document.getElementById("score-ring");
  const numEl = document.getElementById("score-number");
  const labelEl = document.getElementById("score-label");
  const trustEl = document.getElementById("trust-label");
  const candidateEl = document.getElementById("candidate-label");
  const catsEl = document.getElementById("score-cats");

  const totaal = score.totaal || 0;
  const circumference = 213.6;
  const offset = circumference - (totaal / 100) * circumference;

  // Kleur op basis van gecalibreerde scorebanden
  const kleur = totaal >= 85 ? "#22c55e" : totaal >= 65 ? "#eab308" : totaal >= 50 ? "#f59e0b" : "#ef4444";
  const label = window.lastResult?.score_label || (totaal >= 85 ? "Besluitrijp" : totaal >= 65 ? "Lichte verbeterpunten" : totaal >= 50 ? "Verbeterd voor behandeling" : "Niet besluitrijp");

  ring.style.strokeDashoffset = offset;
  ring.style.stroke = kleur;
  numEl.textContent = totaal;
  labelEl.textContent = label;
  if (trustEl) {
    const vertrouwen = window.lastResult?.vertrouwen;
    trustEl.textContent = Number.isFinite(vertrouwen) ? `Analysebetrouwbaarheid: ${vertrouwen}%` : "";
  }
  if (candidateEl) {
    const verworpen = window.lastResult?.verworpen_kandidaten;
    const bevindingen = window.lastResult?.bevindingen || [];
    candidateEl.textContent = Number.isFinite(verworpen)
      ? `${verworpen + bevindingen.length} kandidaten geanalyseerd · ${verworpen} verworpen na bewijscheck`
      : "";
  }

  // Categorieën
  catsEl.innerHTML = Object.entries(score.onderdelen || {})
    .map(([naam, status]) => `
      <div class="score-cat">
        <span class="score-dot ${status}"></span>
        <span>${naam}</span>
      </div>`)
    .join("");

  // Animeer ring
  ring.style.transition = "stroke-dashoffset 1s ease, stroke 0.3s ease";

  panel.classList.remove("hidden");
  const sd = document.getElementById("score-divider");
  if (sd) sd.style.display = "";
}

function formatOnderbouwing(tekst) {
  const secties = ["Aandachtspunten", "Risico's", "Advies"];
  const parts = [];
  let remaining = tekst;

  secties.forEach((sectie, i) => {
    const idx = remaining.indexOf(sectie);
    if (idx === -1) return;
    const before = remaining.slice(0, idx).trim();
    if (before && i === 0) parts.push(`<p>${escHtml(before)}</p>`);
    const nextIdx = secties.slice(i + 1).reduce((acc, s) => {
      const pos = remaining.indexOf(s, idx + sectie.length);
      return pos !== -1 && (acc === -1 || pos < acc) ? pos : acc;
    }, -1);
    const content = nextIdx !== -1
      ? remaining.slice(idx + sectie.length, nextIdx).trim()
      : remaining.slice(idx + sectie.length).trim();
    parts.push(`<div class="rapport-sectie"><h4>${sectie}</h4><p>${escHtml(content)}</p></div>`);
    remaining = nextIdx !== -1 ? remaining.slice(nextIdx) : "";
  });

  return parts.join("") || `<p>${escHtml(tekst)}</p>`;
}

function renderTitelcheck(titelcheck) {
  const el = document.getElementById("titelcheck-line");
  if (!el) return;
  if (!titelcheck || !titelcheck.oordeel) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  const suggestie = titelcheck.suggestie ? ` · Suggestie: ${titelcheck.suggestie}` : "";
  el.textContent = `Titel: ${titelcheck.oordeel}${suggestie}`;
  el.className = `titelcheck-line ${badgeClass(titelcheck.oordeel, ["Duidelijk"], ["Matig"])}`;
}

function renderLeesbaarheid(leesbaarheid) {
  const el = document.getElementById("leesbaarheid-line");
  if (!el) return;
  if (!leesbaarheid || !leesbaarheid.zelfstandig_leesbaar) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  const oordeel = leesbaarheid.zelfstandig_leesbaar;
  const cls = badgeClass(oordeel, ["Zelfstandig leesbaar"], ["Beperkt zelfstandig"]);
  const bijlagen = String(leesbaarheid.zonder_bijlagen || "").toLowerCase() === "nee"
    ? `<span class="attachment-warning">Kern staat deels alleen in bijlagen</span>`
    : "";
  el.innerHTML = `<span class="readability-badge ${cls}">${escHtml(oordeel)}</span>${bijlagen}`;
  el.className = "leesbaarheid-line";
}

function renderQualityIndicators(data) {
  window.lastResult = data;
  const el = document.getElementById("quality-badges");
  if (!el) return;
  const badges = [];
  if (data.taal_b1?.oordeel) badges.push({ label: "Taal B1", value: `${data.taal_b1.oordeel} · indicatief`, cls: badgeClass(data.taal_b1.oordeel, ["B1-conform"], ["Matig"]) });
  if (data.wcag?.oordeel) badges.push({ label: "WCAG", value: `${data.wcag.oordeel} · indicatief`, cls: badgeClass(data.wcag.oordeel, ["Toegankelijk"], ["Aandachtspunten"]) });
  if (data.juridische_context_actief) badges.push({ label: "Juridisch", value: "referentie actief", cls: "neutral" });
  el.innerHTML = badges.map(b => `<div class="quality-badge ${b.cls}"><span>${escHtml(b.label)}</span>${escHtml(b.value)}</div>`).join("");
}

function renderReportActions() {
  const actions = document.getElementById("report-actions");
  if (!actions) return;
  actions.classList.toggle("hidden", !window.lastResult);
}

function buildPlainTextReport(data) {
  const title = data.kern || data.beslispunten?.[0] || "Raadsvoorstel";
  const score = data.score?.totaal ?? "-";
  const lines = [
    title,
    "",
    `Score: ${score} - ${data.score_label || ""}`.trim(),
    data.vertrouwen ? `Analysebetrouwbaarheid: ${data.vertrouwen}%` : "",
    "",
    "Bevindingen"
  ].filter(Boolean);

  const bevindingen = data.bevindingen || [];
  if (!bevindingen.length) {
    lines.push("- Geen bevestigde bevindingen.");
  } else {
    bevindingen.forEach((b, index) => {
      lines.push(`${index + 1}. ${b.ernst || "AANDACHT"} - ${b.bevinding || ""}`);
      if (b.bewijs) lines.push(`   Bewijs: ${b.bewijs}`);
      if (b.herstelactie) lines.push(`   Herstelactie: ${b.herstelactie}`);
      if (typeof b.herstelbaar_voor_behandeling === "boolean") {
        lines.push(`   Herstelbaar: ${b.herstelbaar_voor_behandeling ? "ja, vóór behandeling" : "nee, vereist nader traject"}`);
      }
    });
  }

  const vragen = data.verwachte_raadsvragen?.vragen || data.raadsvragen || [];
  lines.push("", "Verwachte raadsvragen");
  if (vragen.length) vragen.forEach((vraag, index) => lines.push(`${index + 1}. ${vraag}`));
  else lines.push("- Geen raadsvragen gegenereerd.");

  lines.push("", "Indicatieve checks");
  lines.push(`- Taal B1: ${data.taal_b1?.oordeel || "niet beoordeeld"}`);
  lines.push(`- WCAG: ${data.wcag?.oordeel || "niet beoordeeld"}${data.wcag?.indicatief ? " (indicatief)" : ""}`);

  return lines.join("\n");
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

function badgeClass(value, greenValues, amberValues) {
  if (greenValues.includes(value)) return "green";
  if (amberValues.includes(value)) return "amber";
  return "red";
}

function resetResultScrollPositions() {
  [
    "#beslispunten-list",
    "#bevoegdheid-content",
    "#vragen-list",
    "#verbeter-list",
    ".rapport-scroll"
  ].forEach(selector => {
    document.querySelector(selector)?.scrollTo({ top: 0, left: 0 });
  });
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function escClass(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}
