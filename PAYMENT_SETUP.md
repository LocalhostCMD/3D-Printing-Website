# 🎯 Payment System Setup Guide

Your payment system has been completely overhauled and is now **production-ready** with professional features!

## ✨ New Features

- ✅ **Multiple Payment Methods**: Card, Apple Pay, Google Pay
- ✅ **Email Receipts**: Automated professional emails with order details
- ✅ **Customizable Success Messages**: Configure what customers see after payment
- ✅ **Production-Ready**: Full error handling and validation
- ✅ **Secure**: Webhook-ready for future enhancements

## 📋 Quick Setup (5 minutes)

### Step 1: Configure Your `.env` File

Copy `.env.example` to `.env` and fill in these essentials:

```bash
cp .env.example .env
```

### Step 2: Square Setup

Get your Square credentials from [Square Developer Dashboard](https://developer.squareup.com/apps):

```env
SQUARE_ACCESS_TOKEN=sq_live_xxxx... or sq_sandbox_xxxx...
SQUARE_LOCATION_ID=L_xxxxx
SQUARE_APP_ID=sq_appid_xxx
SQUARE_WEBHOOK_SIGNATURE_KEY=xxxx
SQUARE_ENVIRONMENT=Sandbox  # Change to "Production" for live
SQUARE_API_VERSION=2024-12-15
```

### Step 3: Email Configuration

**Option A: Gmail (Easiest)**

1. Enable 2-Factor Authentication on your Google account
2. Create an [App Password](https://support.google.com/accounts/answer/185833)
3. Add to `.env`:

```env
SEND_RECEIPT_EMAIL=true
EMAIL_SERVICE=gmail
EMAIL_FROM=your-email@gmail.com
EMAIL_PASSWORD=your-16-character-app-password
```

**Option B: Custom SMTP Server**

```env
SEND_RECEIPT_EMAIL=true
EMAIL_SERVICE=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
```

### Step 4: Customize Success Messages

After payment, customers see a personalized confirmation:

```env
# Customize these messages
SUCCESS_MESSAGE_TITLE=Order Placed!
SUCCESS_MESSAGE_BODY=Thank you for your purchase! Your order has been confirmed.
SUCCESS_SHOW_ORDER_ID=true          # Show "Order ID: #xxxxx"
SUCCESS_SHOW_RECEIPT_EMAIL=true     # Show "Receipt sent to email@example.com"
```

### Step 5: Enable Payment Methods

```env
ENABLE_CARD_PAYMENTS=true      # Credit/debit card
ENABLE_APPLE_PAY=true          # For Safari on iOS/Mac
ENABLE_GOOGLE_PAY=true         # For Chrome/Android
```

## 🧪 Testing with Sandbox

For development/testing, use:

```env
SQUARE_ENVIRONMENT=Sandbox
```

**Sandbox Test Cards:**
- Visa: `4111111111111111` (any future expiry, any CVV)
- Mastercard: `5555555555554444`
- Amex: `378282246310005`

## 📧 Email Receipt Preview

When a customer completes a purchase:

1. ✅ Success screen shows order confirmation
2. 📧 Professional HTML email is sent with:
   - Order ID
   - Product name & quantity
   - Total charged
   - Order date
   - Next steps message
3. 🎯 Email includes your branding (dark theme with gold accents)

## 🔒 Production Checklist

Before going live:

- [ ] Switch `SQUARE_ENVIRONMENT=Production`
- [ ] Use live Square credentials (`sq_live_...`)
- [ ] Test email delivery with real email address
- [ ] Verify success messages are appropriate
- [ ] Test all payment methods you enabled
- [ ] Set `TRUST_PROXY=true` if behind reverse proxy
- [ ] Configure admin password: `ADMIN_PASS=your-secure-password`

## 📱 Payment Flow

```
Customer clicks "Buy Now"
    ↓
Payment Modal Opens
    ├─ Shows available payment methods (Card, Apple Pay, Google Pay)
    ├─ Customer fills shipping address
    ├─ Customer selects payment method
    ↓
Processing
    ├─ Payment submitted to Square
    ├─ Order created in Square
    ├─ Payment charged
    ↓
Success Screen
    ├─ Shows order confirmation
    ├─ Displays order ID (if enabled)
    ├─ Shows "Receipt sent to email" (if enabled)
    ↓
Email Receipt Sent
    └─ Professional HTML email with order details
```

## 🛠️ Admin Configuration

You can modify payment settings in the admin panel:

1. Go to `/admin`
2. Login with `ADMIN_USER` and `ADMIN_PASS`
3. **Settings** tab shows current payment configuration

## 📊 Analytics

All purchases are tracked:

- View in `/admin` → Analytics
- See per-product sales
- Track total revenue
- Monitor unique customers

## ⚙️ Advanced Configuration

### Custom SMTP (Advanced)

```env
EMAIL_SERVICE=smtp
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxx
```

### SMS Notifications (Optional)

For future SMS support, add Twilio:

```env
SEND_ORDER_SMS=false
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+1234567890
```

## 🐛 Troubleshooting

### Email not sending?

1. Check console for errors: `npm start`
2. Verify email credentials are correct
3. For Gmail: Confirm app password was generated
4. Check spam folder

### Payment modal not opening?

1. Verify `SQUARE_APP_ID` and `SQUARE_LOCATION_ID` are correct
2. Check browser console for JavaScript errors
3. Ensure Square test/live mode matches your environment

### Apple Pay not showing?

- Only works in Safari on iOS/Mac
- Requires valid card on device
- Requires https (localhost works in dev)

### Google Pay not showing?

- Only works in Chrome on Android or Chrome desktop
- Requires Google account signed in
- Requires valid payment method in Google account

## 📞 Support

Need help?

1. Check server logs: Look at terminal output
2. Check browser console: F12 → Console tab
3. Test with Sandbox credentials first
4. Verify all `.env` values are set correctly

## 🎉 You're All Set!

Your payment system is now:
- ✅ Professional and polished
- ✅ Production-ready
- ✅ Multi-payment method enabled
- ✅ Customer-friendly with email receipts
- ✅ Secure and compliant

Start accepting payments today! 🚀
