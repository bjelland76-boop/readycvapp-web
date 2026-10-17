# readycvapp.no

Landingssiden til ReadyCV, publisert med GitHub Pages fra `main`. De eksisterende sidene (`index.html`, `privacy-policy.html`, `slett-konto.html`) er vanlig HTML og endres ikke av innholdsrutinen.

## Innholdsrutinen – kort fortalt

1. To ganger i uka (mandag og torsdag morgen) skriver GitHub Actions nye artikler for hvert **aktivt** språk.
2. Hver artikkel må bestå kvalitetssjekken (se under). Artikler som stoppes, lagres ikke.
3. Godkjente artikler lagres som **utkast** i `content/drafts/<språk>/` og samles i **én pull request**: «Artikkelutkast til gjennomgang».
4. Du leser, godkjenner og merger. Ingenting vises på readycvapp.no før du publiserer.

Utkastene ligger i repoet, men aldri på nettsiden: `_config.yml` holder `content/` og `scripts/` utenfor GitHub Pages. Repoet er offentlig, så utkast kan leses på GitHub.

## Godkjenne og publisere utkast

1. Åpne pull requesten **Artikkelutkast til gjennomgang** → *Files changed*.
2. For hver artikkel du vil ha:
   - Les teksten, og rett gjerne direkte i filen (… → *Edit file*).
   - Endre `approved: false` til `approved: true`.
3. Artikler du ikke vil ha: slett filen i PR-en. Temaet står da som `draft` i `content/topics.json`. Sett det tilbake til `queued` hvis du vil ha et nytt forsøk.
4. Merge pull requesten.
5. Publiser: **Actions → Publiser godkjente utkast → Run workflow**.
   - Lokalt kan du i stedet kjøre `npm run publish-drafts` og deretter pushe.
   - Bestemte artikler: `npm run publish-drafts -- no/cv-uten-erfaring`.

Publiseringen:
- flytter utkastet til `content/published/`
- lager siden `/<språk>/<slug>/` og språkforsiden `/<språk>/`
- legger inn hreflang mellom språkversjoner av samme tema
- oppdaterer `sitemap.xml`
- sjekker på nytt lenker, UTM, app-bokser og priser. Et utkast som ikke består, blir ikke publisert, og grunnen vises i loggen.

Rett en publisert artikkel: rediger `content/published/<språk>/<slug>.md` og kjør `npm run build-site`.

## Slå språk av og på

Alt styres i `content/languages.json`:
- `"enabled": true` eller `false`.
- Start: `no` og `en` er på, `da`, `sv` og `vi` er av.
- Engelsk (`en`) er skrevet for folk som søker jobb **i Norge** på engelsk: utenlandske studenter, nyankomne, arbeidsinnvandrere og internasjonale jobbsøkere. Artiklene bruker norske portaler, norske CV-normer og norsk søknadsskikk.
- Høyst `maxActiveLanguages` (2) språk brukes samtidig, i den rekkefølgen de står i filen.

`enabled` gjelder både skriving og visning. Slår du av et språk, fjernes sidene for det ved neste `npm run build-site` eller publisering.

**Nytt språk** er én linje i `languages`:

```json
{ "code": "de", "name": "Deutsch", "market": "Jobbsuchende in Deutschland", "enabled": false }
```

Legg gjerne til:
- `marketNotes`: lokal søknadskultur og portaler, skrevet på engelsk til modellen
- `portals`: lenker som er lov i artiklene
- `ui`: tekster på siden. Uten `ui` brukes engelsk.

Legg så inn temaer for språket i `content/topics.json`.

## Temaplan (`content/topics.json`)

Hvert tema har:
- `slug`, `lang`, `title` (arbeidstittel), `keyword` (hovedsøkeord), `purpose`, `appAngle` (hvordan appen passer naturlig inn) og `priority` (lavest skrives først)
- `status`: `queued`, `draft` eller `published`
- `translations`: samme tema på andre språk, til hreflang

Temaene er skrevet per marked, ikke oversatt. Etter et forsøk som ble stoppet, viser `last_error` hvorfor. Etter 2 forsøk hoppes temaet over.

## Automatisk publisering

Standard er **av**. Slå på: GitHub → *Settings → Secrets and variables → Actions → Variables* → `AUTO_PUBLISH` = `true`. Da publiserer workflowen nye artikler som består kvalitetssjekken rett på `main`, uten pull request. Sett den tilbake til `false` (eller slett variabelen) for å få pull requests igjen.

Andre variabler på samme sted, alle valgfrie:

| Variabel | Standard | Hva |
|---|---|---|
| `CONTENT_ENABLED` | `true` | `false` stopper hele rutinen |
| `MAX_ARTICLES_PER_LANGUAGE_PER_WEEK` | 3 | Maks nye artikler per språk siste 7 dager |
| `MAX_ARTICLES_PER_RUN` | 2 | Per språk per kjøring (to kjøringer i uka gir 2 + 1) |
| `MAX_ACTIVE_LANGUAGES` | 2 | Maks aktive språk samtidig |
| `CONTENT_MODEL` | `claude-opus-5-5` | Modell for skriving og kontroll |

Standardverdiene står i `content/site.json`.

## Kvalitetssjekken

Et utkast stoppes ved:
- **Meta:** tittel over 60 tegn, meta description over 155 tegn, eller manglende H1.
- **Struktur:** færre enn 3 H2 eller færre enn 3 FAQ-spørsmål.
- **Lengde:** under 800 ord. For vietnamesisk telles stavelser, minst 1200.
- **Duplikat:** samme tittel, eller mer enn 15 % felles tekst med en eksisterende side på samme språk.
- **Tall og fakta:** prosenter, beløp, «x av y», lovhenvisninger og tall knyttet til «studier» eller «statistikk».
- **Priser:** pris eller beløp hvor som helst i artikkelen eller app-boksene.
- **Språk:** feil språk. Norsk, dansk og svensk skilles fra hverandre.
- **Ekte organisasjoner:** navn på ekte skoler, idrettslag, bedrifter, kjeder eller personer i eksemplene. Bruk «X videregående skole», «Y AS» eller «et lokalt idrettslag». Portaler og NAV kan nevnes som det de er.
- **Uttrykk som ikke passer markedet:** for engelsk «charity shop», «food bank», «secondary school» (alene), «BSc», «dissertation» og «modules». Listen ligger i `bannedTerms` i `languages.json`.
- **Vage setninger:** for eksempel «each country has its own portals» uten et konkret eksempel.
- **App-løfter:** app-boksene og teksten får bare love det som står i `ctaPromises` i `content/site.json`: lime inn en annonse, få vurdering av hvor godt du passer, få CV og søknad tilpasset jobben, starte gratis uten konto, og laste opp en eksisterende CV for analyse.
- **Lokal tilpasning:** Kontrollen må gi minst 4 av 5.
- **Språkfeil og motsigelser:** grammatikk- og samsvarsfeil, unødvendige engelske lånord, kjønning av generelle roller («arbeidsgiveren … hun») og råd som motsier hverandre i samme artikkel. Kontrollen skal bare stoppe tydelige feil, ikke stilvalg.
- **Lenker som ikke virker:** Alle lenker åpnes før utkastet lagres og før det publiseres. Lenker som ikke svarer, gir 404/410 eller 5xx, eller som videresender til en annen adresse, stoppes. 401, 403 og 429 godtas, fordi de som regel er bot-beskyttelse som vanlige nettlesere kommer forbi.
- **Oversatt preg:** En egen kontroll med modellen vurderer om teksten er naturlig skrevet for markedet, om den ser oversatt ut, og om den inneholder påstander som ikke kan bekreftes.
- **Webapp-lenken:** manglende app-boks (tekst eller plassering), feil UTM, mer enn én ekstra app-lenke, eller lenker utenfor tillatt-listen (appen, egne publiserte artikler og portalene i `languages.json`).

Får et utkast problemer, prøver scriptet én gang til med en liste over hva som må rettes, før det gir opp.

## Webappen og sporing: hvilke artikler gir trafikk?

Hver artikkel har to rolige app-bokser, én midt i og én nederst:
- Teksten er tilpasset temaet og skrevet på artikkelens språk.
- Hovedlenken går til webappen `https://app.aerlig.no`. Det er samme app som forsiden lenker til. Brukeren kan prøve gratis uten innlogging.
- Google Play er en sekundær lenke ved siden av.
- Artiklene nevner aldri priser.

**UTM-parametrene** står på alle lenker fra en artikkel til webappen:

| Parameter | Verdi | Betyr |
|---|---|---|
| `utm_source` | `readycvapp` | Klikket kom fra readycvapp.no |
| `utm_medium` | `artikkel` | Fra en artikkel (ikke forsiden eller annonser) |
| `utm_campaign` | artikkelens slug, f.eks. `cv-uten-erfaring` | Hvilken artikkel |

På språkforsidene er `utm_campaign` = `oversikt-<språk>`. Webappen reagerer ikke på parametrene. Den åpner som vanlig, og innlogging og anonym profil påvirkes ikke.

**Se trafikken i Google Analytics** (samme GA4-konto som forsiden, `G-6QXCPDB0BK`). Bare besøkende som har trykket «Godta» i cookie-banneret, telles.
- **Hvor mange som leser hver artikkel:** *Rapporter → Engasjement → Sider og skjermer*. Filtrer på `/no/` eller `/en/`.
- **Hvilke artikler som sender folk til appen:** hendelsen `article_cta_click` sendes når noen trykker på en app-boks. Den har parametrene:
  - `article_slug`: artikkelen
  - `cta_position`: `app-mid`, `app-end`, `play-mid` eller `play-end`
  - `link_url`: lenken, med UTM
  
  Se den i *Rapporter → Engasjement → Hendelser → article_cta_click*. Vil du se per artikkel, må du registrere `article_slug` og `cta_position` som egendefinerte dimensjoner én gang: *Administrator → Egendefinerte definisjoner → Opprett egendefinert dimensjon*, omfang *Hendelse*, hendelsesparameter `article_slug`. Gjør det samme for `cta_position`. Data vises fra den dagen dimensjonen er laget. Deretter kan du lage en utforskning med *Hendelsesnavn = article_cta_click*, rader `article_slug` og kolonner `cta_position`.
- Webappen (`app.aerlig.no`) har ingen Google Analytics i dag. UTM-verdiene vises derfor ikke på appens side, men de står i `link_url` på klikket, og er klare hvis appen får måling senere.

## Kommandoer (lokalt, Node 20 eller nyere, ingen `npm install` nødvendig)

```bash
npm test                                   # alle tester (falsk API, ingen ekte kall)
npm run generate -- --dry-run              # vis hva som ville blitt skrevet, uten API-kall
ANTHROPIC_API_KEY=... npm run generate     # som workflowen: aktive språk og ukegrensene
ANTHROPIC_API_KEY=... npm run generate -- --lang da,sv,vi --count 2 --include-disabled   # eksempelutkast for avslåtte språk
npm run publish-drafts                     # publiser godkjente utkast
npm run refresh-drafts                     # oppdater eksisterende utkast med nye app-lenker/UTM
npm run build-site                         # bygg artikkelsidene og sitemap på nytt
npm run check-links                        # åpne alle lenker i utkast, publiserte artikler og portaler
ANTHROPIC_API_KEY=... npm run review-drafts                        # full kvalitetssjekk (med kontrollmodellen) etter håndredigering
ANTHROPIC_API_KEY=... npm run review-drafts -- no/cv-uten-erfaring  # bare ett utkast
```
