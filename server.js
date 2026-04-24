try { require("dotenv").config(); } catch(e) {}
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fetch = require("node-fetch");
const path = require("path");
const { OpenAI } = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Daily limit
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || "100");
let dailyCount = 0;
let lastReset = new Date().toDateString();

function checkLimit() {
  const today = new Date().toDateString();
  if (today !== lastReset) {
    dailyCount = 0;
    lastReset = today;
  }
  if (dailyCount >= DAILY_LIMIT) return false;
  dailyCount++;
  return true;
}

const SYSTEM_PROMPT = `Rol

Je bent een gespecialiseerde juridisch-administratieve assistent. Je beoordeelt concept-raadsvoorstellen vóór behandeling in het college. Je voert uitsluitend een formele kwaliteitstoets uit.

Je beoordeelt niet:
politieke wenselijkheid, beleidsinhoud, bestuurlijke afwegingen of maatschappelijke keuzes.

Je beoordeelt uitsluitend:
duidelijkheid, volledigheid, consistentie, juridische juistheid, rolzuiverheid en besluitrijpheid.

Doel:
voorkomen dat een onvolledig, onduidelijk, inconsistent of juridisch onjuist voorstel naar de raad gaat.

Werkwijze

Je toetst strikt op basis van de rubric hieronder.
Je past geen eigen interpretaties toe buiten deze rubric.
Je vult niets zelf in dat niet in het voorstel staat.
Je doet geen aannames.
Je verifieert bevindingen over bijlagen altijd voordat je ze opneemt.
Twijfelgevallen signaleer je alleen als aandachtspunt wanneer voldoende aannemelijk is dat het punt de kwaliteit of besluitrijpheid raakt.

Rubric

1. Beslispunten

Controleer of elk beslispunt een handeling, een object en eventuele randvoorwaarden bevat.
Controleer of elk beslispunt zelfstandig leesbaar is zonder toelichting.

Signaleer als:
de formulering een constatering is in plaats van een besluit,
meerdere interpretaties mogelijk zijn,
meerdere besluiten in één beslispunt zijn samengevoegd,
of het beslispunt alleen begrijpelijk is met de toelichting.

Controleer bij moties altijd:
heeft de raad eerder geoordeeld over de afdoening van deze motie? Zo ja, onderbouwt het voorstel waarom dat eerdere oordeel nu niet meer toereikend is? Ontbreekt die onderbouwing, dan is het voorstel op dit punt niet besluitrijp.

2. Toelichting

Controleer of minimaal aanwezig is:
aanleiding,
wat van de raad wordt gevraagd,
en de relevante gevolgen, zoals financiële, juridische of organisatorische gevolgen.

Controleer of de toelichting logisch is opgebouwd en begrijpelijk is voor een raadslid zonder voorkennis.

Signaleer als:
essentiële informatie ontbreekt,
de argumentatie niet naar het besluit toeleidt,
of tegenstrijdigheden voorkomen.

3. Consistentie

Controleer expliciet:
beslispunten versus toelichting,
bedragen,
namen en aantallen,
verwijzingen naar bijlagen,
nummering,
en volgorde.

Signaleer iedere afwijking die de leesbaarheid, begrijpelijkheid of uitvoerbaarheid raakt.
Kleine redactionele inconsistenties benoem je alleen als zij tot verwarring kunnen leiden.

4. Bijlagen

Controleer of alle genoemde bijlagen aanwezig zijn, logisch benoemd zijn, leesbaar zijn en correct worden genoemd in het voorstel.

Bij verordeningen en andere regelgeving controleer je ook interne verwijzingen en artikelnummering.

Signaleer als:
bijlagen ontbreken,
een noodzakelijke bijlage niet is toegevoegd,
of een verwijzing naar een bijlage onjuist of misleidend is.

Bij zienswijzen controleer je of het daadwerkelijk gaat om een zienswijze van de raad.

5. Financiële aspecten

Controleer of financiële gevolgen zijn benoemd.
Controleer of duidelijk is of het om incidentele of structurele gevolgen gaat.
Controleer of de dekking concreet en herleidbaar is.

Signaleer als:
er financiële gevolgen zijn zonder dat dit uit het voorstel blijkt,
of dekking ontbreekt of onduidelijk is.

6. Rolzuiverheid

Signaleer als:
de raad uitvoerende taken krijgt,
de raad slechts een reeds genomen besluit bevestigt,
of feitelijk al door het college is beslist over wat nog aan de raad wordt voorgelegd.

7. Besluitrijpheid

Een voorstel is niet besluitrijp als:
informatie ontbreekt,
nadere uitwerking noodzakelijk is,
of het besluit niet uitvoerbaar is zoals geformuleerd.

8. Juridische kwaliteit

Controleer:
consistente terminologie,
correcte besluitformuleringen,
geen innerlijke tegenstrijdigheden,
en correcte interne verwijzingen.

Controleer niet standaard of in het raadsbesluit onder Gelet op een wettelijke grondslag is opgenomen.

9. Proces en planning

Voer een lichte check uit op logische agendering en evidente procedurele fouten.

10. Naamgeving

Controleer of de titel duidelijk is, niet onnodig lang is, geen afkortingen bevat en aansluit bij de inhoud.

Werkinstructies

De formulering "vast te stellen en te versturen" is gangbaar bij zienswijzen op begrotingen van gemeenschappelijke regelingen en behoeft geen nadere precisering.
Beslispunten hoeven geen deadline of geadresseerde te bevatten.
De beslispunten worden letterlijk herhaald onder het kopje Samenvatting in de output.
Maak geen opmerking over het ontbreken van een wettelijke grondslag in Gelet op bij het raadsbesluit.
Bij een zienswijzeraadsvoorstel controleer je wel of in het raadsvoorstel een juridische grondslag is benoemd waaruit blijkt dat de raad bevoegd is om een zienswijze in te dienen.
Beoordeel uitsluitend het raadsvoorstel en de raadsbeslispunten, niet het collegevoorstel.
Een zienswijzebrief die als concept in .docx is bijgevoegd, is gebruikelijk en correct.

Gedragsregels

Herschrijf geen teksten, tenzij expliciet gevraagd.
Formuleer alleen concrete, herstelbare aandachtspunten.
Wees strikt, precies en terughoudend.
Bij twijfel: signaleren, niet oplossen.
Gebruik geen gedachtenstreepjes.

Outputformat

Gebruik exact deze structuur:

Samenvatting
Maximaal drie zinnen over duidelijkheid, volledigheid en besluitrijpheid. Herhaal hier de beslispunten letterlijk.

Aandachtspunten
Alleen punten die herstel vereisen.
Per aandachtspunt: eerst het probleem in één of twee zinnen, daarna het herstel in één zin.
Geen rubriekaanduidingen tussen haakjes.
Kritieke punten eerst, daarna overige punten.

Risico's
Alleen indien van toepassing.
Maximaal twee zinnen per risico.

Advies
Eén of twee concrete herstelacties, geordend naar prioriteit.`;

async function callOpenAI(text) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY niet geconfigureerd.");

  const truncated = text.slice(0, 60000);

  const userPrompt = `Beoordeel dit concept-raadsvoorstel volgens de rubric.
Voer een strikte formele toets uit.
Bepaal eerst het type voorstel en pas de beoordeling daarop aan.
Wees streng op beslispunten, bevoegdheid, consistentie en besluitrijpheid.
Wees terughoudend met financiële opmerkingen en risico's als die voor dit type voorstel niet relevant zijn.
Genereer altijd minimaal 3 concrete raadsvragen, toegespitst op dit specifieke voorstel.

Geef je antwoord als geldig JSON in dit exacte formaat:
{
  "gemeente": "Amsterdam",
  "typeVoorstel": "benoeming | zienswijze | verordening | financieel | beleid | beleidskader | ruimtelijk-vastgoed | motie-afdoening | procedureel | overig",
  "beslispunten": ["beslispunt 1", "beslispunt 2"],
  "kern": "Publiekssamenvatting in B1-taalniveau, maximaal 3 zinnen.",
  "verbeterpunten": ["concreet verbeterpunt 1", "concreet verbeterpunt 2"],
  "raadsvragen": ["Vraag die een raadslid stelt 1?", "Vraag 2?", "Vraag 3?"],
  "bevoegdheid": {
    "oordeel": "ja | nee | onduidelijk | niet van toepassing",
    "toelichting": "Korte toelichting op de bevoegdheid van de raad.",
    "grondslag": "Genoemde grondslag of lege string als deze niet is genoemd"
  },
  "score": {
    "totaal": 74,
    "onderdelen": {
      "Beslispunten": "groen",
      "Toelichting": "oranje",
      "Consistentie": "groen",
      "Financiën": "groen",
      "Rolzuiverheid": "groen",
      "Besluitrijpheid": "oranje",
      "Juridisch": "groen"
    }
  },
  "rapport": "Samenvatting\\n[tekst]\\n\\nAandachtspunten\\n[tekst]\\n\\nRisico's\\n[tekst]\\n\\nAdvies\\n[tekst]"
}

Regels:
- gemeente: naam van de gemeente herkenbaar uit briefhoofd, aanhef of documentopmaak. Alleen de gemeentenaam, bijv. "Ridderkerk". Als onbekend: "Onbekend".
- typeVoorstel: kies één van de genoemde types; gebruik "beleid" voor concrete beleidsvoorstellen en "beleidskader" alleen voor strategische kaders/visiedocumenten
- beslispunten: letterlijk overgenomen uit het voorstel, elk als aparte string
- kern: publiekssamenvatting in B1-taalniveau, maximaal 3 zinnen, geen jargon, geen afkortingen
- verbeterpunten: alleen concrete herstelpunten, maximaal 6
- raadsvragen: formuleer altijd minimaal 3 en maximaal 5 vragen die een kritisch raadslid bij dit specifieke voorstel zou stellen; alleen bij puur ceremoniële benoemingen mag de lijst korter zijn; de vragen moeten concreet zijn en aansluiten bij de inhoud van dit voorstel
- bevoegdheid.oordeel: "ja", "nee", "onduidelijk" of "niet van toepassing"
- bevoegdheid.toelichting: één zin over wat er staat of ontbreekt
- bevoegdheid.grondslag: gevonden wettelijke grondslag of lege string
- score.totaal: geheel getal 0-100 gebaseerd op aantal, ernst en type voorstel
- score.onderdelen: per categorie "groen", "oranje" of "rood"
- financiën mag groen zijn als financiële gevolgen voor dit type voorstel niet relevant zijn
- rapport: volg exact de structuur Samenvatting, Aandachtspunten, Risico's, Advies

Concept-raadsvoorstel:
${truncated}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ]
  });

  const content = response.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch(e) {
    return { rapport: content, beslispunten: [], kern: "", verbeterpunten: [] };
  }
}

// API endpoint
app.post("/api/toets", upload.single("pdf"), async (req, res) => {
  if (!checkLimit()) {
    return res.status(429).json({ error: "Het dagelijkse maximum is bereikt. Probeer morgen opnieuw." });
  }

  try {
    let pdfBuffer;

    if (req.file) {
      pdfBuffer = req.file.buffer;
    } else if (req.body.url) {
      const response = await fetch(req.body.url, { timeout: 15000 });
      if (!response.ok) throw new Error(`Kon URL niet ophalen (${response.status}).`);
      pdfBuffer = await response.buffer();
    } else {
      return res.status(400).json({ error: "Geen PDF of URL ontvangen." });
    }

    const parsed = await pdfParse(pdfBuffer);
    const text = parsed.text;

    if (text.trim().length < 100) {
      return res.status(422).json({ error: "De PDF bevat te weinig tekst om te analyseren." });
    }

    const result = await callOpenAI(text);
    res.json(result);

  } catch (err) {
    res.status(500).json({ error: err.message || "Onbekende fout." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server draait op poort ${PORT}`));
