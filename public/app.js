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

let mode = "pdf";

// ── Scan animatie ──────────────────────────────────────────
const SCAN_STEPS = [
  { label: "Document inladen",         duration: 2200 },
  { label: "Tekst extraheren",         duration: 3500 },
  { label: "Voorstel herkennen",       duration: 5500 },
  { label: "Kwaliteitstoets uitvoeren",duration: 10000 },
  { label: "Onderbouwing opstellen",   duration: null },  // wacht op response
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

  // Beslispunten
  document.getElementById("beslispunten-list").innerHTML =
    (data.beslispunten || []).map(p => `<li>${escHtml(p)}</li>`).join("");

  // Kern
  document.getElementById("kern-text").textContent = data.kern || "";

  renderTitelcheck(data.titelcheck);

  // Bevestigde bevindingen
  const bevindingen = data.bevindingen || [];
  document.getElementById("verbeter-list").innerHTML = bevindingen.length
    ? bevindingen.map(b => `
      <li class="bevinding-item ${escClass(b.ernst)}">
        <strong>${escHtml(b.ernst || "AANDACHT")} · ${escHtml(b.rubriek || "Algemeen")}</strong>
        <span>${escHtml(b.bevinding || "")}</span>
        ${b.bewijs ? `<small>Bewijs: ${escHtml(b.bewijs)}</small>` : ""}
        ${b.herstelactie ? `<small>Herstel: ${escHtml(b.herstelactie)}</small>` : ""}
      </li>`).join("")
    : `<li class="bevinding-item geen">Geen bevestigde bevindingen.</li>`;

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

  statusIdle.classList.add("hidden");
  emptyState.classList.add("hidden");
  resultGrid.classList.remove("hidden");
  resetResultScrollPositions();
}

function renderScore(score) {
  if (!score) return;
  const panel = document.getElementById("score-panel");
  const ring = document.getElementById("score-ring");
  const numEl = document.getElementById("score-number");
  const labelEl = document.getElementById("score-label");
  const trustEl = document.getElementById("trust-label");
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
