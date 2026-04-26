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
  { label: "Kandidaten detecteren · Pass 1",   duration: 6000 },
  { label: "Bevindingen valideren · Pass 2",   duration: null },  // wacht op response
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

  renderToegang(data);

  // Bevestigde bevindingen
  renderBevindingen(data);

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
      const statusClass = check && typeof check.onderbouwd === "boolean"
        ? (check.onderbouwd ? "ok" : "warn")
        : "";
      const status = statusClass
        ? `<span class="decision-status ${statusClass}" aria-hidden="true"></span>`
        : "";
      return `<li>${status}<span class="decision-text">${escHtml(punt)}</span></li>`;
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

function renderToegang(data) {
  const el = document.getElementById("toegankelijkheid-content");
  if (!el) return;
  const rows = [];

  const tc = data.titelcheck;
  if (tc && tc.oordeel) {
    const cls = tc.oordeel === "Duidelijk" ? "ok" : tc.oordeel === "Matig" ? "warn" : "err";
    const suggestie = tc.suggestie ? `<div class="toeg-toelichting">${escHtml(tc.suggestie)}</div>` : "";
    rows.push(`<div class="toeg-row">
      <div class="toeg-label">Titel</div>
      <div class="toeg-val ${cls}">${escHtml(tc.oordeel)}${suggestie}</div>
    </div>`);
  }

  const lb = data.leesbaarheid;
  if (lb && lb.zelfstandig_leesbaar) {
    const oordeel = lb.zelfstandig_leesbaar;
    const cls = oordeel === "Zelfstandig leesbaar" ? "ok" : oordeel === "Beperkt zelfstandig" ? "warn" : "err";
    const zonderBijlagen = String(lb.zonder_bijlagen || "").toLowerCase();
    const bijlagen = zonderBijlagen === "nee"
      ? `<div class="toeg-toelichting">Kern staat deels alleen in bijlagen</div>`
      : "";
    rows.push(`<div class="toeg-row">
      <div class="toeg-label">Leesbaarheid</div>
      <div class="toeg-val ${cls}">${escHtml(oordeel)}${bijlagen}</div>
    </div>`);
  }

  const b1 = data.b1 || data.taal_b1;
  if (b1 && b1.oordeel) {
    const cls = ["Goed", "B1-conform"].includes(b1.oordeel) ? "ok" : b1.oordeel === "Matig" ? "warn" : "err";
    const toelichting = b1.toelichting || (Array.isArray(b1.voorbeelden) ? b1.voorbeelden.slice(0, 2).join(" ") : "");
    const toel = toelichting ? `<div class="toeg-toelichting">${escHtml(toelichting)}</div>` : "";
    rows.push(`<div class="toeg-row">
      <div class="toeg-label">Taal B1</div>
      <div class="toeg-val ${cls}">${escHtml(b1.oordeel)}${toel}</div>
    </div>`);
  }

  el.innerHTML = rows.length
    ? rows.join("")
    : `<p class="toeg-leeg">Geen toegankelijkheidsdata beschikbaar.</p>`;
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

  lines.push("", "Indicatieve checks");
  const b1 = data.b1 || data.taal_b1;
  lines.push(`- Taal B1: ${b1?.oordeel || "niet beoordeeld"}`);

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

function resetResultScrollPositions() {
  [
    "#beslispunten-list",
    "#bevoegdheid-content",
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
