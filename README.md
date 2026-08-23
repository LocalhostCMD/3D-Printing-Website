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
