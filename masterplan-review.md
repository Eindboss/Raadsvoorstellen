# Review masterplan dynamische rubric

Datum: 2026-04-25

## Samenvatting

Het plan is technisch haalbaar en de richting is goed: historische score-3 fractievragen zijn een bruikbare bron voor type-specifieke kwaliteitschecks. Maar het plan is op een paar punten te optimistisch. De belangrijkste correcties:

- Sla `hoofd_type` en `sub_type` niet primair als losse JSON in `tb_rv_analyse.typering` op als dit onderdeel wordt van runtime-retrieval. Gebruik ten minste gegenereerde/losse kolommen of een aparte classificatietabel met indexen.
- Bereken de gap-matrix niet live binnen `/api/toets`. Gebruik een materialized view of tabel die periodiek wordt ververst. Live aggregatie is niet nodig en introduceert latency en faalpunten.
- De taxonomie van 11 hoofdtypen is bruikbaar als eerste laag, maar te grof voor sommige clusters. Vooral `financien-penc`, `ruimte-grond-vastgoed` en `beleid-kaderstelling` zullen intern heterogeen zijn.
- `n_voorstellen >= 5` is te laag als activatiedrempel voor productieprompting. Gebruik minimaal 10 unieke voorstellen per hoofdtype-gap, of toon lager alleen als experimentele context.
- Validatie met 10 voorstellen en een succescriterium van 60% recall is te klein en niet scherp genoeg. Meet recall én precisie op een geblindeerde holdoutset.

## 1. Technische haalbaarheid

### Opslag: JSON in `tb_rv_analyse.typering` versus aparte kolom

`tb_rv_analyse.typering` als JSON is acceptabel voor een eerste classificatie-experiment, maar niet de beste structurele keuze voor een runtime-systeem.

Problemen met alleen JSON in `tb_rv_analyse.typering`:

- `tb_rv_analyse` lijkt in de bestaande pipeline vooral analyse-uitvoer rond voorsteltekst te bevatten. Voorsteltype is een eigenschap van het raadsvoorstel zelf, niet van een analyse-run.
- JSON maakt filtering, indexering, datakwaliteitscontroles en reporting lastiger dan nodig.
- De voorgestelde SQL gebruikt `a.typering->>'hoofdType'`; zonder expressie-index of gegenereerde kolom wordt dit onnodig duur zodra de dataset groeit.
- Er is geen duidelijke versieerbaarheid: als de classificatieprompt of taxonomie wijzigt, is onduidelijk welke typering met welk model of prompt is gemaakt.

Aanbevolen opslag:

1. Voor MVP: voeg expliciete kolommen toe aan `tb_raadsvoorstellen`:
   - `hoofd_type text`
   - `sub_type text`
   - `type_confidence numeric`
   - `type_model text`
   - `type_prompt_version text`
   - `type_created_at timestamptz`

2. Beter voor beheer en herclassificatie: aparte tabel `tb_rv_classificaties`:
   - `rv_id` foreign key naar `tb_raadsvoorstellen(id)`
   - `hoofd_type`
   - `sub_type`
   - `confidence`
   - `model`
   - `prompt_version`
   - `input_fields`
   - `created_at`
   - `is_active`

De aparte tabel is robuuster als je later taxonomieversies wilt vergelijken. Als je snel waarde wilt leveren, zijn losse kolommen in `tb_raadsvoorstellen` eenvoudiger en voldoende.

Conclusie: JSON in `tb_rv_analyse.typering` is goed voor een proof of concept, maar niet voor productie-integratie in `/api/toets`.

### Live berekende gap-matrix in `/api/toets`

Live berekening is technisch haalbaar bij deze dataset, maar architectonisch niet verstandig.

De dataset is klein: 1.944 vragen en 286 voorstellen in het huidige cohort. Een geindexeerde aggregatie over score-3 vragen zal waarschijnlijk onder 100 ms database-tijd blijven. Via Supabase client, netwerk, TLS, queryplanning en JSON-serialisatie komt daar realistisch 80 tot 250 ms bij. Een directe lookup of RPC op een vooraf berekende tabel zit eerder rond 30 tot 100 ms.

Geschatte extra responsetijd:

- Directe lookup uit gematerialiseerde tabel/view: ongeveer 50-120 ms.
- Live aggregatie met join, unnest en group by: ongeveer 150-400 ms bij huidige omvang.
- Bij koude database, slechte indexen of groei naar veel jaren/gemeenten: 500 ms of meer is realistisch.

Omdat de OpenAI-call zelf waarschijnlijk meerdere seconden duurt, is dit niet de dominante latency. Toch moet de retrieval-stap voorspelbaar en fouttolerant zijn. De gap-matrix verandert niet per aanvraag; live berekenen levert weinig op.

Aanbeveling: materialiseer de matrix in een tabel of materialized view, refresh handmatig of periodiek na labeling/classificatie. `/api/toets` moet alleen:

1. voorstel classificeren,
2. top gaps ophalen via simpele indexed query of RPC,
3. prompt bouwen,
4. OpenAI aanroepen.

### Nodige Supabase schema-wijzigingen

Minimaal nodig:

- Een plek voor voorstelclassificatie:
  - of kolommen op `tb_raadsvoorstellen`,
  - of tabel `tb_rv_classificaties`.
- Een tabel of materialized view voor type-gaps, bijvoorbeeld `mv_rv_type_gaps`.
- Index op hoofdtype:
  - bij losse kolom: `index on tb_raadsvoorstellen(hoofd_type)`;
  - bij JSON: expressie-index op `(typering->>'hoofdType')`.
- Indexen op labelvelden in `tb_rv_vragen`:
  - `rubric_gap_score`
  - `is_generiek`
  - `label_confidence`
  - `rv_id`

Aanbevolen extra velden in de gap-matrix:

- `hoofd_type`
- `informatie_type`
- `n_vragen`
- `n_voorstellen`
- `gem_confidence`
- `voorbeeld_checkpunt`
- `last_refreshed_at`
- `source_prompt_version`
- `source_label_model`
- eventueel `cohort_start` en `cohort_end`

Belangrijk: gebruik geen `overig` als dynamische promptcontext tenzij de onderliggende `suggested_checkpunt` inhoudelijk is geclusterd. In het rapport is `overig` het grootste cluster, maar als informatie_type te diffuus.

## 2. Datakwaliteit

### Is de 11-types taxonomie fijn genoeg?

Als eerste clusteringlaag: ja. Als definitieve basis voor prompt-injectie: deels.

De 11 hoofdtypen zijn bruikbaar om de grove relevantie te bepalen. Ze sluiten bovendien aan op de bestaande `server.js` classificatie-output, wat integratie eenvoudiger maakt. Maar een aantal hoofdtypen is intern te breed:

- `financien-penc`: begrotingen, kredieten, grondexploitaties en P&C-stukken hebben verschillende typische gaps. Bij begrotingen gaat het vaker om structurele effecten, beleidsdoelen, indexatie en taakstellingen. Bij kredieten gaat het vaker om raming, dekking, aanbesteding, overschrijding en uitvoeringsrisico. Bij grondexploitaties spelen waardering, risicoreserve en scenario's.
- `ruimte-grond-vastgoed`: bestemmingsplan/BOPA, aankoop vastgoed en gebiedsontwikkeling vragen andere juridische en participatiechecks.
- `beleid-kaderstelling`: strategische nota's, uitvoeringsprogramma's en beleidswijzigingen zijn inhoudelijk heterogeen.
- `veiligheid-bestuur` overlapt vermoedelijk met `zienswijze-verbonden-partijen` bij gemeenschappelijke regelingen.

Voor MVP is hoofdtype voldoende, mits de retrieval alleen generieke gaps injecteert. Voor hogere kwaliteit moet `sub_type` niet alleen vrije tekst blijven, maar later genormaliseerd worden naar een tweede laag of naar tags zoals `krediet`, `begroting`, `verordening`, `bopa`, `zienswijze-gr`, `subsidie`, `benoeming`.

Conclusie: gebruik hoofdtype voor eerste versie, maar bouw het schema alsof taxonomieversies en subtype-tags later nodig zijn.

### Drempel `n_voorstellen >= 5`

Deze drempel is te laag voor productieprompting. Vijf voorstellen kunnen toevallig één lokaal thema, één politieke periode of één dossierfamilie representeren. Zeker als de data uit één gemeente komt, is er risico dat lokale gewoontes als algemene rubricregels worden gepresenteerd.

Aanbevolen activatiedrempel:

- Productie: minimaal `n_voorstellen >= 10` per combinatie `hoofd_type + informatie_type`.
- Daarnaast minimaal `n_vragen >= 10` of `n_vragen >= 15`, afhankelijk van spreiding.
- Maximaal 1 gap per `informatie_type`, zodat een type niet drie varianten van dezelfde check krijgt.
- Gebruik `label_confidence >= 0.75` in plaats van 0.70 zolang de confidence vaak defaultachtig is.

Als je toch `n_voorstellen >= 5` gebruikt, label de context intern als experimenteel en meet of de AI daardoor meer false positives geeft.

### Risico van AI-gegenereerde samenvatting als classificatie-input

Dit is een reëel risico. De samenvatting kan:

- belangrijke juridische of financiële details weglaten;
- het voorstel te generiek maken, waardoor classificatie naar `overig` of breed hoofdtype schuift;
- hallucinerend of normaliserend formuleren, waardoor een afwijkend voorstel standaard lijkt;
- classificatiefouten versterken omdat zowel samenvatting als classificatie door AI zijn gemaakt.

Gebruik de samenvatting daarom niet als enige bron. De betere inputvolgorde is:

1. titel,
2. beslispunten,
3. eerste deel van de voorsteltekst of toelichting,
4. samenvatting als aanvullende context.

Voor classificatie van historische voorstellen is `tb_rv_analyse.volledige_tekst` waarschijnlijk betrouwbaarder dan alleen `tb_raadsvoorstellen.samenvatting`. Voor runtime in `server.js` is de volledige PDF-tekst al beschikbaar; daar hoeft geen samenvatting tussen.

## 3. Integratie in `server.js`

### Beste plek in de bestaande `callOpenAI`-flow

De huidige `callOpenAI(text)` doet classificatie en toetsing in één OpenAI-call. De dynamische retrieval heeft het hoofdtype nodig vóór de definitieve toets. Daardoor zijn er drie opties:

1. Twee OpenAI-calls:
   - call 1: snelle classificatie naar `hoofdType`, `subType`, `complexiteit`;
   - retrieval: haal type-gaps op;
   - call 2: volledige toets met dynamische context.

2. Heuristische of lokale classificatie vóór de call:
   - goedkoper, maar waarschijnlijk minder betrouwbaar.

3. Eerst volledige toets laten classificeren, daarna opnieuw toetsen met context:
   - dubbel werk en duurder; niet logisch.

Aanbeveling: kies optie 1. De extra classificatiecall is klein en goedkoop. In `server.js` betekent dit:

- maak `classifyProposal(text)` met eigen korte prompt en strict JSON-output;
- maak `getTypeGaps(hoofdType)` met timeout en fallback;
- bouw `SYSTEM_PROMPT` of extra system/developer context dynamisch;
- roep daarna de bestaande volledige toets aan.

Belangrijk: voeg Supabase-clientconfiguratie toe aan `server.js`. Die bestaat nu nog niet. De server gebruikt op dit moment alleen OpenAI, PDF parsing en fetch.

### Promptinjectie-opzet

De gedachte "na rubric, voor gedragsregels, max 3 gaps, ongeveer 150 tokens" is grotendeels goed. Maar de formulering moet scherper.

Risico: "Bij vergelijkbare voorstellen ontbraken het vaakst..." kan door het model worden gelezen als opdracht om deze punten altijd te vinden. Dat veroorzaakt false positives, vooral als het voorstel de informatie wél bevat of als het gap-type niet relevant is voor het subtype.

Betere formulering:

```text
Type-specifieke historische aandachtspunten.
Gebruik deze punten alleen als extra controlelijst. Formuleer alleen een aandachtspunt als het punt concreet ontbreekt in het aangeleverde voorstel en relevant is volgens het toetsprofiel. Negeer een punt als het voorstel deze informatie bevat of als het punt voor dit subtype niet relevant is.
```

Beperkingen:

- Injecteer maximaal 3 gaps.
- Sluit `overig` uit.
- Voeg `n_voorstellen` toe, niet alleen `n`, omdat meerdere vragen bij één voorstel het beeld kunnen vertekenen.
- Vermijd voorbeeldvragen die inhoudelijk te dossier-specifiek zijn. Gebruik liever genormaliseerde checkpunten per informatie_type.

### Verhouding tot toetsprofiel

Hier zit een potentieel conflict. Het bestaande systeem bepaalt per rubriek `niet relevant | licht | normaal | streng`. De dynamische context kan impliciet zeggen dat een gap belangrijk is, terwijl het toetsprofiel dezelfde rubriek op licht of niet relevant zet.

Voorbeeld:

- Historische context voor `financien-penc` noemt participatie omdat dat in eerdere financiële voorstellen voorkwam.
- Het concrete subtype is een technische kredietaanvraag waarbij participatie volgens de bestaande regels meestal wordt overgeslagen.
- Zonder duidelijke instructie kan het model toch participatie gaan afdwingen.

Regel die expliciet in de prompt moet:

- Het toetsprofiel blijft leidend voor relevantie.
- Dynamische gaps verhogen hoogstens de aandacht binnen een relevante rubriek.
- Dynamische context mag nooit een `niet relevant` rubriek activeren, tenzij het voorstel zelf die relevantie concreet maakt.

Daarnaast ontbreekt in de JSON-output van `toetsprofiel` nu een aantal rubricsecties: uitvoering, risico, participatie en naamgeving staan wel in de system rubric, maar niet volledig in het outputschema. Dat maakt integratie van dynamische context rond juist deze nieuwe clusters minder controleerbaar. Het outputschema moet worden bijgewerkt als deze rubrieken structureel meetellen.

## 4. Ontbrekende stappen en risico's

### Wat ontbreekt in het plan

1. Versiebeheer van taxonomie, prompts en labels.
   Zonder `prompt_version`, `label_model`, `classification_model` en `taxonomy_version` kun je resultaten later niet betrouwbaar vergelijken.

2. Holdout-validatie.
   Het plan gebruikt historische vragen als bron en valideert vermoedelijk op dezelfde populatie. Er moet een aparte holdoutset komen die niet gebruikt is voor het kiezen van gaps.

3. Fouttolerantie in `/api/toets`.
   Supabase-storing of retrieval-timeout mag de kwaliteitstoets niet blokkeren. Fallback moet altijd standaard rubric zijn.

4. Monitoring na release.
   Meet per aanvraag:
   - geclassificeerd hoofdtype,
   - opgehaalde gaps,
   - of dynamische context gebruikt is,
   - response latency,
   - parse failures,
   - aantal aandachtspunten per rubriek.

5. Beheer van voorbeeld-checkpunten.
   `suggested_checkpunt` is vrije tekst en in het rapport vaak dossier-specifiek. Er is een normalisatiestap nodig om per `informatie_type` goede, generieke checkzinnen te maken.

6. Dedupe en biascorrectie.
   Eén voorstel met veel fractievragen kan een type-gap domineren. Gewicht daarom per voorstel, niet alleen per vraag.

7. Privacy en opslag van nieuwe toetsen.
   Als nieuwe uploads worden opgeslagen voor terugkoppeling, moet expliciet worden geregeld wat wordt opgeslagen, hoe lang, met welke toestemming, en of documenten persoonsgegevens of vertrouwelijke stukken bevatten.

8. Evaluatie van false positives.
   Het plan focust op het terugvinden van historische gaps, maar niet op onterechte extra aandachtspunten. Voor gebruikerskwaliteit is precisie minstens zo belangrijk.

### Validatie Fase 5

Validatie met 10 voorstellen is onvoldoende. Het succescriterium ">=60% van score-3 gaps worden gesignaleerd" is meetbaar, maar alleen als vooraf duidelijk is:

- welke score-3 gaps als gold labels gelden;
- of meerdere fractievragen over hetzelfde punt worden samengevoegd;
- wat telt als "gesignaleerd";
- hoe false positives worden geteld;
- of de beoordelaar blind is voor oude fractievragen.

Aanbevolen validatie:

- minimaal 30 tot 50 voorstellen, gestratificeerd over hoofdtypen;
- dedupe fractievragen naar unieke gap-checks per voorstel;
- meet recall: welk percentage bekende gaps wordt gevonden;
- meet precisie: welk percentage dynamische aandachtspunten is terecht;
- meet delta ten opzichte van de huidige statische rubric;
- rapporteer per hoofdtype, niet alleen totaal.

Een realistischer succescriterium:

- recall op bekende score-3 gaps stijgt met minimaal 15 procentpunt ten opzichte van baseline;
- precisie van dynamische aandachtspunten is minimaal 70%;
- geen significante stijging van irrelevante checks bij lage-complexiteit voorstellen.

### Terugkoppeling nieuwe toetsen

"Opt-in na validatie" is te vaag. In de praktijk is dit alleen werkbaar als er een aparte workflow komt.

Nieuwe toetsen zijn niet automatisch hetzelfde soort data als historische fractievragen. De historische bron is: vraag van fractie + antwoord + voorsteltekst. Een nieuwe toets levert alleen modelbevindingen, geen democratische terugkoppeling of collegeantwoord. Als je die direct terugvoert in de gap-matrix, train je het systeem op zijn eigen output.

Aanbeveling:

- Gebruik nieuwe toetsen eerst alleen voor logging en evaluatie, niet voor automatische matrix-updates.
- Voeg pas terugkoppeling toe als een gebruiker expliciet markeert: "terecht aandachtspunt", "onterecht", "niet relevant", "ontbrak maar niet gezien".
- Bewaar deze feedback in een aparte tabel, bijvoorbeeld `tb_toets_feedback`.
- Meng gebruikersfeedback niet met historische fractievragen zonder aparte bronweging.

## 5. Volgorde en prioriteit

### Klopt de fasering?

De hoofdrichting klopt, maar de volgorde moet iets worden aangepast.

Niet eerst alles classificeren en daarna pas ontdekken of de matrix bruikbaar is. Doe eerst een kleine end-to-end slice:

1. Classificeer een representatieve subset, bijvoorbeeld 100 voorstellen.
2. Bouw een tijdelijke offline gap-matrix.
3. Inspecteer per hoofdtype de top gaps handmatig.
4. Normaliseer checkpunten en sluit `overig` uit.
5. Pas daarna pas alle voorstellen classificeren.

Ook moet Fase 5 deels naar voren. Validatie moet niet pas na serverintegratie beginnen. Eerst offline aantonen dat de dynamische context betere signalen oplevert dan de huidige rubric.

Aanbevolen fasering:

1. Datamodel kiezen: losse kolommen of classificatietabel, plus prompt/taxonomieversies.
2. Classificatieprompt maken en op 100 voorstellen valideren.
3. Offline gap-matrix bouwen en handmatig beoordelen.
4. Checkpunten normaliseren per type en informatie_type.
5. Baselinevalidatie doen tegen huidige `server.js`-rubric op holdoutset.
6. Pas daarna Supabase view/RPC en serverintegratie.
7. Productie met logging en fallback.
8. Later pas opt-in feedbackloop.

### MVP die al waarde levert

De minimale implementatie die waarde levert:

1. Classificeer historische voorstellen naar `hoofd_type` met versie en confidence.
2. Bouw een offline/materialized `rv_type_gaps` tabel met per hoofdtype maximaal 3 gaps, exclusief `overig`, minimaal 10 unieke voorstellen.
3. Voeg in `server.js` een kleine pre-classificatiecall toe.
4. Haal de top 3 gaps op via simpele query met timeout.
5. Injecteer ze als extra controlelijst, ondergeschikt aan het toetsprofiel.
6. Log alleen metadata, geen volledige uploads.

Nog kleiner MVP zonder database-integratie in `/api/toets`:

- Genereer een statisch JSON-bestand met `hoofdType -> top gaps`.
- Laad dit bestand in `server.js`.
- Gebruik de bestaande classificatie-output niet runtime vóór retrieval, maar voeg een eerste classificatiecall toe.

Dit vermijdt Supabase-latency en schema-risico's en maakt snel zichtbaar of dynamische context de toetskwaliteit verbetert.

## Eindoordeel

Het plan is de moeite waard, maar moet strakker worden op datamodel, validatie en promptveiligheid. De grootste inhoudelijke valkuil is dat historische frequentie niet automatisch betekent dat een check voor elk nieuw voorstel van dat hoofdtype relevant is. De grootste technische valkuil is live aggregatie en JSON-opslag als productiepad.

Mijn advies: begin met een materialized, versieerbare MVP met hoofdtype-only retrieval, sluit `overig` uit, verhoog de activatiedrempel naar minimaal 10 unieke voorstellen, en valideer offline tegen de huidige rubric voordat `/api/toets` wordt aangepast.
