# Store v6

A self-hosted storefront for handmade and 3D-printed products. It includes a
responsive customer store, an authenticated admin portal, product variants,
limited inventory, print-on-demand listings, Square checkout, image uploads,
analytics, and optional Discord order notifications.

This application is a small Node.js service backed by JSON files. It does not
include a database, worker process, Docker image, or process manager. Choose a
host that can keep the application running and persist the files described in
[Data and backups](#data-and-backups).

## Requirements

- Node.js 18 or newer
- npm
- A Square account and application for live checkout
- HTTPS through a reverse proxy or Tailscale Funnel for public traffic

## Install and run

```bash
npm ci
copy .env.example .env       # Windows PowerShell
# cp .env.example .env       # macOS/Linux
```

Edit `.env` before starting. At minimum, set a unique `ADMIN_PASS` and
`SESSION_SECRET`. For payments, also set the three required Square values in
the table below.

```bash
npm start
```

The server prints the active URL when it starts. The default local addresses
are:

- Storefront: `http://localhost:3000`
- Admin portal: `http://localhost:3000/admin`
- Health check: `http://localhost:3000/healthz`

For development, `npm run dev` restarts the server when files change. Do not
use it as the production process.

## Production configuration

Copy `.env.example` to `.env` and replace every placeholder. Important
settings are listed here; the example file contains the complete reference.

| Variable | Required | Description |
|---|---:|---|
| `PORT` | No | HTTP port. Defaults to `3000`. |
| `ADMIN_USER` | No | Admin username. Defaults to `admin`. |
| `ADMIN_PASS` | Yes | Strong admin password. Never use `changeme123`. |
| `SESSION_SECRET` | Yes | Long random value used to sign sessions. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `PRIVATE_DATA_DIR` | Recommended | Persistent directory for analytics, contact data, logs, temporary uploads, and the instance lock. Defaults to an OS temp directory. |
| `TRUST_PROXY` | When proxied | Set to `true` when HTTPS is terminated by Nginx, Caddy, Tailscale, or another trusted proxy. |
| `STORE_NAME` | No | Store name shown to customers. |
| `STORE_TAGLINE` | No | Store tagline. |
| `STORE_DESCRIPTION` | No | Store description. |
| `STORE_FOOTER` | No | Footer text. |
| `SQUARE_ACCESS_TOKEN` | Payments | Square Sandbox or Production access token. |
| `SQUARE_LOCATION_ID` | Payments | Square location that receives payments. |
| `SQUARE_APP_ID` | Payments | Square application ID used by checkout. |
| `SQUARE_ENVIRONMENT` | Payments | `Sandbox` for testing or `Production` for live charges. |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Webhooks | Square webhook signature key. Required to accept webhook events. |
| `DISCORD_WEBHOOK_URL` | No | Sends successful-order notifications to a Discord channel. |

Do not commit `.env`. It is ignored by Git, but secrets can still leak through
logs, screenshots, backups, or shell history.

## Square payments

1. Create or select an application in the [Square Developer Dashboard](https://developer.squareup.com/apps).
2. Use Sandbox credentials while testing and Production credentials only when
    the storefront, shipping process, and refund process are ready.
3. Set `SQUARE_ACCESS_TOKEN`, `SQUARE_APP_ID`, `SQUARE_LOCATION_ID`, and
    `SQUARE_ENVIRONMENT` in `.env`.
4. Configure the Square webhook URL as `https://your-domain.example/webhook`.
    Subscribe to `payment.updated` and copy the webhook signature key into
    `SQUARE_WEBHOOK_SIGNATURE_KEY`.
5. Complete a Sandbox checkout and confirm the server returns `200 OK` for a
    valid webhook. Invalid or unsigned webhook requests are rejected.

The webhook currently verifies and logs completed payments. It is a place to
extend fulfillment integrations; it does not replace your Square order,
refund, tax, shipping, or customer-support workflows.

Payment method flags are enabled by default and can be disabled with:

```env
ENABLE_CARD_PAYMENTS=false
ENABLE_APPLE_PAY=false
ENABLE_GOOGLE_PAY=false
```

Apple Pay and Google Pay depend on the customer browser, device, domain, and
Square configuration. Public checkout should use HTTPS.

## HTTPS and reverse proxies

The Node server serves HTTP. Put it behind a TLS-terminating reverse proxy for
public use and forward traffic to the local Node port. Set:

```env
TRUST_PROXY=true
```

Do not open `https://your-lan-ip:3000` directly; that port does not serve TLS.
With Tailscale Funnel, start the app and run:

```bash
tailscale funnel 3000
```

Use the HTTPS URL printed by Tailscale for the storefront and Square webhook.
Only expose `/admin` to the public internet when it is protected by a strong
password and HTTPS.

## Data and backups

The app creates required directories at startup.

| Location | Contents | Back up? |
|---|---|---:|
| `data/products.json` | Product catalog, prices, variants, and image references | Yes |
| `data/colors.json` | Color definitions | Yes |
| `data/filaments.json` | Filament/material definitions | Yes |
| `data/materials.json` | Material definitions | Yes |
| `data/settings.json` | Store settings and banners | Yes |
| `uploads/` | Original and processed product media | Yes |
| `PRIVATE_DATA_DIR/analytics.json` | Analytics data | Optional |
| `PRIVATE_DATA_DIR/contact.json` | Contact details | Yes |
| `PRIVATE_DATA_DIR/logs.json` | Application logs | Optional |

Set `PRIVATE_DATA_DIR` to a persistent path in production. Without it, private
data defaults to the operating system's temporary directory and may disappear
after a restart or host cleanup. Back up the JSON files and `uploads/` while
the server is stopped, or use a filesystem snapshot. Keep `.env` in a separate
secret-managed backup.

## Operations

For repeated manual launches, use:

```bash
npm run start:strict
```

This enables single-instance protection and replaces an older instance. The
server also retries the next port when the configured port is busy; set
`PORT_RETRY_COUNT=0` if that behavior is not wanted.

Monitor `GET /healthz` from your process manager or uptime service. A healthy
response contains `{ "ok": true }`. Keep the terminal or service logs
available: failed uploads, payment requests, and webhook verification errors
are recorded there and in `PRIVATE_DATA_DIR/logs.json`.

## Admin workflow

Open `/admin`, sign in with `ADMIN_USER` and `ADMIN_PASS`, then manage:

- Print-on-demand, limited-stock, and Etsy-linked listings
- Prices, sale prices, quantities, colors, materials, filaments, and variants
- Product images and image library cleanup
- Store open/closed state, branding, banners, and contact information
- Analytics and application logs

Test the customer checkout after changing product pricing, availability, or
Square settings. The admin portal is not a substitute for a Square dashboard
or an order-management system.

## Troubleshooting

- **The port is busy:** Check the startup log. The server may have moved to
   `3001`, `3002`, and so on; set `PORT` to a free port or stop the old process.
- **Admin sessions do not persist correctly behind HTTPS:** Set
   `TRUST_PROXY=true` and use the HTTPS proxy URL.
- **Payments fail immediately:** Confirm the Square environment matches the
   token (`Sandbox` versus `Production`) and that the location belongs to the
   application.
- **Webhooks return `401`:** Confirm the public webhook URL and
   `SQUARE_WEBHOOK_SIGNATURE_KEY`; do not disable signature verification.
- **Images or analytics disappear after restart:** Set `PRIVATE_DATA_DIR` and
   back up both it and `uploads/`.
- **The storefront is unreachable through a proxy:** Confirm the proxy points
   to the active port printed by the server and that `TRUST_PROXY` is set only
   when the proxy is trusted.

## Related documentation

- [ENV_REFERENCE.md](ENV_REFERENCE.md): full environment-variable reference
- [PAYMENT_SETUP.md](PAYMENT_SETUP.md): Square setup notes and test-card guidance
- [`.env.example`](.env.example): configuration template
# Store v6
-notes
add the option for a second color on specifc products
Revamp how you do the store so one section for ordering pre-made and another for print on demand
add the ability to put items on sale












A full-featured self-hosted e-commerce storefront with advanced product variants, admin portal, and integrated Square payment processing. Built on Express + Node.js with responsive design.

## About Store v6

Store v6 is a complete fidget toy & handmade product marketplace platform featuring:
- **Color Selection**: Support for product color variants
- **Smart Inventory**: Track product options and availability
- **Square Payment Integration**: Full payment processing with webhook support for order fulfillment
- **Analytics Dashboard**: View product popularity, conversion metrics, and visitor data
- **Admin Portal**: Manage products, colors, pricing, settings, and contact information
- **Responsive Design**: Beautiful storefront optimized for mobile and desktop
- **Secure Admin**: Session-based authentication with customizable credentials

## What's new in v6

| Feature | v5 | v6 |
|---|---|---|
| Color selection per product | ✅ | ✅ |
| Square payment integration | ✅ | ✅ |
| Product analytics | ✅ | ✅ |
| Tailscale Funnel ready | ✅ | ✅ |
| Session-based admin auth | ✅ | ✅ |
| Settings & branding | ✅ | ✅ |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Set up your environment
cp .env.example .env
# Edit .env — change ADMIN_USER, ADMIN_PASS, SESSION_SECRET at minimum

# 3. Start
npm start
# or for auto-reload during development:
npm run dev
```

Open http://localhost:3000 to see the store.  
Open http://localhost:3000/admin to manage it.

## .env reference

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `ADMIN_USER` | `admin` | Admin login username |
| `ADMIN_PASS` | `changeme123` | Admin login password — **change this!** |
| `SESSION_SECRET` | random | Cookie signing secret — generate a strong one |
| `STORE_NAME` | `My Store` | Shown in header and browser tab |
| `STORE_TAGLINE` | `Curated Collection` | Hero heading on storefront |
| `STORE_DESCRIPTION` | … | Subtext under the hero heading |
| `STORE_FOOTER` | … | Footer line |
| `TRUST_PROXY` | `false` | Set `true` when behind Tailscale Funnel or Nginx |
| `SQUARE_ACCESS_TOKEN` |  | Square API access token |
| `SQUARE_APP_ID` |  | Square application ID |
| `SQUARE_LOCATION_ID` |  | Square location ID |
| `SQUARE_ENVIRONMENT` | `Sandbox` | `Sandbox` or `Production` |

## Square Payment Integration

The store integrates with Square for payment processing using the Payments API.

1. Sign up for a Square account and create an application.
2. Get your access token, app ID, and location ID from the Square Developer Dashboard.
3. Add them to `.env`:
   - `SQUARE_ACCESS_TOKEN`
   - `SQUARE_APP_ID`
   - `SQUARE_LOCATION_ID`
   - Set `SQUARE_ENVIRONMENT=Production` for live payments.
4. Set up webhooks in Square Dashboard:
   - URL: `https://yourdomain.com/webhook`
   - Events: `payment.updated`
5. For receipts, implement email sending in the webhook handler (currently logs to console).

## Tailscale Funnel setup

1. Set `TRUST_PROXY=true` in `.env` — this enables secure cookies and correct IP logging.
2. Start the store: `npm start`
3. In a second terminal: `tailscale funnel 3000`
4. Tailscale will print your public HTTPS URL (e.g. `https://mymachine.tail1234.ts.net`).

Tailscale Funnel handles TLS termination. The store is Funnel-ready out of the box.

## Access and TLS troubleshooting

- Local/LAN access should use HTTP, for example: `http://192.168.x.x:3000`
- Do not use `https://LAN_IP:3000` directly. This app serves HTTP on the Node port, so browsers will show TLS/security warnings.
- For trusted public HTTPS, use a reverse proxy URL (for example Tailscale Funnel URL).
- If VS Code terminal looks like the app "crashed" on start, check for a port conflict first. The server now retries on the next port automatically (3001, 3002, ...).

## Startup reliability and performance

- Use `npm run start:strict` to avoid duplicate server instances during repeated launches.
- Strict mode supports:
   - `STRICT_SINGLE_INSTANCE=true`
   - `SINGLE_INSTANCE_MODE=replace` to stop an older instance and launch a fresh one
   - `SINGLE_INSTANCE_MODE=reuse` to keep the existing instance and exit the new launch
- Response compression is enabled for text-based responses (HTML/CSS/JS/JSON), while already-compressed media (WebP/AVIF/video) is skipped automatically.
- Storefront startup now uses request timeouts + retry for GET bootstrap data and falls back to a recent local cache if the network is temporarily unavailable.
- Low-power mode auto-activates for constrained devices (reduced motion/save-data/low CPU-memory signals) to reduce animation and image bandwidth.
- Public data APIs use short cache headers (`API_CACHE_MAX_AGE`, `API_CACHE_STALE_SECONDS`) to improve repeat-load speed on phones and laptops.

## Data files

All data is stored as JSON in `data/`:

| File | Contents |
|---|---|
| `data/products.json` | Product catalog with colors, pricing, and images |
| `data/colors.json` | Available product color options |
| `data/analytics.json` | View counts, cart adds, visitor tracking, and last reset timestamp |
| `data/settings.json` | Store open status and public banner settings |
| `data/contact.json` | Contact info shown on the storefront |

Back these up or commit them (except `.env`) to keep your data safe.

## Folder structure

```
store-v2/
├── .env              ← your secrets (never commit)
├── .env.example      ← template (safe to commit)
├── .gitignore
├── package.json
├── server.js
├── data/
│   ├── products.json
│   ├── analytics.json
│   ├── settings.json
│   ├── contact.json
├── public/
│   ├── index.html
│   ├── admin.html
│   ├── login.html
│   └── uploads/       ← generated images
├── uploads/          ← auto-processed WebP images
└── public/
    ├── index.html    ← storefront
    ├── admin.html    ← admin portal
    └── login.html    ← admin login
```
