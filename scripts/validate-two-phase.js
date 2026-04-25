const fs = require("fs");
const path = require("path");
const { createClient } = require("C:/dev/Toolbox/node_modules/@supabase/supabase-js");

const ROOT = "C:/dev/Raadsvoorstellen";
const TOOLBOX_ENV = "C:/dev/Toolbox/.env.local";
const OUTPUT = path.join(ROOT, "analyse-tweefasige-toets.md");
const TYPE_GAPS = JSON.parse(fs.readFileSync(path.join(ROOT, "public/type-gaps.json"), "utf8"));
const LEGAL_ARTICLES = JSON.parse(fs.readFileSync(path.join(ROOT, "public/legal-articles.json"), "utf8"));
const SUPABASE_URL = "https://ycmkfqduvziydyfnrczj.supabase.co";

const INFO_TYPE_KEYWORDS = {
  financieel: ["financ", "dekking", "kosten", "budget", "raming", "krediet", "begroting"],
  juridisch: ["jurid", "grondslag", "bevoegd", "verordening", "wet", "rechtmatig"],
  planning: ["planning", "tijdpad", "termijn", "mijlpaal", "oplevering"],
  uitvoering: ["uitvoering", "uitvoer", "verantwoord", "stappen", "voortgang"],
  risico: ["risico", "tegenvaller", "overschrijding", "mitiger"],
  governance: ["governance", "sturing", "verantwoording", "toezicht", "rolverdeling"],
  participatie: ["participatie", "inspraak", "betrokken", "stakeholder", "bewoner", "inbreng"],
  alternatieven: ["alternatief", "variant", "afweging", "scenario"],
  definitie: ["definitie", "begrip", "criteria", "afbakening"]
};

function loadEnv(file) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function getGapLimit(hoofdType) {
  return ["beleid-kaderstelling", "financien-penc", "ruimte-grond-vastgoed"].includes(hoofdType) ? 4 : 3;
}

function metadataFor(row, server) {
  const gapLimit = getGapLimit(row.hoofd_type);
  const dynamicContext = server.buildDynamicContext(row.hoofd_type, gapLimit);
  const legalContext = server.buildLegalContext(row.hoofd_type);
  return {
    hoofdType: row.hoofd_type,
    dynamicContext,
    legalContext,
    gapsGebruikt: dynamicContext ? (TYPE_GAPS[row.hoofd_type] || []).slice(0, gapLimit).map(g => g.informatie_type) : [],
    wetsartikelenGebruikt: legalContext ? (LEGAL_ARTICLES[row.hoofd_type] || []).map(a => `${a.wet} art. ${a.artikel}`) : []
  };
}

async function selectRows(supabase) {
  const { data: questions, error: qError } = await supabase
    .from("tb_rv_vragen")
    .select("rv_id,informatie_types")
    .eq("rubric_gap_score", 3)
    .in("staat_al_in_voorstel", ["nee", "deels"])
    .not("rv_id", "is", null)
    .limit(1000);
  if (qError) throw qError;

  const grouped = new Map();
  for (const q of questions || []) {
    const row = grouped.get(q.rv_id) || { rv_id: q.rv_id, types: new Set(), count: 0 };
    for (const type of q.informatie_types || []) row.types.add(type);
    row.count++;
    grouped.set(q.rv_id, row);
  }
  const ids = [...grouped.values()].sort((a, b) => b.types.size - a.types.size || b.count - a.count).slice(0, 30).map(r => r.rv_id);

  const { data: proposals, error: pError } = await supabase
    .from("tb_raadsvoorstellen")
    .select("id,titel,hoofd_type,sub_type,samenvatting")
    .in("id", ids)
    .not("hoofd_type", "is", null);
  if (pError) throw pError;

  const { data: analyses, error: aError } = await supabase
    .from("tb_rv_analyse")
    .select("rv_id,volledige_tekst")
    .in("rv_id", ids);
  if (aError) throw aError;
  const textById = new Map((analyses || []).map(row => [row.rv_id, row.volledige_tekst]));
  const proposalById = new Map((proposals || []).map(row => [row.id, row]));

  return ids.map(id => {
    const proposal = proposalById.get(id);
    const known = grouped.get(id);
    if (!proposal) return null;
    const text = textById.get(id) || proposal.samenvatting || "";
    if (text.length < 500) return null;
    return { ...proposal, text: text.slice(0, 6000), knownTypes: [...known.types] };
  }).filter(Boolean).slice(0, 10);
}

function textForResult(result) {
  return [
    result.onderbouwing,
    (result.verbeterpunten || []).join(" "),
    (result.raadsvragen || []).join(" "),
    (result.bevindingen || []).map(b => `${b.rubriek} ${b.bevinding} ${b.bewijs} ${b.herstelactie}`).join(" "),
    result.advies,
    result.verwachte_raadsvragen?.vragen?.join(" ")
  ].filter(Boolean).join(" ").toLowerCase();
}

function matchedTypes(result, knownTypes) {
  const text = textForResult(result);
  return knownTypes.filter(type => (INFO_TYPE_KEYWORDS[type] || [type]).some(keyword => text.includes(keyword)));
}

function isSpecificAction(action) {
  const value = String(action || "").toLowerCase();
  return value.length >= 45 && /(voeg|beschrijf|benoem|werk|licht|neem|verduidelijk|onderbouw|paragraaf|beslispunt|begroting|krediet|planning|risico)/.test(value);
}

function isSpecificQuestion(question) {
  const value = String(question || "");
  return value.length >= 45 && (value.includes("\"") || /(beslispunt|bedrag|planning|krediet|voorstel|raad|uitvoering|dekking)/i.test(value));
}

async function main() {
  loadEnv(TOOLBOX_ENV);
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ontbreekt");
  if (!process.env.SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY ontbreekt");
  const server = require(path.join(ROOT, "server.js"));
  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const rows = await selectRows(supabase);

  const results = [];
  for (const row of rows) {
    const metadata = metadataFor(row, server);
    console.log(`[validate] ${row.id} ${row.hoofd_type} ${row.titel}`);
    const oldResult = await server.callOpenAIOld(row.text, metadata);
    const newResult = await server.callOpenAI(row.text, metadata);
    const oldMatches = matchedTypes(oldResult, row.knownTypes);
    const newMatches = matchedTypes(newResult, row.knownTypes);
    const bevindingen = newResult.bevindingen || [];
    const questions = newResult.verwachte_raadsvragen?.vragen || [];
    results.push({
      id: row.id,
      titel: row.titel,
      hoofd_type: row.hoofd_type,
      knownTypes: row.knownTypes,
      oldMatches,
      newMatches,
      kandidaten: newResult.kandidaten_count || 0,
      verworpen: newResult.verworpen_kandidaten || 0,
      bevindingen: bevindingen.length,
      bewijs: bevindingen.filter(b => String(b.bewijs || "").trim().length >= 12).length,
      concreteActies: bevindingen.filter(b => isSpecificAction(b.herstelactie)).length,
      vragen: questions.length,
      specifiekeVragen: questions.filter(isSpecificQuestion).length,
      score: newResult.score?.totaal,
      vertrouwen: newResult.vertrouwen,
      fallback: Boolean(newResult.pass2_fallback)
    });
  }

  const knownTotal = results.reduce((sum, r) => sum + r.knownTypes.length, 0);
  const oldRecall = knownTotal ? results.reduce((sum, r) => sum + r.oldMatches.length, 0) / knownTotal : 0;
  const newRecall = knownTotal ? results.reduce((sum, r) => sum + r.newMatches.length, 0) / knownTotal : 0;
  const bevindingTotal = results.reduce((sum, r) => sum + r.bevindingen, 0);
  const bewijsRatio = bevindingTotal ? results.reduce((sum, r) => sum + r.bewijs, 0) / bevindingTotal : 0;
  const actieRatio = bevindingTotal ? results.reduce((sum, r) => sum + r.concreteActies, 0) / bevindingTotal : 0;
  const vraagTotal = results.reduce((sum, r) => sum + r.vragen, 0);
  const vraagRatio = vraagTotal ? results.reduce((sum, r) => sum + r.specifiekeVragen, 0) / vraagTotal : 0;
  const scores = results.map(r => r.score).filter(Number.isFinite);
  const scoreMin = Math.min(...scores);
  const scoreMax = Math.max(...scores);

  const ok = bewijsRatio >= 0.8
    && (oldRecall - newRecall) <= 0.10
    && scoreMin <= 50
    && scoreMax >= 60
    && new Set(scores).size >= 2
    && vraagRatio >= 0.8
    && results.every(r => !r.fallback);

  const lines = [];
  lines.push("# Analyse tweefasige toets");
  lines.push("");
  lines.push(`Datum: ${new Date().toISOString()}`);
  lines.push(`Steekproef: ${results.length} voorstellen met score-3 gaps`);
  lines.push("");
  lines.push("## Samenvatting");
  lines.push("");
  lines.push(`- Oude recall: ${(oldRecall * 100).toFixed(1)}%`);
  lines.push(`- Nieuwe recall: ${(newRecall * 100).toFixed(1)}%`);
  lines.push(`- Recall-delta: ${((newRecall - oldRecall) * 100).toFixed(1)}pp`);
  lines.push(`- Bevindingen met bewijs: ${(bewijsRatio * 100).toFixed(1)}%`);
  lines.push(`- Concrete herstelacties: ${(actieRatio * 100).toFixed(1)}%`);
  lines.push(`- Voorstel-specifieke raadsvragen: ${(vraagRatio * 100).toFixed(1)}%`);
  lines.push(`- Scorespreiding: ${scoreMin}-${scoreMax}`);
  lines.push(`- Pass 2 fallbacks: ${results.filter(r => r.fallback).length}`);
  lines.push(`- Kwaliteitscriteria gehaald: ${ok ? "ja" : "nee"}`);
  lines.push("");
  lines.push("## Detailtabel");
  lines.push("");
  lines.push("| id | type | bekende gaps | oud treft | nieuw treft | kandidaten | verworpen | bevindingen | bewijs | score | vragen specifiek |");
  lines.push("|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|");
  for (const r of results) {
    lines.push(`| ${r.id} | ${r.hoofd_type} | ${r.knownTypes.join(", ")} | ${r.oldMatches.join(", ") || "-"} | ${r.newMatches.join(", ") || "-"} | ${r.kandidaten} | ${r.verworpen} | ${r.bevindingen} | ${r.bewijs}/${r.bevindingen} | ${r.score} | ${r.specifiekeVragen}/${r.vragen} |`);
  }
  lines.push("");
  lines.push("## Oordeel");
  lines.push("");
  lines.push(ok
    ? "De tweefasige toets haalt de criteria. Pass 2 verwijdert brede kandidaatbevindingen, de resterende bevindingen hebben bewijs, de score spreidt zichtbaar en de raadsvragen zijn grotendeels voorstel-specifiek."
    : "De tweefasige toets haalt de criteria nog niet. De belangrijkste oorzaak staat in de samenvatting hierboven; pas prompt, scoring of vraaggeneratie aan en draai opnieuw.");
  fs.writeFileSync(OUTPUT, lines.join("\n"));
  console.log(`Analyse geschreven: ${OUTPUT}`);
  if (!ok) process.exitCode = 2;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
