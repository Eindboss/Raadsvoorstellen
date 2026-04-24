import { NextRequest, NextResponse } from "next/server";

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

Bij een zienswijzeraadsvoorstel controleer je wel of in het raadsvoorstel (toelichting) een juridische grondslag is benoemd waaruit blijkt dat de raad bevoegd is om een zienswijze in te dienen. Signaleer alleen als geen enkele wettelijke of regelingstechnische grondslag wordt genoemd én daardoor onduidelijk blijft waarom de raad bevoegd is.

Beoordeel uitsluitend het raadsvoorstel en de raadsbeslispunten, niet het collegevoorstel.

Een zienswijzebrief die als concept in .docx is bijgevoegd, is gebruikelijk en correct. Dat signaleer je niet.

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
Neem alleen punten op die de kwaliteit van het voorstel of de besluitvorming raken.

Risico's
Alleen indien van toepassing.
Maximaal twee zinnen per risico.

Advies
Eén of twee concrete herstelacties, geordend naar prioriteit.`;

const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || "100");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

let dailyCount = 0;
let lastReset = new Date().toDateString();

function checkLimit(): boolean {
  const today = new Date().toDateString();
  if (today !== lastReset) {
    dailyCount = 0;
    lastReset = today;
  }
  if (dailyCount >= DAILY_LIMIT) return false;
  dailyCount++;
  return true;
}

async function extractTextFromPdfBytes(bytes: Uint8Array): Promise<string> {
  const { default: pdfParse } = await import("pdf-parse");
  const buffer = Buffer.from(bytes);
  const data = await pdfParse(buffer);
  return data.text;
}

async function fetchPdfFromUrl(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Kon URL niet ophalen (${res.status}).`);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("pdf") && !url.toLowerCase().endsWith(".pdf")) {
    throw new Error("De URL verwijst niet naar een PDF-bestand.");
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

async function callGemini(text: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY niet geconfigureerd.");

  const truncated = text.slice(0, 60000);

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Beoordeel dit concept-raadsvoorstel volgens de rubric. Voer een strikte formele toets uit. Wees streng op beslispunten en consistentie. Maak geen opmerkingen over het ontbreken van een wettelijke grondslag in Gelet op bij het raadsbesluit. Controleer alleen bij een zienswijzeraadsvoorstel of in het raadsvoorstel zelf de wettelijke grondslag voor de zienswijzebevoegdheid is genoemd.\n\n---\n\n${truncated}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API fout: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Geen resultaat ontvangen.";
}

export async function POST(req: NextRequest) {
  if (!checkLimit()) {
    return NextResponse.json(
      { error: "Het dagelijkse maximum aantal toetsen is bereikt. Probeer morgen opnieuw." },
      { status: 429 }
    );
  }

  try {
    const formData = await req.formData();
    let pdfBytes: Uint8Array;

    const pdfFile = formData.get("pdf") as File | null;
    const url = formData.get("url") as string | null;

    if (pdfFile) {
      const arrayBuffer = await pdfFile.arrayBuffer();
      pdfBytes = new Uint8Array(arrayBuffer);
    } else if (url) {
      pdfBytes = await fetchPdfFromUrl(url);
    } else {
      return NextResponse.json({ error: "Geen PDF of URL ontvangen." }, { status: 400 });
    }

    const text = await extractTextFromPdfBytes(pdfBytes);

    if (text.trim().length < 100) {
      return NextResponse.json(
        { error: "Het PDF-bestand bevat te weinig tekst om te analyseren." },
        { status: 422 }
      );
    }

    const result = await callGemini(text);

    return NextResponse.json({ result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Onbekende fout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
