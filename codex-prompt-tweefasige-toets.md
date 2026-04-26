# Codex Prompt: Tweefasige Toets — Klaar Als Het Beter Is

*Opgeslagen: 2026-04-25*

---

```
## WERKWIJZE — LEES DIT EERST

Je werkt autonoom door totdat alles in dit document is uitgevoerd en gevalideerd.
Je stopt niet halverwege, je vraagt geen bevestiging, je wacht niet op terugkoppeling.
Als iets mislukt: analyseer de oorzaak, pas aan, probeer opnieuw.
Als een stap afwijkt van wat hier staat: documenteer de afwijking in
dynamische-rubric-log.md en ga verder. Je bent pas klaar als:
1. server.js syntactisch correct is (`node --check server.js` slaagt)
2. de vergelijkingsanalyse (analyse-tweefasige-toets.md) de kwaliteitscriteria haalt
3. alles is gecommit en gepusht naar C:\dev\Raadsvoorstellen\ main

Itereer zo vaak als nodig. Elke iteratieronde logt je in dynamische-rubric-log.md.

---

Je taak is de kwaliteitstoets in C:\dev\Raadsvoorstellen\server.js fundamenteel
verbeteren door een tweefasige architectuur, een gecalibreerde score, een B1-taalindicator,
een titelcheck, WCAG-indicator en favicons. Je bent klaar als je zelf kunt aantonen
dat de output concreter, beter onderbouwd en bruikbaarder is geworden. Niet eerder.

## EXTRA WIJZIGINGEN IN SERVER.JS (vóór alles)

### 1 — Herschrijf de afbakeningszin (niet verwijderen)
Zoek in de SYSTEM_PROMPT de zin:
"Beoordeelt uitsluitend formele kwaliteit—niet de politieke inhoud."
(of een variatie daarop met dezelfde strekking)
Vervang door:
"Je beoordeelt primair de formele kwaliteit en besluitrijpheid. Je beoordeelt
inhoud alleen voor zover die aantoonbaar raakt aan uitvoerbaarheid, juridische
juistheid of interne consistentie van het voorstel."

Reden: de oorspronkelijke zin is de belangrijkste afbakening van het systeem.
Zonder hem gaat het model beleidsinhoud beoordelen en politieke afwegingen maken.
De herschreven versie behoudt die grens, maar maakt ruimte voor de nieuwe checks
op onuitvoerbaarheid en interne tegenstrijdigheid.

Lees eerst volledig:
- C:\dev\Raadsvoorstellen\server.js
- C:\dev\Raadsvoorstellen\public\app.js (en andere frontend-bestanden in public/)
- C:\dev\Raadsvoorstellen\public\style.css
- C:\dev\Raadsvoorstellen\public\type-gaps.json
- C:\dev\Raadsvoorstellen\public\legal-articles.json
- C:\dev\Raadsvoorstellen\analyse-verbeterstap.md
- C:\dev\Toolbox\scripts\output\review-dynamische-rubric.md

---

## HET PROBLEEM

De huidige toets doet in één call te veel tegelijk: classificeren, toetsen,
redeneren, prioriteren en JSON produceren. Daardoor zijn bevindingen vaak
plausibel maar niet aantoonbaar. Bovendien geeft de scoreindicator structureel
scores tussen 70-80%: te weinig spreiding om bruikbaar te zijn. En de UI mist
een B1-taalindicator, titelcheck, WCAG-indicator en favicons.

---

## DEEL 1: TWEEFASIGE TOETS

### Pass 1 — Brede detectie

**Karakter van Pass 1: snel en breed, niet volledig.**
Pass 1 mag onvolledig zijn. Het doel is signaleren, niet bewijzen. Liever te veel
kandidaten dan te weinig — Pass 2 filtert. Benoem dit expliciet in de Pass 1 prompt:
"Dit is een brede verkenning. Signaleer wat je opvalt. Volledigheid en bewijs komen
in de volgende stap."

De huidige call blijft grotendeels intact: rubric doorlopen, dynamische context,
juridische grondslag. Maar de output van Pass 1 is een lijst kandidaat-bevindingen,
geen eindoutput. Elk met:
- rubriek
- initiële bevinding
- waarom dit mogelijk ontbreekt

B1 en WCAG worden in Pass 1 meegenomen als lichtgewicht sub-checks — ze vereisen
geen bewijscitaat en hoeven Pass 2 niet door. Ze worden direct als indicatief
resultaat opgeslagen na Pass 1. Markeer ze in de UI expliciet als "indicatief".

Voeg aan de Pass 1 detectieprompt toe:

```
Beoordeel ook de volgende vier aspecten als afzonderlijke kandidaat-bevindingen:

A. ZELFSTANDIGE LEESBAARHEID
Kan een onervaren raadslid — zonder bijlagen, zonder voorkennis van dossier of
gemeente — de kern van het voorstel begrijpen na het lezen van alleen dit document?
Controleer:
- Worden afkortingen en begrippen uitgelegd?
- Is de aanleiding helder zonder dat je eerdere stukken moet kennen?
- Zijn de consequenties van het besluit duidelijk voor iemand die het dossier
  niet kent?
Oordeel: Zelfstandig leesbaar / Beperkt zelfstandig / Niet zelfstandig leesbaar
Geef maximaal 2 concrete voorbeelden van passages die dit belemmeren.

B. BESLISPUNTEN ONDERBOUWING
Controleer elk beslispunt afzonderlijk:
- Wordt elk gevraagd besluit ergens in de toelichting inhoudelijk onderbouwd?
- Als de raad iets wordt gevraagd te besluiten dat nergens in de tekst wordt
  toegelicht: dat is een missende onderbouwing.
- Noem per niet-onderbouwd beslispunt letterlijk wat er gevraagd wordt en
  wat de onderbouwing zou moeten zijn.

C. LEESBAARHEID ZONDER BIJLAGEN
Is de kern van het voorstel te begrijpen zonder de bijlagen te lezen?
Als cruciale informatie alleen in een bijlage staat en niet in de toelichting
is samengevat: signaleer dit.

D. ONUITVOERBAARHEID OF JURIDISCHE ONJUISTHEID
Is er iets in het voorstel dat het besluit onuitvoerbaar of juridisch onjuist
maakt — los van de bevoegdheidsvraag? Denk aan: een gevraagd besluit dat ingaat
tegen een eerder raadsbesluit zonder dat dit wordt erkend, een uitvoeringstermijn
die aantoonbaar onrealistisch is, een financieel bedrag dat intern niet klopt.

E. INTERNE TEGENSTRIJDIGHEDEN
Zijn er passages die elkaar tegenspreken? Controleer expliciet:
- Kloppen bedragen in de toelichting overeen met de beslispunten?
- Staat de planning op één plek anders dan op een andere plek?
- Beschrijft de rolverdeling in de toelichting iets anders dan het beslispunt vraagt?
- Zegt de samenvatting iets anders dan de conclusie?
Dit is in de praktijk één van de meest voorkomende echte fouten in raadsvoorstellen.

In Pass 2, bij een bevinding over interne tegenstrijdigheid:
citeer beide passages expliciet en leg kort uit waarom ze niet tegelijk
waar kunnen zijn. Impliciet benoemen volstaat niet.

F. BESLUIT ZONDER RECHTSGEVOLG
Is het gevraagde besluit juridisch betekenisvol?
Wordt de raad gevraagd iets te doen dat geen rechtsgevolg heeft —
zoals alleen kennisnemen van een stuk, of een intentie uitspreken
zonder concrete vervolgopdracht of bevoegdheidsoverdracht?
Signaleer dit als de raad feitelijk alleen instemt met een mening,
terwijl de juridische handeling (bijv. vaststelling, krediet, mandaat)
ontbreekt of elders al heeft plaatsgevonden.

Let op: een zienswijze, kennisname of richtinggevende uitspraak kan passend
zijn en heeft bestuurlijke betekenis — ook zonder direct rechtsgevolg.
Signaleer alleen als het besluit geen duidelijk doel of vervolg heeft,
of als de raad iets gevraagd wordt dat feitelijk al elders is besloten.
```

Format Pass 1 output (intern):
```json
{
  "kandidaten": [
    {
      "rubriek": "Financiële aspecten",
      "bevinding": "De dekking van het krediet is niet onderbouwd",
      "reden": "Paragraaf 3 noemt een bedrag maar geeft geen dekkingsbron"
    }
  ]
}
```

### Pass 2 — Strikte validatie met bewijsverplichting

Voor elke kandidaat-bevinding: gerichte validatie, gebundeld in één call.

Validatieprompt:

```
Beoordeel elke kandidaat-bevinding op de voorsteltekst.

Regels per bevinding:
1. Citeer de exacte passage, OF benoem expliciet welk element ontbreekt en
   waar het had moeten staan (bijv. "er is geen risicoparagraaf; die hoort
   in de toelichting na de financiële paragraaf").
2. Als je noch een passage kunt citeren, noch een concreet ontbrekend element
   kunt aanwijzen: verwerp de bevinding.
3. Als de informatie volledig en adequaat aanwezig is: verwerp de bevinding.
4. Als de informatie aanwezig is maar onvoldoende onderbouwd of te summier:
   behoud de bevinding als AANDACHT — niet verwerpen, maar wel afzwakken.
5. Bepaal ernst:
   - BLOKKEREND: besluit is niet verantwoord of niet uitvoerbaar zonder dit
   - AANDACHT: raad kan terecht vragen stellen, maar het blokkeert het besluit niet
   - OPTIONEEL: zou beter kunnen, maar is geen wezenlijk gemis
6. Controleer niet alleen of iets ontbreekt, maar ook of aanwezige informatie
   mogelijk onjuist, tegenstrijdig of juridisch onhoudbaar is. Onjuiste informatie
   is vaak ernstiger dan ontbrekende informatie.
7. Formuleer één concrete herstelactie in maximaal twee zinnen.
8. Beoordeel: is dit probleem herstelbaar vóór raadsbehandeling? (ja/nee)
   Ja = kan worden opgelost door aanpassing van het voorstel of een begeleidend memo.
   Nee = vereist extern onderzoek, nieuwe berekeningen, of inhoudelijke herziening
   van het besluit zelf, of is afhankelijk van externe besluitvorming (andere gemeente,
   GR, provincie).

Output per bevinding: BEVESTIGD of VERWORPEN.
Bij BEVESTIGD: bewijs, ernst, herstelactie, herstelbaar_voor_behandeling.
Verworpen kandidaten verdwijnen volledig.

Extra verwerpingsgrond:
Als een bevinding te algemeen is geformuleerd en niet herleidbaar tot een
concreet onderdeel van de tekst (bijv. "de toelichting is onduidelijk" zonder
aan te geven welk onderdeel en waarom): verwerp de bevinding.
Vage restbevindingen zijn geen bevindingen.

Proportionaliteitsregel:
Kleine redactionele of marginale inconsistenties leiden nooit tot BLOKKEREND.
Weeg de ernst altijd af tegen de impact op het besluit:
een komma-fout in een datumvermelding ≠ AANDACHT;
een bedrag dat intern inconsistent is in een kredietvoorstel = BLOKKEREND.
```

---

## DEEL 2: GECALIBREERDE SCORE

### Probleem
De huidige score geeft structureel 70-80% ongeacht de inhoud. Dat is misleidend:
een voorstel met een blokkerende fout kan een score van 78% krijgen, terwijl
een griffier of beleidsmedewerker dan een verkeerd beeld krijgt van de situatie.

### Oplossing: twee gescheiden scorebanden

De score wordt server-side berekend na het parsen van de JSON.
Het model schat de score NOOIT zelf.

**Als er 1 of meer BLOKKEREND bevindingen zijn:**
Score bevindt zich altijd in de band 0–49 (niet besluitrijp).
Formule: score = max(5, 49 - ((blokkerend - 1) × 15) - (aandacht × 2))

**Als er geen BLOKKEREND bevindingen zijn:**
Score bevindt zich altijd in de band 50–100.
Formule: score = max(50, 100 - (aandacht × 8) - (optioneel × 2))

Labels:
- 85–100: "Besluitrijp"
- 65–84: "Lichte verbeterpunten"
- 50–64: "Verbeterd voor behandeling"
- 0–49: "Niet besluitrijp — blokkerende bevindingen"

**Vertrouwensscore** (server-side berekend, 0–100):
Meet hoe betrouwbaar de analyse is op basis van de pass-resultaten:
vertrouwen = 60 + (bevindingen_met_bewijs × 4) - (verworpen_kandidaten × 2)
Geclampd op [30, 95] — nooit 0 of 100, want absolute zekerheid bestaat niet.
Toelichting: goede detectie (veel kandidaten) wordt niet bestraft; alleen
het aandeel bewijsbare bevindingen telt positief mee.
Toon in UI als klein secondair getal: "Analysebetrouwbaarheid: 72%".
Niet prominenter dan de hoofdscore — het is een kwaliteitsindicator van de analyse,
niet van het voorstel zelf.

De band 0–49 is uitsluitend bereikbaar bij BLOKKEREND bevindingen.
De band 50–100 is uitsluitend bereikbaar zonder BLOKKEREND bevindingen.
Er is geen overlap. Dit maakt de score eerlijk: een score ≥ 50 betekent
altijd dat er geen blokkerende problemen zijn gevonden.

Toon de score in de UI met de bijbehorende kleur:
- Rood: 0–49
- Oranje: 50–64
- Geel: 65–84
- Groen: 85–100

De outputlengte van de toets is niet begrensd door de UI. Als er veel
bevindingen zijn, mag de output langer worden. De UI scrollt mee.

---

## DEEL 3: B1-TAALINDICATOR

### Wat
Controleer of de voorsteltekst voldoet aan B1-taalniveau (toegankelijk Nederlands,
conform de Wet gebruik Friese taal / overheidsstandaard begrijpelijke taal).

### Toevoegen aan Pass 1 prompt
Voeg toe aan de detectieprompt:

```
Beoordeel ook het taalniveau van de voorsteltekst:
- Is de tekst geschreven op B1-niveau (korte zinnen, actieve werkwoorden,
  geen onnodig jargon, concrete taal)?
- Geef voorbeelden van maximaal 3 zinnen of passages die te complex zijn.
- Geef een oordeel: B1-conform / Matig / Complex

Leidraad B1:
- Zinnen korter dan 15 woorden (gemiddeld)
- Geen passieve constructies waar actief kan
- Geen bestuurlijk jargon zonder uitleg (zoals "resulterende", "cq.", "derhalve",
  "onderhavige", "ten aanzien van", "het betreft")
- Concrete onderwerpen en werkwoorden
```

### Toevoegen aan JSON output
```json
"taal_b1": {
  "oordeel": "B1-conform | Matig | Complex",
  "voorbeelden": [
    "Zin of passage die te complex is"
  ]
}
```

### Toevoegen aan frontend (style.css + app.js)
Voeg een kleine indicator toe naast de bestaande score, met label "Taal B1" en kleur:
- Groen: B1-conform
- Oranje: Matig
- Rood: Complex

Stijl: klein badge/pill-element, consistent met de bestaande UI.

---

## DEEL 4: TITELCHECK

Voeg toe aan Pass 1 prompt:

```
Beoordeel of de titel van het raadsvoorstel voldoende duidelijk is:
- Beschrijft de titel concreet welk besluit wordt gevraagd?
- Is de titel begrijpelijk zonder de rest van het voorstel te lezen?
- Bevat de titel onnodige afkortingen of jargon?

Oordeel: Duidelijk / Matig / Onduidelijk
Optionele suggestie voor een betere titel (alleen bij Matig of Onduidelijk).
```

Toevoegen aan JSON:
```json
"titelcheck": {
  "oordeel": "Duidelijk | Matig | Onduidelijk",
  "suggestie": "Optionele verbeterde titel"
}
```

Toon in de frontend als kleine regel onder de documentnaam.

---

### 2 — Herstel de juridische grondslag-check

Het huidige juridische grondslag-blok veroorzaakt structureel rode indicatoren
omdat het model de afwezigheid van een expliciet wetsartikel al als fout markeert.
Dat klopt niet: de raadsbevoegdheid is bij de meeste voorstellen impliciet correct
(het voorstel staat op de agenda, de raad stemt — dat is voldoende).

Vervang de huidige buildLegalContext()-injectie door de volgende logica:

**Twee situaties, twee gedragsregels:**

Situatie A — hoofd_types waarbij een expliciet wetsartikel verwacht wordt:
- regelgeving (art. 147/149 Gemeentewet)
- financien-penc (art. 189/191 Gemeentewet)
- sociaal-domein-subsidies (Awb art. 4:23)
- zienswijze-verbonden-partijen (Wgr art. 35)

Voor deze types: controleer of het document een wettelijke grondslag noemt.
Als die volledig ontbreekt: signaleer het als AANDACHT (niet BLOKKEREND).
Als die impliciet aanwezig is (bijv. "conform de financiële verordening"): geldig.

Situatie B — alle overige types:
Geef een impliciet goedkeurend oordeel. Zeg niet dat de grondslag ontbreekt.
Noem de wetsartikelen alleen als geheugensteuntje aan het model, niet als check.

Pas de injectietekst aan:

```
Juridische context voor dit voorsteltype (${hoofdType}):
${situatieA ?
  `Controleer of het voorstel een wettelijke grondslag noemt. Een impliciete
  verwijzing volstaat. Signaleer alleen bij volledige afwezigheid van enige
  juridische basis. Relevante artikelen: ${lines}` :
  `De raadsbevoegdheid voor dit type voorstel is doorgaans impliciet correct.
  Signaleer alleen als er een concrete aanwijzing is dat de bevoegdheid
  onjuist is belegd. Ter referentie: ${lines}`
}
```

Pas ook het WCAG-outputveld "wcag.oordeel" aan: "Toegankelijk" wordt groen,
"Aandachtspunten" wordt oranje, "Ontoegankelijk" wordt rood — maar juridisch
krijgt alleen een indicator als er écht iets te melden is.

---

## DEEL 5: WCAG-INDICATOR

### Wat
Een eenvoudige check of het voorstel digitaal toegankelijk lijkt te zijn, gebaseerd
op de tekst. Geen technische PDF-analyse — puur tekstuele signalen.

### Voeg toe aan Pass 1 prompt

```
Beoordeel of het raadsvoorstel signalen vertoont van digitale toegankelijkheid
(WCAG 2.1 niveau AA, conform de Tijdelijke regeling digitale toegankelijkheid):
- Zijn afbeeldingen of grafieken beschreven in de tekst, of worden ze alleen
  visueel gepresenteerd zonder tekstalternatief?
- Is de documentstructuur logisch (inleiding, context, beslispunten, bijlagen)?
- Zijn tabellen of lijsten beschreven met context, of staan ze los zonder uitleg?
- Zijn afkortingen de eerste keer uitgeschreven?

Oordeel: Toegankelijk / Aandachtspunten / Ontoegankelijk
Geef maximaal 2 concrete aandachtspunten.
```

Toevoegen aan JSON:
```json
"wcag": {
  "indicatief": true,
  "oordeel": "Toegankelijk | Aandachtspunten | Ontoegankelijk",
  "aandachtspunten": [
    "Grafiek op pagina 4 heeft geen tekstbeschrijving"
  ]
}
```

Toon in de frontend als kleine indicator naast B1.

---

## DEEL 6: VIJF VERWACHTE RAADSVRAGEN

Genereer 3 tot 5 verwachte raadsvragen op basis van:
- De overgebleven (niet-verworpen) bevindingen uit Pass 2
- De historische vraagpatronen uit type-gaps.json voor dit hoofd_type
- De juridische context uit legal-articles.json

Formuleer als een raadslid dat kritisch maar constructief is.
Een raadsvraag is alleen toegestaan als deze direct herleidbaar is tot:
- een concrete bevinding uit Pass 2, of
- een specifiek element uit de voorsteltekst (bedrag, planning, actor, beslispunt)
Algemene controlerende vragen zonder directe koppeling zijn niet toegestaan.
Genereer minder dan 5 als je geen 5 voorstel-specifieke vragen kunt formuleren.
Kwaliteit boven kwantiteit.

Toevoegen aan JSON:
```json
"verwachte_raadsvragen": {
  "label": "5 verwachte raadsvragen",
  "vragen": [
    "Specifieke vraag 1",
    "Specifieke vraag 2",
    "Specifieke vraag 3",
    "Specifieke vraag 4",
    "Specifieke vraag 5"
  ]
}
```

---

## DEEL 7: FAVICONS

Voeg favicons toe aan de HTML-pagina (public/index.html of equivalent):
- favicon.ico (16×16 en 32×32, gegenereerd via canvas of inline SVG)
- apple-touch-icon (180×180)
- SVG favicon voor moderne browsers

Gebruik een eenvoudig icoon dat past bij het thema: een gemeentelijk/bestuurlijk
symbool of een simpele checkmark/document-icoon in de kleur van de bestaande huisstijl.
Genereer de favicon als inline SVG of als base64 data URI zodat er geen extern
bestand nodig is — of maak een klein SVG-bestand in public/.

---

## EINDOUTPUT JSON (volledig schema)

```json
{
  "hoofd_type": "financien-penc",
  "dynamische_context_actief": true,
  "juridische_context_actief": true,
  "gaps_gebruikt": ["financieel", "uitvoering", "risico", "participatie"],
  "wetsartikelen_gebruikt": ["Gemeentewet art. 189", "Gemeentewet art. 212"],
  "score": 34,
  "score_label": "Niet besluitrijp — blokkerende bevindingen",
  "leesbaarheid": {
    "zelfstandig_leesbaar": "Zelfstandig leesbaar | Beperkt zelfstandig | Niet zelfstandig leesbaar",
    "voorbeelden": ["Passage die leesbaarheid belemmert"],
    "zonder_bijlagen": "Ja | Nee",
    "zonder_bijlagen_toelichting": "Cruciale informatie over X staat alleen in bijlage 2"
  },
  "beslispunten_check": [
    {
      "beslispunt": "De raad besluit krediet X beschikbaar te stellen",
      "onderbouwd": true
    },
    {
      "beslispunt": "De raad besluit Y in te trekken",
      "onderbouwd": false,
      "ontbrekende_onderbouwing": "Nergens in de toelichting wordt uitgelegd waarom Y ingetrokken moet worden"
    }
  ],
  "titelcheck": {
    "oordeel": "Matig",
    "suggestie": "Krediet nieuwbouw IKC De Driemaster: aanvraag aanvullend budget vanwege stedenbouwkundige eisen"
  },
  "taal_b1": {
    "oordeel": "Matig",
    "voorbeelden": [
      "De resulterende financiële consequenties dienen te worden bezien in relatie tot..."
    ]
  },
  "wcag": {
    "indicatief": true,
    "oordeel": "Aandachtspunten",
    "aandachtspunten": [
      "Tabel in paragraaf 4 heeft geen beschrijvende context"
    ]
  },
  "bevindingen": [
    {
      "rubriek": "Financiële aspecten",
      "ernst": "BLOKKEREND",
      "bevinding": "De dekking van het gevraagde krediet is niet onderbouwd",
      "bewijs": "Paragraaf 3 noemt €450.000 maar verwijst niet naar een dekkingsbron",
      "herstelactie": "Voeg een dekkingsparagraaf toe met de specifieke begrotingspost en het effect op de vrije ruimte.",
      "blokkerend": true,
      "herstelbaar_voor_behandeling": false
    }
  ],
  "verworpen_kandidaten": 4,
  "vertrouwen": 72,
  "verwachte_raadsvragen": {
    "label": "Verwachte raadsvragen",
    "vragen": [
      "Wie is eindverantwoordelijk voor de uitvoering en hoe wordt de raad geïnformeerd bij vertraging?",
      "Wat zijn de financiële gevolgen als de aanbesteding hoger uitvalt dan geraamd?",
      "Op welke wijze zijn bewoners betrokken bij dit besluit en wat is er met hun inbreng gedaan?",
      "Wat is het risico als de juridische grondslag door de rechter wordt aangevochten?",
      "Welke alternatieven zijn overwogen en waarom is voor deze aanpak gekozen?"
    ]
  },
  "advies": "..."
}
```

---

## HOE JE WEET OF HET BETER IS

Je bent niet klaar als je de architectuur hebt gebouwd. Je bent klaar als je
het hebt aangetoond. Doe dit:

1. Selecteer 10 voorstellen uit tb_raadsvoorstellen met bekende score-3 gaps
   in tb_rv_vragen (joins op rv_id, filter rubric_gap_score=3,
   staat_al_in_voorstel IN ('nee','deels')). Gebruik tb_rv_analyse.volledige_tekst
   als input, eerste 6000 tekens.

2. Draai voor elk voorstel:
   - De huidige (oude) toets — één call, huidige SYSTEM_PROMPT
   - De nieuwe tweefasige toets

3. Vergelijk per voorstel:
   - Hoeveel kandidaten verwerpt Pass 2?
   - Hebben overgebleven bevindingen een bewijs-citaat? (ja/nee per bevinding)
   - Zijn herstelacties concreet en actiegericht, of generiek?
   - Welk % van bekende score-3 gaps wordt nog gesignaleerd? (recall-check)
   - Vertoont de score meer spreiding dan 70-80%?
   - Zijn de 5 raadsvragen voorstel-specifiek of generiek?

4. Schrijf vergelijking naar:
   C:\dev\Raadsvoorstellen\analyse-tweefasige-toets.md

   Wees eerlijk. Als Pass 2 te veel verwerpt en recall te ver daalt:
   pas de validatieprompt aan (minder streng). Als bevindingen nog steeds
   generiek zijn: scherp de bewijsverplichting aan. Blijf itereren tot:
   - Minimaal 80% van bevindingen heeft een concreet bewijs-citaat
   - Recall niet meer dan 10pp gedaald ten opzichte van huidige toets
   - Scores spreiden tussen 40-95% over de testset
   - Minstens 80% van raadsvragen is voorstel-specifiek (niet generiek)
   - Elk BLOKKEREND-bevinding heeft een `herstelbaar_voor_behandeling` veld
   - WCAG en B1 zijn gemarkeerd als indicatief in UI en JSON

5. Pas op: een toets die alleen maar verwerpt is ook geen verbetering.
   Balans tussen precisie en recall is het doel.

---

## IMPLEMENTATIEDETAILS

- Beide passes: gpt-4o-mini, temperature=0
- Pass 2 mag gpt-4o gebruiken als validatiekwaliteit significant verbetert —
  onderbouw die keuze in het logbestand
- Score wordt server-side berekend na JSON-parse, niet door het model geschat
- Totale toets maximaal 15 seconden
- Fallback: Pass 2 faalt → gebruik Pass 1 output direct, log fout, blokkeer nooit
- `node --check server.js` moet slagen

---

## AFSLUITING

Commit en push naar C:\dev\Raadsvoorstellen\ als de vergelijkingsanalyse
de kwaliteitscriteria haalt. Log alle iteraties in dynamische-rubric-log.md.
NOOIT committen of pushen naar C:\dev\Toolbox\.

## DEFINITIE VAN KLAAR

Je bent klaar als aan alle volgende voorwaarden is voldaan — niet eerder:

✅ `node --check server.js` slaagt zonder fouten
✅ Tweefasige toets draait end-to-end zonder crashes of parse-fouten
✅ Score is server-side berekend (model schat nooit zelf)
✅ Vertrouwensscore aanwezig in output
✅ B1, titelcheck, WCAG aanwezig als indicatief resultaat
✅ Vijf checks in Pass 1 aanwezig (A t/m F minus één: A-F)
✅ Herstelbaar_voor_behandeling aanwezig per BLOKKEREND-bevinding
✅ Raadsvragen (3–5) aanwezig en voorstel-specifiek
✅ Favicons toegevoegd aan de HTML
✅ Vergelijkingsanalyse op 10 voorstellen gedraaid
✅ Minstens 80% van bevindingen heeft een concreet bewijs-citaat
✅ Recall niet meer dan 10pp gedaald t.o.v. huidige toets
✅ Scores spreiden zichtbaar over de testset (niet allemaal 70-80%)
✅ Gecommit en gepusht naar main

Als één van deze punten niet gehaald is: ga terug, pas aan, probeer opnieuw.
```
