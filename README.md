# Sollicitatiesite voor een Discord-server

Nederlandstalige site met sollicitaties voor Moderator, Manager of Administrator. Het dashboard is alleen toegankelijk voor de owner. Nieuwe sollicitaties, statussen, archivering en interne notities worden opgeslagen in SQLite tijdens lokaal gebruik en in Cloudflare D1 bij gratis online hosting.

## Gratis online publiceren

De gratis Cloudflare Workers- en D1-plannen hebben gebruikslimieten, maar vragen geen betaalkaart voor dit project. Cloudflare-account nodig.

1. Installeer Node.js 22 of nieuwer.
2. Open PowerShell in deze projectmap en voer `npx wrangler login` uit. Meld je aan bij Cloudflare en bevestig de CLI-koppeling.
3. Voer `npx wrangler d1 create the-gamers-staff-applications` uit. Kopieer de getoonde `database_id` naar `database_id` in `wrangler.jsonc`.
4. Maak de tabellen aan met `npx wrangler d1 execute the-gamers-staff-applications --remote --file=schema.sql`.
5. Stel een owner-PIN in met `npx wrangler secret put OWNER_CODE`. Gebruik precies 4 cijfers; de PIN wordt nooit in de repository gezet.
6. Publiceer de site met `npx wrangler deploy`. Cloudflare toont daarna de openbare `workers.dev`-link.

Sollicitaties blijven in D1 bewaard bij nieuwe deploys en herstarts. Cloudflare Workers Free heeft een dagelijkse requestlimiet en D1 Free heeft dagelijkse lees-/schrijflimieten en een opslaglimiet. Als die limieten ooit worden overschreden, kan de site tijdelijk geen verzoeken verwerken; er volgen geen automatische usage-kosten op het gratis plan.

## Lokaal gebruiken

Vereist Node.js 22.13 of nieuwer. Er zijn geen externe Node-pakketten nodig.

1. Voer `node server.mjs setup-owner` uit en stel een owner-PIN in van precies 4 cijfers.
2. Start met `node server.mjs`.
3. Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Lokale inzendingen staan in `data/applications.sqlite`. De map `data/` staat in `.gitignore` en wordt nooit meegestuurd met de broncode.

## Inbegrepen

- Responsive Nederlandstalig formulier en duidelijke ontvangstmelding.
- Owner-login met server-side geheime code, gehashte opslag en veilige sessiecookie.
- Privé dashboard met filters, aanklikbare sollicitaties en interne notities.
- Status wijzigen, archiveren, terugzetten en definitief verwijderen.
- Invoercontrole, limieten op inloggen en inzendingen en beveiligingsheaders.

## Projectbestanden

- `server.mjs` — lokale Node.js-server en SQLite-opslag
- `worker.mjs` — Cloudflare Worker API met D1-opslag
- `schema.sql` — D1-tabellen
- `wrangler.jsonc` — gratis Cloudflare-deployconfiguratie
- `public/` — browserinterface

