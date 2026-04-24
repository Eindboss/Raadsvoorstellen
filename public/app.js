const tabs = document.querySelectorAll(".tab");
const pdfInput = document.getElementById("pdf-input");
const urlInput = document.getElementById("url-input");
const submitBtn = document.getElementById("submit-btn");
const resultSection = document.getElementById("result-section");
const resultContent = document.getElementById("result-content");
const errorSection = document.getElementById("error-section");
const errorMessage = document.getElementById("error-message");
const loadingSection = document.getElementById("loading-section");
const resetBtn = document.getElementById("reset-btn");

let mode = "pdf";

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
  hideAll();
  loadingSection.classList.remove("hidden");
  submitBtn.disabled = true;

  try {
    const formData = new FormData();

    if (mode === "pdf") {
      const file = document.getElementById("pdf-file").files[0];
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

    loadingSection.classList.add("hidden");
    resultContent.textContent = data.result;
    resultSection.classList.remove("hidden");

  } catch (err) {
    loadingSection.classList.add("hidden");
    errorMessage.textContent = err.message;
    errorSection.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
  }
});

resetBtn.addEventListener("click", () => {
  hideAll();
  document.getElementById("pdf-file").value = "";
  document.getElementById("pdf-url").value = "";
});

function hideAll() {
  resultSection.classList.add("hidden");
  errorSection.classList.add("hidden");
  loadingSection.classList.add("hidden");
}
