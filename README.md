# Sollicitatiesite voor een Discord-server

Een interactieve, Nederlandstalige webapp voor sollicitaties bij een Discord-server. De aanvraag vraagt om een Discord-gebruikersnaam, leeftijd, rol, ervaring, motivatie en beschikbaarheid. De browserinterface praat met een Node.js-server. Inzendingen, statussen en interne notities worden opgeslagen in SQLite in `data/applications.sqlite`; de owner-code wordt eenmalig gehasht ingesteld en blijft op de server. Er staan geen voorbeeldsollicitaties of standaardcodes in het project.

## Eenmalig instellen

Vereist Node.js 22.13 of nieuwer. Er zijn geen externe Node-pakketten nodig.

1. Open een terminal in deze projectmap.
2. Stel je owner-code in: `pnpm owner:setup` (of `node server.mjs setup-owner`). Kies minimaal 8 tekens. De invoer wordt verborgen. De code wordt gehasht opgeslagen; bewaar de code zelf in je wachtwoordmanager.
3. Start de site: `pnpm start` (of `node server.mjs`).
4. Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Klik op **Owner login** en gebruik de code die je zojuist instelde.

Als je de code kwijt bent, wijzig deze dan niet in een bronbestand. Stop de server, maak een back-up van de map `data/`, verwijder alleen het owner-account via een beheerprocedure of herstel de database uit een bekende veilige back-up. Het verwijderen van de database verwijdert ook sollicitaties.

## Wat is inbegrepen

- Sollicitatieformulier voor Moderator, Manager of Administrator, met invoercontrole in de browser én server.
- Eigenaar-login met geheime code buiten de browsercode, een `scrypt`-wachtwoordhash, een HttpOnly/SameSite-cookie, serversessies en beperkte inlogpogingen.
- Privé dashboard met zoekbalk, statusfilters, totalen en aanklikbare sollicitaties.
- Kandidaatdetails, statusgeschiedenis, status wijzigen en interne owner-notities.
- Aanvragen archiveren, vanuit het archief terugzetten en na een aparte bevestiging definitief verwijderen.
- SQLite-opslag die sollicitaties bewaart na verversen of opnieuw opstarten.
- Rate limiting voor inloggen en openbare inzendingen, same-origin controle op wijzigingen en browserbeveiligingsheaders.

## Openbaar hosten

De app draait direct op de machine waarop Node.js draait. Om haar openbaar te maken is een host of VPS nodig. Plaats de Node-server achter een reverse proxy met HTTPS, zet `NODE_ENV=production`, kies een geheime bind-adres/poort via `HOST` en `PORT`, en bewaar de map `data/` op een permanente, alleen voor de server toegankelijke schijf. In productie markeert de app de sessiecookie automatisch als `Secure`; HTTPS is daar dus vereist. Zet de publieke beheer- en databasepaden niet open via statische hosting. Maak versleutelde, beperkte back-ups van de database en test herstel.

De server vertrouwt geen `X-Forwarded-For`-header, om vervalsbare IP-adressen voor de ingebouwde limieten te vermijden. Als je de site achter een proxy openbaar maakt, stel dan ook daar limieten in voor inloggen en inzendingen.

## Projectindeling

- `server.mjs` — Node-server, authenticatie, API en SQLite
- `public/app.js` — interactieve browserapp
- `public/styles.css` — responsive ontwerp
- `public/index.html` — minimale browserstartpagina die de interactieve app laadt
- `data/` — wordt automatisch aangemaakt voor de blijvende database en staat in `.gitignore`

