try { require("dotenv").config(); } catch (e) {}
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fetch = require("node-fetch");
const path = require("path");
const { OpenAI } = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Daily limit
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || "100", 10);
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

const SCHUWER_BEVOEGDHEID_RAAD = `
Schuwer-lijn: bevoegdheid van de raad

Toets bij elk voorstel expliciet of de raad juridisch bevoegd is om het gevraagde besluit te nemen.

Uitgangspunt volgens Schuwer:
De raad staat grondwettelijk aan het hoofd van de gemeente, maar dat betekent niet dat de raad over alles gaat. De Gemeentewet en bijzondere wetten verdelen bevoegdheden tussen raad, college en burgemeester. College en burgemeester ontlenen hun bevoegdheden rechtstreeks aan de wet via attributie. Die bevoegdheden zijn dus niet afgeleid van de raad.

1. Raad als hoogste politieke orgaan
De raad is het hoogste politieke orgaan en controleert achteraf hoe college en burgemeester hun wettelijke bevoegdheden gebruiken. De raad mag niet doen alsof collegebevoegdheden eigenlijk raadsbevoegdheden zijn.

Signaleer als:
het voorstel de raad laat besluiten over een bevoegdheid die wettelijk bij het college of de burgemeester ligt;
het voorstel doet alsof de raad vooraf moet instemmen met een collegebevoegdheid;
kaderstelling wordt gebruikt om een wettelijke college- of burgemeestersbevoegdheid uit te hollen.

2. Attributie
Bij attributie kent de wet een bevoegdheid rechtstreeks toe aan een bestuursorgaan. Als de wet een bevoegdheid aan college of burgemeester geeft, is dat orgaan juridisch eigenaar van die bevoegdheid.

Signaleer als:
de raad een besluit moet nemen terwijl alleen wensen en bedenkingen, kennisname of controle aan de orde zijn;
het voorstel geen onderscheid maakt tussen besluiten, vaststellen, instemmen, kennisnemen, wensen en bedenkingen geven of controleren.

3. Wetgevende bevoegdheid van de raad
De raad is de wetgevende macht binnen de gemeente. Artikel 147 Gemeentewet is leidend bij het vaststellen van verordeningen. Bij medebewind heeft de raad geen vrije hand: de hogere wet bepaalt welke belangen de raad mag of moet regelen.

Signaleer als:
een verordening verder gaat dan de wettelijke grondslag toestaat;
het college regelgevende bevoegdheid krijgt zonder duidelijke grondslag in de verordening;
de wet zegt bij verordening maar het voorstel toch nadere regels door het college laat stellen;
niet duidelijk is of bij verordening of bij of krachtens verordening geldt.

4. Nadere regels en beleidsregels
Het college heeft geen zelfstandige algemene bevoegdheid om regelgeving vast te stellen. Nadere regels kunnen alleen als de raad die ruimte in een verordening geeft en de hogere wet dat toestaat.
Beleidsregels zijn iets anders. Beleidsregels worden vastgesteld door het bestuursorgaan dat de betreffende bevoegdheid uitoefent. Meestal is dat het college of de burgemeester, niet de raad.

Signaleer als:
de raad beleidsregels vaststelt over een bevoegdheid van college of burgemeester;
de raad in een verordening bepaalt dat het college beleidsregels moet vaststellen;
nadere regels en beleidsregels door elkaar worden gehaald.

5. Collegebevoegdheden
Het dagelijks bestuur ligt bij het college. Het college besluit als eenheid en treedt als eenheid naar buiten. De raad controleert het college, maar neemt de collegebesluiten niet over.

Signaleer als:
het raadsvoorstel de raad laat beslissen over uitvoering, vergunningverlening, privaatrechtelijke rechtshandelingen of dagelijkse bestuurszaken zonder wettelijke raadsgrondslag;
het voorstel de raad alleen laat instemmen met een al genomen of feitelijk al uitgewerkt collegebesluit.

6. Informatie en controle
De raad heeft informatie nodig om te controleren. College en burgemeester hebben een actieve en passieve inlichtingenplicht. Volgens Schuwer is de raad als hoofd van de gemeente degene die bepaalt welke collegebesluiten met de raad worden gedeeld, behoudens strijd met het openbaar belang.

Signaleer als:
het voorstel onvoldoende informatie bevat om de controlerende rol uit te oefenen;
essentiele collegebesluiten ontbreken terwijl zij nodig zijn voor de beoordeling;
geheimhouding of beslotenheid wordt gebruikt zonder duidelijke juridische basis.

7. Gemeenschappelijke regelingen en zienswijzen
Bij gemeenschappelijke regelingen is de positie van de raad versterkt. De raad moet tijdig kunnen sturen, niet pas aan het eind van de pijplijn. Bij oprichting, toetreding of wijziging van een gemeenschappelijke regeling moet worden gecontroleerd of de raad een zienswijze of toestemming moet geven en op welke wettelijke grondslag.

Signaleer als:
de grondslag voor de zienswijze ontbreekt;
het voorstel niet duidelijk maakt of het gaat om zienswijze, toestemming, wensen en bedenkingen of kennisname;
de raad alleen ja/nee kan zeggen terwijl kaderstelling vooraf nodig was;
de raad te laat wordt betrokken om nog betekenisvol invloed uit te oefenen.

8. Omgevingswet en BOPA
Bij een buitenplanse omgevingsplanactiviteit is meestal het college bevoegd gezag. Als de raad gevallen heeft aangewezen waarin advies van de raad nodig is, blijft het college bevoegd gezag maar moet het college het raadsadvies in acht nemen.

Signaleer als:
het voorstel suggereert dat de raad bevoegd gezag is voor de vergunning;
niet duidelijk is of de activiteit valt onder de door de raad aangewezen adviesgevallen;
het advies van de raad wordt aangeduid als bindend advies zonder uit te leggen dat het college bevoegd gezag blijft en moet besluiten met inachtneming van het advies.

9. Benoemingen en toelating
De raad benoemt wethouders. De raad benoemt geen raadsleden: raadsleden worden benoemd door de voorzitter van het centraal stembureau en de raad beslist alleen over toelating na onderzoek van de geloofsbrieven.

Signaleer als:
een voorstel spreekt over benoeming raadslid in plaats van toelating;
bij toelating wordt getoetst aan nevenfuncties, gedrag, politieke wenselijkheid of verboden handelingen voor het raadslidmaatschap;
een wethouder wordt gepresenteerd als iets waarmee de raad slechts instemt, terwijl de raad benoemt;
bij wethoudersbenoeming geen VOG is betrokken terwijl die vereist is.

10. Commissies
Een raadscommissie bereidt raadsbesluiten voor, maar treedt niet in de plaats van de raad. Een commissie kan niet namens de raad een inhoudelijke zienswijze geven op een ontwerpbegroting van een gemeenschappelijke regeling.

Signaleer als:
een voorbereidende vergadering of commissie feitelijk een raadsbesluit neemt;
een commissie namens de raad een inhoudelijke zienswijze geeft;
niet duidelijk is wat besluitvorming door commissie en besluitvorming door raad van elkaar onderscheidt.

11. Terminologie
Gebruik juridisch zuivere taal. Schuwer waarschuwt voor bestuurlijke mist.

Corrigeer of signaleer:
de raad stemt in met waar de raad besluit, stelt vast, geeft toestemming of geeft zienswijze bedoeld is;
benoeming raadslid waar toelating raadslid bedoeld is;
demissionaire wethouder als juridisch onjuiste kwalificatie;
bindend advies bij BOPA zonder juridische duiding;
de raad gaat over alles als uitgangspunt.

12. Ridderkerkse lokale regels
Neem bij Ridderkerk mee:
Het Reglement van orde van de raad 2024 is gebaseerd op artikel 16 Gemeentewet.
Het presidium doet aanbevelingen over organisatie en functioneren van raad en commissies en stelt de vergadercyclus vast.
Artikel 6 RvO regelt onderzoek geloofsbrieven, beediging en benoeming wethouders.
De Verordening op de raadsvoorbereiding Ridderkerk 2023 is gebaseerd op artikel 82 en artikel 84 Gemeentewet.
Voorbereidende vergaderingen zijn artikel 82-commissies en bereiden raadsbesluiten voor; zij vervangen de raad niet.
`;

const SYSTEM_PROMPT = `Rol

Je bent een gespecialiseerde juridisch-administratieve assistent. Je beoordeelt concept-raadsvoorstellen voor behandeling in het college. Je voert uitsluitend een formele kwaliteitstoets uit.

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

Classificatie en toetsprofiel

Voordat je aandachtspunten formuleert, bepaal je per rubriek of deze voor dit type voorstel niet relevant, licht relevant, normaal relevant of zwaar relevant is.
Formuleer geen aandachtspunt binnen een rubriek die niet relevant is, tenzij het voorstel zelf die rubriek toch relevant maakt.
Een eenvoudige benoeming vereist geen financiele of juridische dieptetoets.
Een kredietaanvraag of grondexploitatie vereist een strenge financiele toets.
Een verordening vereist een strenge juridische toets en controle van interne verwijzingen.
Een zienswijze vereist controle op de grondslag van de raadsbevoegdheid.

Rubric

1. Beslispunten

Controleer of elk beslispunt een handeling, een object en eventuele randvoorwaarden bevat.
Controleer of elk beslispunt zelfstandig leesbaar is zonder toelichting.

Signaleer als:
de formulering een constatering is in plaats van een besluit,
meerdere interpretaties mogelijk zijn,
meerdere besluiten in een beslispunt zijn samengevoegd,
of het beslispunt alleen begrijpelijk is met de toelichting.

Controleer bij moties altijd:
heeft de raad eerder geoordeeld over de afdoening van deze motie? Zo ja, onderbouwt het voorstel waarom dat eerdere oordeel nu niet meer toereikend is? Ontbreekt die onderbouwing, dan is het voorstel op dit punt niet besluitrijp.

2. Toelichting

Controleer of minimaal aanwezig is:
aanleiding,
wat van de raad wordt gevraagd,
en de relevante gevolgen, zoals financiele, juridische of organisatorische gevolgen.

Controleer of de toelichting logisch is opgebouwd en begrijpelijk is voor een raadslid zonder voorkennis.

Signaleer als:
essentiele informatie ontbreekt,
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

5. Financiele aspecten

Controleer of financiele gevolgen zijn benoemd.
Controleer of duidelijk is of het om incidentele of structurele gevolgen gaat.
Controleer of de dekking concreet en herleidbaar is.

Signaleer als:
er financiele gevolgen zijn zonder dat dit uit het voorstel blijkt,
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

Aandachtspunten
Alleen punten die herstel vereisen.
Per aandachtspunt: eerst het probleem in een of twee zinnen, daarna het herstel in een zin.
Geen rubriekaanduidingen tussen haakjes.
Kritieke punten eerst, daarna overige punten.

Risico's
Alleen indien van toepassing.
Maximaal twee zinnen per risico.

Advies
Een of twee concrete herstelacties, geordend naar prioriteit.

${SCHUWER_BEVOEGDHEID_RAAD}`;

async function callOpenAI(text) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY niet geconfigureerd.");

  const truncated = text.slice(0, 60000);

  const userPrompt = `Beoordeel dit concept-raadsvoorstel volgens de rubric.
Stap 1: classificeer het voorstel volledig (hoofdType, subType, complexiteit, toetsprofiel).
Stap 2: voer de toets uit waarbij je per rubriek het toetsprofiel toepast en formuleer geen aandachtspunten voor rubrieken die niet relevant zijn.
Stap 3: genereer altijd minimaal 3 concrete raadsvragen toegespitst op dit voorstel.
Stap 4: voer bij bevoegdheid expliciet de Schuwer-toets uit.

Geef je antwoord als geldig JSON in dit exacte formaat:
{
  "gemeente": "Amsterdam",
  "classificatie": {
    "hoofdType": "personeel-organisatie | zienswijze-verbonden-partijen | regelgeving | financien-penc | ruimte-grond-vastgoed | beleid-kaderstelling | controle-moties-toezeggingen | bedrijfsvoering-informatie | sociaal-domein-subsidies | veiligheid-bestuur | overig",
    "subType": "specifiek subtype in gewone taal, bijv. 'kredietaanvraag renovatie gemeentelijk vastgoed'",
    "complexiteit": "laag | middel | hoog",
    "toelichting": "Een zin waarom dit type en deze complexiteit.",
    "toetsprofiel": {
      "beslispunten": "licht | normaal | streng",
      "toelichting": "licht | normaal | streng",
      "consistentie": "licht | normaal | streng",
      "bijlagen": "niet relevant | licht | normaal | streng",
      "financien": "niet relevant | licht | normaal | streng",
      "rolzuiverheid": "licht | normaal | streng",
      "besluitrijpheid": "normaal | streng",
      "juridisch": "licht | normaal | streng",
      "proces": "licht | normaal | streng"
    },
    "nietToepasselijkeChecks": ["omschrijving van wat niet getoetst wordt en waarom"]
  },
  "beslispunten": ["beslispunt 1", "beslispunt 2"],
  "kern": "Publiekssamenvatting in B1-taalniveau, maximaal 3 zinnen.",
  "verbeterpunten": ["concreet verbeterpunt 1", "concreet verbeterpunt 2"],
  "raadsvragen": ["Vraag die een raadslid stelt 1?", "Vraag 2?", "Vraag 3?"],
  "bevoegdheid": {
    "oordeel": "ja | nee | onduidelijk | niet van toepassing",
    "toelichting": "Compacte Schuwer-toets: gaat de raad hier echt over of is sprake van college/burgemeestersbevoegdheid, controle, zienswijze of kennisname? Noem ook terminologierisico als dat speelt. Max 3 zinnen.",
    "grondslag": "Gevonden wettelijke grondslag of lege string"
  },
  "score": {
    "totaal": 74,
    "onderdelen": {
      "Beslispunten": "groen",
      "Toelichting": "oranje",
      "Consistentie": "groen",
      "Financien": "groen",
      "Rolzuiverheid": "groen",
      "Besluitrijpheid": "oranje",
      "Juridisch": "groen"
    }
  },
  "onderbouwing": "Aandachtspunten\\n[tekst]\\n\\nRisico's\\n[tekst]\\n\\nAdvies\\n[tekst]"
}

Regels:
- gemeente: naam van de gemeente herkenbaar uit briefhoofd, aanhef of documentopmaak. Alleen de gemeentenaam, bijv. "Ridderkerk". Als onbekend: "Onbekend".
- classificatie.hoofdType: kies precies een van de genoemde waarden
- classificatie.subType: omschrijf het specifieke subtype in gewone taal (geen code, geen enum)
- classificatie.complexiteit: "laag" voor eenvoudige benoemingen of zienswijzen, "hoog" voor complexe financiele of juridische voorstellen
- classificatie.toetsprofiel: bepaal per rubriek de intensiteit; gebruik "niet relevant" alleen als die rubriek echt niet van toepassing is op dit type
- classificatie.nietToepasselijkeChecks: leg per weggelaten check kort uit waarom
- beslispunten: letterlijk overgenomen uit het voorstel, elk als aparte string
- kern: publiekssamenvatting in B1-taalniveau, maximaal 3 zinnen, geen jargon, geen afkortingen
- verbeterpunten: alleen aandachtspunten voor rubrieken met toetsprofiel "normaal" of "streng"; maximaal 6
- raadsvragen: minimaal 3, maximaal 5; concreet en toegespitst op dit voorstel; bij een puur ceremoniële benoeming mag de lijst 2 vragen bevatten
- bevoegdheid.oordeel: "ja", "nee", "onduidelijk" of "niet van toepassing"
- bevoegdheid.toelichting: combineer Schuwer-toets en terminologierisico in max 3 zinnen
- bevoegdheid.grondslag: gevonden wettelijke grondslag of lege string
- score.totaal: geheel getal 0-100, aangepast aan het toetsprofiel (niet afrekenen op niet-relevante rubrieken)
- score.onderdelen: per categorie "groen", "oranje" of "rood"; gebruik "groen" als de rubriek niet relevant is
- onderbouwing: volg exact de structuur Aandachtspunten, Risico's, Advies; geen Samenvatting (staat al in kern); geen herhaling van verbeterpunten-bullets

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
  } catch (e) {
    return { onderbouwing: content, beslispunten: [], kern: "", verbeterpunten: [] };
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
