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
