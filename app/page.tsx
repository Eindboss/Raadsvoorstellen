"use client";

import { useState, useRef } from "react";

type Status = "idle" | "loading" | "done" | "error";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [inputMode, setInputMode] = useState<"pdf" | "url">("pdf");
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setResult("");
    setError("");

    try {
      const formData = new FormData();

      if (inputMode === "pdf") {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error("Selecteer een PDF-bestand.");
        formData.append("pdf", file);
      } else {
        if (!url.trim()) throw new Error("Voer een geldige URL in.");
        formData.append("url", url.trim());
      }

      const res = await fetch("/api/toets", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Er ging iets mis.");

      setResult(data.result);
      setStatus("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Onbekende fout.");
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Raadsvoorstel Kwaliteitstoets
        </h1>
        <p className="text-gray-500 mb-8">
          Upload een raadsvoorstel als PDF of voer een URL in. U ontvangt een
          formele kwaliteitstoets op volledigheid, consistentie en
          besluitrijpheid.
        </p>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInputMode("pdf")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                inputMode === "pdf"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              PDF uploaden
            </button>
            <button
              type="button"
              onClick={() => setInputMode("url")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                inputMode === "url"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              URL invoeren
            </button>
          </div>

          {inputMode === "pdf" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PDF-bestand
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL van het raadsvoorstel (PDF)
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === "loading" ? "Bezig met toetsen…" : "Kwaliteitstoets uitvoeren"}
          </button>
        </form>

        {status === "error" && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {status === "loading" && (
          <div className="mt-8 text-center text-gray-500 text-sm animate-pulse">
            Raadsvoorstel wordt geanalyseerd. Dit duurt ongeveer 30 seconden…
          </div>
        )}

        {status === "done" && result && (
          <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resultaat</h2>
            <div className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
              {result}
            </div>
            <button
              onClick={() => { setStatus("idle"); setResult(""); }}
              className="mt-6 text-sm text-blue-600 hover:underline"
            >
              Nieuw raadsvoorstel toetsen
            </button>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-gray-400">
          De toets beoordeelt uitsluitend formele kwaliteit — niet de politieke inhoud.
        </p>
      </div>
    </main>
  );
}
