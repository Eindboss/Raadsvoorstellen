const fs = require("fs");
const path = require("path");
const { createClient } = require("C:/dev/Toolbox/node_modules/@supabase/supabase-js");

const ROOT = "C:/dev/Raadsvoorstellen";
const TOOLBOX_ENV = "C:/dev/Toolbox/.env.local";
const SUPABASE_URL = "https://ycmkfqduvziydyfnrczj.supabase.co";
const OUTPUT = path.join(ROOT, "onderzoek-7-2-patroon.md");
const TYPE_GAPS = JSON.parse(fs.readFileSync(path.join(ROOT, "public/type-gaps.json"), "utf8"));
const LEGAL_ARTICLES = JSON.parse(fs.readFileSync(path.join(ROOT, "public/legal-articles.json"), "utf8"));

const TARGETS = [
  { label: "procedureel: zienswijze", type: "zienswijze-verbonden-partijen" },
  { label: "procedureel: personeel/organisatie", type: "personeel-organisatie" },
  { label: "complex financieel", type: "financien-penc" },
  { label: "beleidsnota", type: "beleid-kaderstelling" },
  { label: "ruimte/grond/vastgoed", type: "ruimte-grond-vastgoed" }
];

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

function getGapLimit(type) {
  return ["beleid-kaderstelling", "financien-penc", "ruimte-grond-vastgoed"].includes(type) ? 4 : 3;
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

async function fetchCandidateForType(supabase, type) {
  const { data: proposals, error } = await supabase
    .from("tb_raadsvoorstellen")
    .select("id,titel,hoofd_type,sub_type,samenvatting")
    .eq("hoofd_type", type)
    .limit(30);
  if (error) throw error;
  const ids = (proposals || []).map(row => row.id);
  if (!ids.length) return null;
  const { data: analyses, error: textError } = await supabase
    .from("tb_rv_analyse")
    .select("rv_id,volledige_tekst")
    .in("rv_id", ids);
  if (textError) throw textError;
  const textById = new Map((analyses || []).map(row => [row.rv_id, row.volledige_tekst]));
  for (const proposal of proposals || []) {
    const text = textById.get(proposal.id) || proposal.samenvatting || "";
    if (text.length >= 500) return { ...proposal, text: text.slice(0, 6000) };
  }
  return null;
}

async function main() {
  loadEnv(TOOLBOX_ENV);
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ontbreekt");
  if (!process.env.SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY ontbreekt");
  const server = require(path.join(ROOT, "server.js"));
  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const rows = [];
  for (const target of TARGETS) {
    const row = await fetchCandidateForType(supabase, target.type);
    if (row) rows.push({ ...row, test_label: target.label });
  }

  const results = [];
  for (const row of rows) {
    console.log(`[investigate] ${row.test_label}: ${row.id} ${row.titel}`);
    const result = await server.callOpenAI(row.text, metadataFor(row, server));
    results.push({
      id: row.id,
      titel: row.titel,
      label: row.test_label,
      type: row.hoofd_type,
      kandidaten: result.kandidaten_count || 0,
      verworpen: result.verworpen_kandidaten || 0,
      bevindingen: (result.bevindingen || []).length,
      score: result.score?.totaal,
      fallback: Boolean(result.pass2_fallback)
    });
  }

  const lines = [];
  lines.push("# Onderzoek 7/2-patroon tweefasige toets");
  lines.push("");
  lines.push(`Datum: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Variatietest na herstel");
  lines.push("");
  lines.push("| test | id | type | titel | kandidaten | verworpen | bevindingen | score | fallback |");
  lines.push("|---|---:|---|---|---:|---:|---:|---:|---|");
  for (const r of results) {
    lines.push(`| ${r.label} | ${r.id} | ${r.type} | ${String(r.titel || "").replace(/\|/g, "/")} | ${r.kandidaten} | ${r.verworpen} | ${r.bevindingen} | ${r.score} | ${r.fallback ? "ja" : "nee"} |`);
  }
  fs.writeFileSync(OUTPUT, lines.join("\n"));
  console.log(`Onderzoek geschreven: ${OUTPUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
