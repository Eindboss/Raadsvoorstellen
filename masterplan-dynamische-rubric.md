# Masterplan: Dynamische Rubric op Basis van Historische Gebruikersdata

**Datum**: 2026-04-25  
**Versie**: 2.0 (herzien na Codex-review)  
**Doel**: De kwaliteitstoets in server.js verbeteren van een statische rubric naar een
data-gedreven systeem dat per voorsteltype toetst op wat historisch het vaakst ontbrak.

---

## Aanleiding

De huidige rubric heeft 13 statische secties die voor elk voorstel gelijk zijn.
Op basis van 2.208 gelabelde fractievragen (2016–2026) zijn per voorsteltype patronen
zichtbaar in de onderwerpen waarover fracties vragen stelden.

**Belangrijk uitgangspunt**: fractievragen zijn géén harde kwalificatie of
diskwalificatie van een raadsvoorstel. Vragen worden gesteld om politieke, inhoudelijke
of procedurele redenen — niet uitsluitend omdat iets ontbrak. De historische vraagpatronen
zijn een *aandachtslijst*: onderwerpen die bij dit type voorstel regelmatig aandacht
vroegen. Als het voorstel die informatie al bevat, is er geen aandachtspunt.

De dynamische context is dus geen checklist van verplichte onderdelen, maar een
geheugensteuntje voor de toetser op basis van historische ervaringen.

---

## Databeschikbaarheid

| Bron | Beschikbaar | Bruikbaar voor |
|---|---|---|
| tb_rv_vragen | 1.944 vragen, 286 voorstellen, 257 met score-3 | Gap-database |
| tb_raadsvoorstellen.samenvatting | 1.602 van 1.942 voorstellen | Classificatie-input |
| tb_raadsvoorstellen.titel | Alle voorstellen | Classificatie-input |
| tb_rv_analyse.volledige_tekst | Subset voorstellen | Betere classificatie-input |
| server.js hoofdType-taxonomie | 11 types, consistent in gebruik | Classificatie-taxonomie |
| Labeling 2014-2019 | Loopt (extractie + labeling) | Toekomstige matrix-verrijking |

---

## Taxonomie (bestaand in server.js)

- `personeel-organisatie` — benoemingen, ontslagen, herindelingen
- `zienswijze-verbonden-partijen` — zienswijzen op begrotingen GR-en
- `regelgeving` — verordeningen, beleidsregels
- `financien-penc` — kredieten, begrotingen, grondexploitaties
- `ruimte-grond-vastgoed` — bestemmingsplannen, BOPA, aankopen
- `beleid-kaderstelling` — nota's, strategische kaders
- `controle-moties-toezeggingen` — rekenkamerrapporten, moties
- `bedrijfsvoering-informatie` — ICT, organisatie, jaarstukken
- `sociaal-domein-subsidies` — zorg, onderwijs, subsidies
- `veiligheid-bestuur` — openbare orde, brandweer, GR-en
- `overig`

**Let op**: `financien-penc`, `ruimte-grond-vastgoed` en `beleid-kaderstelling` zijn
intern heterogeen. Classificatie naar sub_type is essentieel voor latere verfijning.
`overig` wordt nooit ingejecteerd als dynamische context.

---

## Opslag (herzien)

### Classificatievelden op `tb_raadsvoorstellen`

Voeg toe via migratie:

```sql
ALTER TABLE tb_raadsvoorstellen
  ADD COLUMN hoofd_type text,
  ADD COLUMN sub_type text,
  ADD COLUMN type_confidence numeric,
  ADD COLUMN type_model text,
  ADD COLUMN type_prompt_version text,
  ADD COLUMN type_created_at timestamptz;

CREATE INDEX idx_rv_hoofd_type ON tb_raadsvoorstellen(hoofd_type);
```

Rationale: voorsteltype is een eigenschap van het voorstel zelf, niet van een analyse-run.
Losse kolommen zijn indexeerbaar, filterbaar en eenvoudig te beheren.
Versievelden (`type_model`, `type_prompt_version`) maken herclassificatie na taxonomiewijziging
traceerbaar.

### Gap-matrix als gematerialiseerde tabel (herzien)

Geen live aggregatie in `/api/toets`. Gebruik een tabel `rv_type_gaps` die offline
wordt gebouwd en periodiek ververst na nieuwe classificatie- of labelruns.

```sql
CREATE TABLE rv_type_gaps (
  hoofd_type text NOT NULL,
  informatie_type text NOT NULL,
  n_vragen integer NOT NULL,
  n_voorstellen integer NOT NULL,
  gem_confidence numeric,
  voorbeeld_checkpunt text,
  last_refreshed_at timestamptz NOT NULL,
  source_prompt_version text,
  source_label_model text,
  PRIMARY KEY (hoofd_type, informatie_type)
);

CREATE INDEX idx_type_gaps_hoofd ON rv_type_gaps(hoofd_type);
```

Activatiedrempel: alleen rijen met `n_voorstellen >= 10`. Maximaal 3 gaps per
hoofd_type in de injectie. `overig` altijd uitgesloten.

---

## Fasering (herzien)

### Fase 1 — End-to-end slice op 100 voorstellen (MVP-validatie)

**Doel**: aantonen dat classificatie werkt en de gap-matrix zinvolle output geeft
vóórdat we alles opschalen of server.js aanraken.

**Stap 1a — Classificatiescript (Toolbox)**  
Script: `C:\dev\Toolbox\scripts\classify-raadsvoorstellen.js`  
Input per voorstel: titel + beslispunten + eerste 2000 tekens volledige_tekst  
(samenvatting alleen als fallback als volledige_tekst ontbreekt)  
Output: hoofd_type, sub_type, type_confidence (0-1), opgeslagen in tb_raadsvoorstellen  
Model: gpt-4o-mini, temperature=0, CONCURRENCY=10  
Eerste run: 100 voorstellen uit 2023-2025 (meest gevarieerd qua type)  

**Stap 1b — Handmatige steekproef**  
Beoordeel 20 geclassificeerde voorstellen handmatig. Doel: ≥85% agreement op hoofd_type.
Pas prompt aan als agreement lager is.

**Stap 1c — Offline gap-matrix bouwen**  
SQL-query (nog geen gematerialiseerde tabel) op de 100 geclassificeerde voorstellen.
Output: per hoofd_type de top-5 gaps. Bekijk handmatig of de gaps per type inhoudelijk
kloppen. Normaliseer suggested_checkpunten naar generieke formulering.

**Stap 1d — Statische JSON als allereerste MVP**  
Genereer `C:\dev\Raadsvoorstellen\public\type-gaps.json` op basis van de offline matrix.
Format:
```json
{
  "financien-penc": [
    { "informatie_type": "uitvoering", "n_voorstellen": 45, "check": "Beschrijft het voorstel wie verantwoordelijk is voor uitvoering en hoe voortgang wordt bewaakt?" },
    ...
  ],
  ...
}
```
Laad dit bestand in server.js (geen Supabase-call nodig in deze fase).
Zo is de dynamische context testbaar zonder schema-risico of latency.

### Fase 2 — Opschalen classificatie

Classificeer alle ~1.600 voorstellen met samenvatting of volledige_tekst.
Inclusief 2014-2019 zodra labeling klaar is.
Sla op in tb_raadsvoorstellen met versievelden.

### Fase 3 — Gematerialiseerde gap-tabel

Bouw `rv_type_gaps` op basis van alle geclassificeerde voorstellen.
Refresh na elke nieuwe classificatie- of labelrun.
Migratie via Supabase apply_migration.

### Fase 4 — Integratie in server.js

Twee OpenAI-calls:
1. Snelle classificatiecall: hoofd_type + sub_type + complexiteit (~200 tokens, <1s)
2. Volledige toets met dynamische context uit Supabase

Flow in server.js:
```
classifyProposal(text) → hoofdType
getTypeGaps(hoofdType) → top 3 gaps (met timeout + fallback)
buildDynamicContext(gaps) → promptinjectie
callOpenAI(text, dynamicContext) → toets-output
```

**Promptinjectie-formaat** (na rubric, vóór gedragsregels):
```
Historische vraagpatronen voor dit voorsteltype (${hoofdType}):
Bij vergelijkbare voorstellen kwamen in het verleden vaak vragen over
onderstaande onderwerpen. Controleer of het voorstel hier voldoende
inzicht in geeft. Als de informatie al aanwezig is: geen aandachtspunt.
Het toetsprofiel blijft leidend — negeer een punt als het voor dit
subtype niet relevant is of als de rubriek op "niet relevant" staat.

- ${gap1.informatie_type}: ${gap1.check} (speelde bij ${gap1.n_voorstellen} vergelijkbare voorstellen)
- ${gap2.informatie_type}: ${gap2.check} (speelde bij ${gap2.n_voorstellen} vergelijkbare voorstellen)
- ${gap3.informatie_type}: ${gap3.check} (speelde bij ${gap3.n_voorstellen} vergelijkbare voorstellen)
```

**Fallback**: hoofd_type = 'overig', of n_voorstellen < 10, of Supabase-timeout
→ geen dynamische context, alleen standaard rubric. Nooit blokkeren.

**Supabase-client toevoegen aan server.js** (bestaat nu nog niet).

### Fase 5 — Offline validatie vóór productie

Minimaal 30-50 voorstellen, gestratificeerd over hoofd_types.
Geblindeerde beoordeling: beoordelaar ziet toets-output maar niet de historische
fractievragen.

Meet:
- **Recall**: welk % van score-3 gaps wordt gesignaleerd door de toets?
- **Precisie**: welk % van de dynamische aandachtspunten is terecht?
- **Delta**: recall en precisie van nieuwe vs. oude (statische) rubric

Succescriteria:
- Recall stijgt met ≥15 procentpunt ten opzichte van baseline
- Precisie dynamische aandachtspunten ≥70%
- Geen significante stijging irrelevante checks bij lage-complexiteit voorstellen

### Fase 6 — Productie + monitoring

Per aanvraag loggen (geen inhoud, alleen metadata):
- geclassificeerd hoofd_type
- opgehaalde gaps (informatie_types)
- of dynamische context gebruikt is
- response latency
- parse failures
- aantal aandachtspunten per rubriek

### Fase 7 — Feedbackloop (later, opt-in)

Aparte tabel `tb_toets_feedback`:
- Gebruiker markeert: terecht / onterecht / niet relevant / gemist
- Nooit automatisch terugvoeren in gap-matrix
- Nooit mengen met historische fractievragen zonder aparte bronweging
- Eerst 3 maanden logging voordat feedback de matrix beïnvloedt

---

## Risico's en mitigaties

| Risico | Mitigatie |
|---|---|
| Taxonomie te grof (financien-penc intern heterogeen) | sub_type opslaan; later normaliseren naar tweede laag |
| Samenvatting als classificatie-input te zwak | Gebruik volledige_tekst als primaire bron; samenvatting als fallback |
| Dynamische context activeert 'niet relevant' rubrieken | Expliciete promptregel: toetsprofiel blijft leidend |
| Supabase-storing blokkeert toets | Altijd fallback naar standaard rubric; timeout van 2s |
| Gap-matrix gedomineerd door één voorstel met veel vragen | Gewicht per uniek voorstel, niet per vraag (n_voorstellen is leidend) |
| Terugkoppeling nieuwe toetsen verpest matrix | Nooit automatisch terugvoeren; altijd via expliciete gebruikersfeedback |
| overig te diffuus | Uitgesloten van dynamische context |

---

## JSON-outputschema server.js (uitbreiding nodig)

De huidige toets-output bevat geen expliciete velden voor uitvoering, risico en
participatie. Bij Fase 4 moet het outputschema worden uitgebreid zodat ook de nieuwe
rubrieksecties meetellen in score en rapportage.

---

## Volgorde

| Fase | Status | Blocker |
|---|---|---|
| Labeling 2020-2026 | ✅ compleet | — |
| Labeling 2014-2019 | ✅ compleet (264 Q&A's, 0 fouten) | — |
| Fase 1a: classificatiescript + 100 voorstellen | ✅ compleet | — |
| Fase 1b: handmatige steekproef (20 voorstellen) | ⏳ aanbevolen, niet uitgevoerd | — |
| Fase 1c: offline gap-matrix | ✅ compleet (29 rijen, 5 hoofd_types) | — |
| Fase 1d: statische JSON MVP in server.js | ✅ compleet (`public/type-gaps.json`) | — |
| Fase 2: opschalen classificatie alle voorstellen | ✅ compleet (1.602 geclassificeerd, 340 zonder context) | — |
| Fase 3: gematerialiseerde gap-tabel Supabase | ✅ compleet (`rv_type_gaps` ververst na Fase 2) | — |
| Fase 4: integratie server.js (2 calls + retrieval) | ✅ compleet — gepusht naar main (d3cba6c) | — |
| Fase 5: offline validatie (30-50 voorstellen) | ✅ proxy-validatie gedraaid (50 voorstellen) — recall +14,9pp, precisie 55,3% | — |
| Fase 5b: echte review 30 voorstellen + regressiefix | ✅ compleet — 14/28 verbeterd, 3 regressies geïdentificeerd en opgelost (a93b4b5) | — |
| Gemeentewet/Wgr referentiecontrole | ✅ compleet — `public/legal-articles.json`, 10 types, 6 wetten (commit 1dccf2d) | — |
| Tweefasige toets (architectuurswitch) | ✅ compleet — Pass 1 detectie + Pass 2 validatie, 100% bewijscitaat, recall -6,9pp (commit 2e92976) | — |
| Fase 6: productie + monitoring | 🔄 gedeeltelijk — logging aanwezig, dashboard ontbreekt | — |
| Fase 7: feedbackloop | ⏳ | 3 maanden productie |

**Eindconfiguratie type-gaps.json (v2, na Fase 5b):**
- `beleid-kaderstelling`: 4 gaps — uitvoering, participatie, financieel, planning
- `financien-penc`: 4 gaps — financieel, uitvoering, risico, participatie
- `ruimte-grond-vastgoed`: 4 gaps — uitvoering, participatie, risico, financieel
- `regelgeving`: 3 gaps — juridisch, uitvoering, financieel
- `zienswijze-verbonden-partijen`: 3 gaps — financieel, uitvoering, risico
- `buildDynamicContext(hoofdType, limit=3)` — limiet per type instelbaar

**Noot validatie Fase 5/5b**: proxy-validatie meet `informatie_type`-overlap (niet kwaliteit van
concrete aandachtspunten). De drie regressies uit Fase 5b zijn opgelost. Resterende validatie
(vals alarm invullen in reviewdocument) is menselijke taak — zie `scripts/output/review-dynamische-rubric.md`.
