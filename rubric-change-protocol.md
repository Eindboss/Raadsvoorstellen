# Rubric Change Protocol — Raadsvoorstel Kwaliteitscontrole

> Elke promptwijziging moet terug te voeren zijn op een gevalideerd patroon
> én moet in één zin kunnen uitleggen welk foutsignaal de tool daardoor beter herkent.

## Onderzoeksclaim (afbakening)

We analyseren welke vragen ontstaan doordat informatie niet, onvoldoende of onduidelijk
in de raadsvoorsteltekst zelf staat. Dat is direct relevant voor een tool die de kwaliteit
van de voorsteltekst toetst. Bijlagen kunnen aanvullende informatie bevatten, maar vervangen
niet de eis dat het voorstel zelf besluitrijp en begrijpelijk moet zijn.

`staat_al_in_voorstel = nee` betekent: niet aangetroffen in de tekst van het raadsvoorstel.
`hoofd_oorzaak = ontbreekt` betekent: niet in de voorsteltekst, niet noodzakelijk in het hele dossier.
`rubric_gap_score = 3` betekent: sterk kandidaat-checkpunt voor de tool, want de tool beoordeelt
precies die voorsteltekst.

---

## Cohortstrategie

| Cohort    | Gewicht        | Rol                                        |
|-----------|----------------|--------------------------------------------|
| 2023-2026 | Zwaarst        | Basis voor rubricwijzigingen               |
| 2020-2022 | Normaal        | Corroboratie                               |
| 2014-2019 | Ondersteunend  | Trendanalyse, stabiliteitscheck            |

2014-2019 analytisch gescheiden houden. Niet als input voor de eerste rubricverbetering,
wel als check: "is dit een tijdloos hiaat of een periode-effect?"

---

## Mapping informatie_type → rubriek in server.js

| informatie_type | Rubriek                     |
|-----------------|-----------------------------|
| financieel      | 5 – Financiële aspecten     |
| juridisch       | 8 – Juridische kwaliteit    |
| uitvoering      | 7 – Besluitrijpheid         |
| governance      | 6 – Rolzuiverheid           |
| planning        | 9 – Proces en planning      |
| risico          | 7 – Besluitrijpheid         |
| alternatieven   | 2 – Toelichting             |
| participatie    | 2 – Toelichting             |
| definitie       | zie noot                    |

Als een patroon op meerdere rubrieken past: kies de rubriek waar de herstelactie thuishoort.

Noot definitie: bij begripsverwarring door wisselend gebruik van termen → Rubriek 3 Consistentie.
Bij ontbrekende afbakening van scope of doelgroep → Rubriek 2 Toelichting.

---

## Stappen

### 1. Selecteer kandidaten
Neem alleen clusters met:
- `rubric_gap_score = 3`
- `is_generiek = true`
- Minimaal 8-10 Q&A's of minimaal 5 voorstellen
- Hoge validatiebetrouwbaarheid op `hoofd_oorzaak` en `staat_al_in_voorstel`

### 2. Map naar bestaande rubriek
Gebruik bovenstaande tabel. Kies de rubriek waar de herstelactie thuishoort.

### 3. Dedupliceer tegen bestaande prompt
Classificeer elk kandidaat als:
- `nieuw` — komt nog niet voor
- `aanscherping` — bestaande regel is te algemeen
- `voorbeeld` — past als voorbeeld onder bestaande regel, geen aparte regel nodig
- `afwijzen` — te lokaal, te politiek, te zeldzaam of al afgedekt

Beslisregel: een score-3 cluster leidt alleen tot een nieuwe promptregel als het
foutsignaal niet al betrouwbaar wordt afgevangen door een bestaande regel EN als
de nieuwe formulering concreter toetsbaar is dan de bestaande rubrictekst.

### 4. Formuleer als signaalregel
Gebruik alleen toetsbare formuleringen:
- ✓ "Signaleer als de dekking niet herleidbaar is naar begrotingspost of reserve."
- ✗ "Let goed op financiële onderbouwing."

### 5. Test op oude voorstellen
- 5 voorstellen waar het probleem voorkwam
- 5 voorstellen zonder dat probleem
- 2 eenvoudige voorstellen waar de check niet relevant zou moeten zijn

### 6. Check op promptschade
Beoordeel of het nieuwe checkpunt leidt tot:
- Meer terechte signalen
- Minder gemiste signalen
- Geen toename van valse aandachtspunten
- Geen onnodig zware toets bij lichte voorstellen

### 7. Pas toetsprofiel alleen aan bij sterk patroon
Verander `licht/normaal/streng` per voorsteltype alleen als het patroon stabiel is
over meerdere jaren en meerdere voorstellen, niet op basis van één cluster.

---

## Regels voor server.js

- Nieuwe checks komen als extra regels onder bestaande `Signaleer als:`.
- Type-specifieke checks komen onder `Classificatie en toetsprofiel` of `Werkinstructies`.
- Geen nieuwe hoofdrubriek tenzij een patroon nergens past.
- De prompt mag niet langer worden om langer te worden: zwakke regels eruit als nieuwe regels scherper zijn.
- Sommige score-3 patronen horen als voorbeeld onder een bestaande regel, sommige als toetsprofiel-aanpassing, en sommige alleen als bron voor betere raadsvragen — niet elk score-3 patroon wordt een nieuwe regel.

---

## Validatie (confusion matrix)

Steekproef 100-150 Q&A's, gestratificeerd op `rubric_gap_score`, `hoofd_oorzaak` en voorsteltype.
Meet agreement op: `staat_al_in_voorstel`, `hoofd_oorzaak`, `rubric_gap_score`.
Voeg in validatiespreadsheet toe: `mogelijk_in_bijlage: ja / nee / onbekend`.
Pas prompt of labels pas aan na die meting, niet op basis van losse voorbeelden.
