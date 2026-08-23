# Environment Variables Reference

Complete reference for all `.env` configuration options.

## Core Settings

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `ADMIN_USER` | No | `admin` | Admin panel username |
| `ADMIN_PASS` | No | `changeme123` | Admin panel password |
| `SESSION_SECRET` | No | `(long random hex)` | Session encryption key |
| `TRUST_PROXY` | No | `true` | Enable if behind reverse proxy |

## Store Branding

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `STORE_NAME` | No | `My Store` | Display name in header |
| `STORE_TAGLINE` | No | `Curated Collection` | Subtitle under hero |
| `STORE_DESCRIPTION` | No | `Handpicked items...` | Hero section description |
| `STORE_FOOTER` | No | `© 2025 My Store` | Footer text |

## Square Payment Setup

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `SQUARE_ACCESS_TOKEN` | **YES** | `sq_live_xxx` | API access token from Square |
| `SQUARE_LOCATION_ID` | **YES** | `L_xxxxx` | Your Square location ID |
| `SQUARE_APP_ID` | **YES** | `sq_appid_xxx` | Square application ID |
| `SQUARE_ENVIRONMENT` | No | `Sandbox` | `Sandbox` or `Production` |
| `SQUARE_API_VERSION` | No | `2024-12-15` | Square API version |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | No | `xxxx` | For webhook verification |

## Payment Methods (Enable/Disable)

| Variable | Default | Options | Description |
|----------|---------|---------|-------------|
| `ENABLE_CARD_PAYMENTS` | `true` | `true`/`false` | Credit card payments |
| `ENABLE_APPLE_PAY` | `true` | `true`/`false` | Apple Pay (iOS/Mac) |
| `ENABLE_GOOGLE_PAY` | `true` | `true`/`false` | Google Pay (Android/Chrome) |

## Email Receipt Configuration

**Choose ONE email method:**

### Gmail Method (Recommended)

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `SEND_RECEIPT_EMAIL` | No | `true` | Enable/disable email receipts |
| `EMAIL_SERVICE` | Yes* | `gmail` | Must be `gmail` for this method |
| `EMAIL_FROM` | Yes* | `mystore@gmail.com` | Gmail address |
| `EMAIL_PASSWORD` | Yes* | `xxxx xxxx xxxx xxxx` | Gmail [App Password](https://support.google.com/accounts/answer/185833) |

\* Required if using Gmail

### SMTP Method

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `SEND_RECEIPT_EMAIL` | No | `true` | Enable/disable email receipts |
| `EMAIL_SERVICE` | Yes* | `smtp` | Must be `smtp` for this method |
| `SMTP_HOST` | Yes* | `smtp.example.com` | SMTP server address |
| `SMTP_PORT` | Yes* | `587` | SMTP port (usually 587 or 465) |
| `SMTP_USER` | Yes* | `sender@example.com` | SMTP username |
| `SMTP_PASS` | Yes* | `password` | SMTP password |

\* Required if using SMTP

## Success Message Configuration

| Variable | Default | Example | Description |
|----------|---------|---------|-------------|
| `SUCCESS_MESSAGE_TITLE` | `Order Placed!` | Custom title | Title on success screen |
| `SUCCESS_MESSAGE_BODY` | Default text | Custom message | Body text on success screen |
| `SUCCESS_SHOW_ORDER_ID` | `true` | `true`/`false` | Show order ID in receipt |
| `SUCCESS_SHOW_RECEIPT_EMAIL` | `true` | `true`/`false` | Show "sent to email" message |

## SMS Configuration (Optional/Future)

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `SEND_ORDER_SMS` | No | `false` | Enable SMS notifications (not yet active) |
| `TWILIO_ACCOUNT_SID` | If SMS enabled | `ACxxxxx` | Twilio account ID |
| `TWILIO_AUTH_TOKEN` | If SMS enabled | `xxxxx` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | If SMS enabled | `+1234567890` | Twilio phone number |

## Example `.env` Files

### Development (Sandbox)

```env
PORT=3000
ADMIN_USER=admin
ADMIN_PASS=dev123

STORE_NAME=Test Store
STORE_TAGLINE=Development Mode

SQUARE_ACCESS_TOKEN=sq_sandbox_xxxx
SQUARE_LOCATION_ID=L_xxxxx
SQUARE_APP_ID=sq_appid_xxx
SQUARE_ENVIRONMENT=Sandbox

ENABLE_CARD_PAYMENTS=true
ENABLE_APPLE_PAY=true
ENABLE_GOOGLE_PAY=true

SEND_RECEIPT_EMAIL=true
EMAIL_SERVICE=gmail
EMAIL_FROM=test@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx

SUCCESS_MESSAGE_TITLE=Order Placed!
SUCCESS_MESSAGE_BODY=Thank you! Check your email for order details.
```

### Production (Live)

```env
PORT=3000
ADMIN_USER=admin
ADMIN_PASS=super-secret-password

STORE_NAME=My Professional Store
STORE_TAGLINE=Premium Products
STORE_DESCRIPTION=High-quality items delivered fast

SQUARE_ACCESS_TOKEN=sq_live_xxxx
SQUARE_LOCATION_ID=L_xxxxx
SQUARE_APP_ID=sq_appid_xxx
SQUARE_ENVIRONMENT=Production

ENABLE_CARD_PAYMENTS=true
ENABLE_APPLE_PAY=true
ENABLE_GOOGLE_PAY=true

SEND_RECEIPT_EMAIL=true
EMAIL_SERVICE=gmail
EMAIL_FROM=orders@mystore.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx

SUCCESS_MESSAGE_TITLE=Thank You For Your Order!
SUCCESS_MESSAGE_BODY=Your order has been confirmed and will ship within 2 business days.
SUCCESS_SHOW_ORDER_ID=true
SUCCESS_SHOW_RECEIPT_EMAIL=true

TRUST_PROXY=true
```

## How to Get These Values

### Square Credentials
1. Visit [Square Developer Dashboard](https://developer.squareup.com/apps)
2. Create/select your application
3. Go to **Credentials** → **Access Tokens**
4. Use **Sandbox** tokens for testing, **Live** tokens for production
5. Copy Location ID from **Dashboard** → **Settings**

### Gmail App Password
1. Enable [2-Step Verification](https://myaccount.google.com/security)
2. Go to [App Passwords](https://myaccount.google.com/apppasswords)
3. Select Mail → Windows (or your device)
4. Copy the 16-character password (include spaces exactly as shown)

### SMTP Details
Contact your email provider for SMTP credentials. Common providers:
- **Gmail**: smtp.gmail.com:587
- **SendGrid**: smtp.sendgrid.net:587
- **Mailgun**: smtp.mailgun.org:587
- **AWS SES**: email-smtp.region.amazonaws.com:587

## Security Notes

⚠️ **NEVER** commit `.env` to Git (it's in `.gitignore`)
⚠️ Keep `SESSION_SECRET` random and unique per deployment
⚠️ Use strong `ADMIN_PASS` in production
⚠️ Store email passwords securely (use environment management service in production)
⚠️ Rotate credentials periodically

## Testing Values

### Sandbox Square Test Cards

| Card | Number | Expiry | CVV |
|------|--------|--------|-----|
| Visa | `4111111111111111` | Any future | Any 3 digits |
| Mastercard | `5555555555554444` | Any future | Any 3 digits |
| Amex | `378282246310005` | Any future | Any 4 digits |

### Test Email

Use your real email during testing:
```env
EMAIL_FROM=yourname+test@gmail.com
```

Gmail treats `+` variations as the same account, so receipts go to your inbox!
