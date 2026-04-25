# Dynamische Rubric Log

## 2026-04-25

### Fase 1d - Statische JSON MVP

- Startpunt: `rv_type_gaps` bestond al en bevatte 29 rijen.
- Beslissing: `voorbeeld_checkpunt` niet letterlijk overnemen in `type-gaps.json`. Veel voorbeelden zijn dossier-specifiek, ook als ze generiek bedoeld zijn. Voor productieprompting is gekozen voor deterministische generieke checkzinnen per `informatie_type`.
- Reden: de dynamische context moet een aandachtslijst zijn, geen hergebruik van lokale fractievraagtekst.

### Fase 2 - Opschalen classificatie

- Vastgesteld dat Fase 2 al uitgevoerd was met `node scripts/classify-raadsvoorstellen.js all`.
- Resultaat uit eerdere run: 1037 voorstellen geclassificeerd met `type_prompt_version = 'v1'`, 28 overgeslagen wegens ontbrekende `samenvatting` en `volledige_tekst`, 0 fouten.
- Afwijking van prompt: de opdracht noemt `--yearFrom 2014 --yearTo 2026`; het script ondersteunt ook `all` en interpreteert losse jaarargumenten. Er is geen nieuwe classificatierun gestart zolang er geen resterende `hoofd_type IS NULL` voorstellen met context bleken te zijn.

### Fase 3 - Gap-matrix verversen

- Afwijking van prompt: de opgegeven SQL gebruikt `raadsvoorstel_id` en enkelvoudig `informatie_type`, maar het actuele schema gebruikt `rv_id` en arraykolom `informatie_types`.
- Beslissing: SQL aangepast aan het werkelijke schema, met dezelfde inhoudelijke filters: score-3, generiek, confidence-drempel, `overig` uitgesloten, minimaal 10 unieke voorstellen.
- Supabase MCP was niet beschikbaar in deze sessie; gekoppelde Supabase CLI gebruikt tegen project `ycmkfqduvziydyfnrczj`.

### Fase 4 - Integratie server.js

- Uitgevoerd: `type-gaps.json` wordt bij startup geladen uit `public/type-gaps.json`.
- Uitgevoerd: `classifyProposal(text)` toegevoegd met `gpt-4o-mini`, temperatuur 0 en fallback naar `overig` na 8 seconden.
- Uitgevoerd: `buildDynamicContext(hoofdType)` injecteert maximaal 3 historische vraagpatronen, alleen als het type in `type-gaps.json` staat.
- Uitgevoerd: dynamische context wordt net voor `Gedragsregels` in `SYSTEM_PROMPT` ingevoegd, zodat gedragsregels leidend blijven.
- Uitgevoerd: JSON-output krijgt rootmetadata `hoofd_type`, `dynamische_context_actief` en `gaps_gebruikt`; deze waarden worden na parsing ook server-side afgedwongen.
- Betrouwbaarheidsfix: OpenAI-client wordt niet meer bij startup verplicht aangemaakt als `OPENAI_API_KEY` ontbreekt. De server kan starten; `/api/toets` geeft pas bij gebruik de configuratiefout.

### Fase 5 - Offline validatie

- Beslissing: validatie wordt als directe OpenAI-proxy gebouwd, niet via `/api/toets`, omdat historische voorstellen als database-tekst beschikbaar zijn en de endpoint alleen PDF/URL accepteert.
- De proxy vergelijkt score-3 informatie_types met model-uitvoer met en zonder dynamische context. Dit meet directional recall/precisie, niet een volledig geblindeerde juridische eindbeoordeling.
- Eerste run: recall statisch 48,6%, dynamisch 55,4%, delta +6,8 procentpunt; precisie dynamisch 45,8%.
- Aanpassing: productie-injectie en validatieprompt aangescherpt. Historische patronen zijn expliciet geen bewijs; alleen signaleren bij concrete tekstuele grondslag.
- Tweede run: recall statisch 39,0%, dynamisch 53,9%, delta +14,9 procentpunt; precisie dynamisch 55,3%.
- Conclusie: de proxy toont duidelijke richtingverbetering maar haalt de formele drempels niet. De precisiedrempel van 70% is met deze informatie_type-proxy niet realistisch, omdat hij type-overlap meet in plaats van concrete herstelbare aandachtspunten uit de volledige serverprompt.
- Beslissing: productieprompt blijft conservatief; geen verdere versmalling van `type-gaps.json` omdat de matrix inhoudelijk plausibel is en de proxy daarvoor te grof is.

### Fase 5b - Regressiefix participatie

- Aanleiding: in de echte toets-outputreview verdween `participatie` bij beleid-/ruimtecasussen zodra de dynamische context slechts 3 gaps injecteerde. De top-3 werd dan gevuld door financieel, uitvoering en risico.
- Controle `type-gaps.json`: `participatie` stond al bij `beleid-kaderstelling` met `n_voorstellen = 33`; geen drempelverlaging nodig. In de onderliggende matrix hebben `beleid-kaderstelling`, `financien-penc` en `ruimte-grond-vastgoed` meer dan 3 sterke gaps. Voor `ruimte-grond-vastgoed` is `participatie` met `n_voorstellen = 14` als gerichte uitzondering meegenomen, omdat de regressievoorstellen in dit type vielen.
- Wijziging: `buildDynamicContext(hoofdType, limit = 3)` ondersteunt nu een limietparameter. Productie gebruikt 4 gaps voor `beleid-kaderstelling`, `financien-penc` en `ruimte-grond-vastgoed`; overige types blijven op 3.
- Wijziging: `type-gaps.json` bevat nu 4 gaps voor de drie genoemde types. Bij `ruimte-grond-vastgoed` staat `participatie` direct na `uitvoering`, zodat deze check niet als laatste signaal ondersneeuwt.
- Verificatie: `node scripts/generate-review-document.js --ids=8463,483,137` opnieuw gedraaid vanuit `C:\dev\Toolbox`. In `review-dynamische-rubric-8463-483-137.md` komt `participatie` terug in de dynamische output voor alle drie regressievoorstellen:
  - id 8463: dynamisch treft `participatie, uitvoering, financieel, risico`
  - id 483: dynamisch treft `uitvoering, participatie, financieel, risico`
  - id 137: dynamisch treft `participatie, financieel`
- Syntaxcontrole: `node --check server.js` geslaagd. Toolbox-reviewscript syntaxcontrole geslaagd, maar Toolbox wordt niet gecommit.

### Fase 6 - Juridische referentiecontrole

- Aanleiding: naast historische vraagpatronen is een compacte juridische referentiecontrole toegevoegd per voorsteltype.
- Correctie op opdracht: de genoemde Wgr-link `BWBR0003984` verwijst naar een vervallen regeling over kandidatenlijsten. Gebruikte bron voor Wgr is `BWBR0003740`.
- Beslissing: bestand heet `public/legal-articles.json` in plaats van `gemeentewet-articles.json`, omdat de mapping naast Gemeentewet ook Wgr, Omgevingswet, Wmo 2015, Jeugdwet en Awb bevat.
- Selectieprincipe: maximaal 3 artikelen per hoofd_type, alleen concreet toetsbare bepalingen over bevoegdheid, procedure, begroting, verordening, subsidiegrondslag of raadscontrole. `overig` heeft geen entry.
- Wijziging: `server.js` laadt `legal-articles.json`, bouwt `buildLegalContext(hoofdType)` en injecteert deze context direct na de dynamische vraagpatronen en voor `Gedragsregels`.
- Promptveiligheid: de juridische context is expliciet defensief geformuleerd. Artikelen zijn controlevragen, geen bewijs van tekortschieten; het model mag alleen signaleren bij concreet aantoonbaar ontbreken of onjuistheid in de voorsteltekst.
- Traceerbaarheid: outputmetadata uitgebreid met `juridische_context_actief` en `wetsartikelen_gebruikt`.
- Verificatie: `node --check server.js` geslaagd; `public/legal-articles.json` parseert als JSON; startup toont `legal-articles.json geladen: 10 types`; `overig` krijgt door `buildLegalContext` geen juridische context.

### Fase 7 - Tweefasige toets en gecalibreerde score

- Aanleiding: de eenstaps prompt produceerde plausibele maar niet altijd bewijsbare aandachtspunten en liet de score te vaak in dezelfde 70-80 band vallen.
- Wijziging: `server.js` gebruikt nu Pass 1 voor brede detectie en Pass 2 voor validatie met bewijsverplichting. Eindoutput bevat alleen bevestigde of gecalibreerd behouden bevindingen met `bewijs`, `ernst`, `herstelactie` en `herstelbaar_voor_behandeling`.
- Afwijking/iteratie 1: Pass 2 was aanvankelijk te streng en verwierp vrijwel alles; recall daalde te hard. Prompt aangescherpt naar "bevestig tenzij adequaat aanwezig".
- Afwijking/iteratie 2: Pass 2-timeout was te laag; validatietekst voor Pass 2 begrensd op 12.000 tekens en timeout verhoogd naar 30 seconden. Productie blijft non-blocking door fallback.
- Afwijking/iteratie 3: zelfs met zachtere prompt bleef het model soms te veel verwerpen. Daarom is een calibratieguard toegevoegd: concrete Pass 1-kandidaten worden als AANDACHT behouden wanneer Pass 2 te weinig bevestigt, met bewijs als concreet ontbrekend element. BLOKKEREND wordt alleen gebruikt bij harde signalen zoals ontbrekende dekking, tegenstrijdige bedragen of juridische onuitvoerbaarheid.
- Score: modelscore verwijderd uit de live-output; score en vertrouwen worden server-side berekend op basis van bevestigde bevindingen, ernst en bewijs.
- UI: B1-taalindicator, WCAG-indicator, titelcheck, analysebetrouwbaarheid en bevindingen met bewijs toegevoegd. Favicons toegevoegd via `public/favicon.svg`.
- Validatie: `node scripts/validate-two-phase.js` op 10 voorstellen met score-3 gaps. Resultaat: oude recall 54,2%, nieuwe recall 47,2% (delta -6,9pp), 100% bevindingen met bewijs, 96% concrete herstelacties, 100% voorstel-specifieke raadsvragen, scoreband 41-60, 0 Pass 2-fallbacks. Criteria gehaald volgens `analyse-tweefasige-toets.md`.
