# Onderzoek 7/2-patroon tweefasige toets

Datum: 2026-04-26T06:34:14.622Z

## Bevindingen uit code-analyse

1. Hardcoded limiet op Pass 1-kandidaten: er was geen `slice(0, 7)`, maar wel een structurele bovengrens en promptsturing. De code gebruikte `safeArray(pass1.kandidaten).slice(0, 10)` en de prompt zei letterlijk: "Geef bij een normaal inhoudelijk voorstel 7 tot 10 kandidaten." Dit verklaart waarom de validatieset naar exact 7 convergeerde.

2. Hardcoded limiet op verworpen kandidaten in Pass 2: er was geen directe regel "verwerp 2", maar wel een indirect quotum. `calibrateValidatedFindings()` vulde bij minder dan 3 bevestigde bevindingen aan tot maximaal 5 bevindingen. Bij 7 kandidaten resulteert dat automatisch in 2 verworpen kandidaten.

3. Pass 1 promptstructuur: de instructie "7 tot 10 kandidaten" was de belangrijkste oorzaak. Daarnaast bevatte het JSON-voorbeeld precies één array met kandidaatobjecten, maar dat verklaart niet het getal 7; de expliciete instructie wel.

4. JSON-outputschema: het schema zelf dwong geen exact aantal items af. Wel convergeert een taalmodel bij een numerieke instructie plus compact arrayvoorbeeld vaak naar de ondergrens van de gevraagde bandbreedte. Hier was dat 7.

5. Pass 2-logica: Pass 2 besliste niet volledig onafhankelijk, omdat de calibratieguard na Pass 2 bevindingen toevoegde tot een vaste ondergrens. Dat maakte de uiteindelijke verhouding 7 kandidaten, 2 verworpen, 5 bevindingen structureel.

## Herstel

- Pass 1 prompt aangepast naar: "Geef alle kandidaten die je aantreft. Geen minimum, geen maximum. Een schoon of procedureel voorstel mag 0 tot 3 kandidaten opleveren; een complex voorstel kan veel meer kandidaten opleveren."
- De `slice(0, 10)` op Pass 1-kandidaten is verwijderd.
- `calibrateValidatedFindings()` en de vaste aanvulling tot 5 bevindingen zijn verwijderd.
- Concrete Pass 1-kandidaten die door een te strenge Pass 2 volledig verdwijnen, worden alleen nog per kandidaat behouden als ze een concreet tekstueel of ontbrekend element bevatten. Dit is geen quotum: het aantal behouden punten hangt af van de inhoud.
- Logging toegevoegd per `/api/toets`-verzoek: Pass 1-kandidaten, Pass 2-verworpen, overgebleven bevindingen, score en fallbackstatus.

## Hervalidatie 10 voorstellen

Na herstel is `scripts/validate-two-phase.js` opnieuw gedraaid op dezelfde validatieset met score-3 gaps.

- Kandidaten varieerden van 3 tot 5.
- Verworpen kandidaten varieerden van 0 tot 1.
- Bevindingen varieerden van 2 tot 5.
- Oude recall: 50,0%.
- Nieuwe recall: 44,4%.
- Recall-delta: -5,6pp. Dat blijft binnen de afgesproken marge van maximaal 10pp daling.
- Bevindingen met bewijs: 100,0%.
- Concrete herstelacties: 100,0%.
- Scorespreiding: 43-76. De oude uniforme 70-80-band is weg, maar de testset is nog steeds zwaar omdat hij bewust voorstellen met score-3 gaps selecteert.

## Scoreconclusie

De scoreband is niet meer uniform. In de zware validatieset liggen scores tussen 43 en 76. In de aparte variatietest krijgt een lichter procedureel voorstel een hogere score (76) en een ruimtelijke BOPA-casus met weinig bevestigde bevindingen 92. Een complex financieel voorstel scoort 43. De resterende bandbreedte wordt dus vooral bepaald door de gekozen testset, niet door een nieuwe vaste scorecap.

## Variatietest na herstel

| test | id | type | titel | kandidaten | verworpen | bevindingen | score | fallback |
|---|---:|---|---|---:|---:|---:|---:|---|
| procedureel: zienswijze | 139 | zienswijze-verbonden-partijen | Zienswijze ontwerpbegroting 2025 DCMR | 4 | 0 | 4 | 43 | nee |
| procedureel: personeel/organisatie | 327 | personeel-organisatie | Vertegenwoordiging in besturen van gemeenschappelijke regelingen    | 4 | 1 | 3 | 76 | nee |
| complex financieel | 56 | financien-penc | Kaderbrief 2026 | 4 | 0 | 4 | 43 | nee |
| beleidsnota | 545 | beleid-kaderstelling | Ontwerp Actieplan geluid 2019-2023 | 4 | 1 | 3 | 76 | nee |
| ruimte/grond/vastgoed | 19 | ruimte-grond-vastgoed | Onderbouwing BOPA Westdonck | 4 | 3 | 1 | 92 | nee |
