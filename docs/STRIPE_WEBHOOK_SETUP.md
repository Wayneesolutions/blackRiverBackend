# Stripe Webhook Setup Guide

## Webhook URLs

### Production/Local Server
If your backend is running on `http://localhost:3000`:
```
http://localhost:3000/api/v1/webhook/subscription
```

### For Production (replace with your domain)
```
https://yourdomain.com/api/v1/webhook/subscription
```

## Setting Up Stripe Webhooks

### Option 1: Using Stripe Dashboard (Recommended for Production)

1. **Go to Stripe Dashboard**
   - Visit: https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"

2. **Configure Endpoint**
   - **Endpoint URL**: `https://yourdomain.com/api/v1/webhook/subscription`
   - **Description**: "Subscription Management Webhook"
   - **Events to send**: Select these events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
     - `invoice.created` (optional)

3. **Get Webhook Secret**
   - After creating the endpoint, click on it
   - Copy the "Signing secret" (starts with `whsec_`)
   - Add it to your `.env` file:
     ```
     STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
     ```

### Option 2: Using Stripe CLI (For Local Development)

1. **Install Stripe CLI**
   ```bash
   # Windows (using Scoop)
   scoop install stripe

   # Or download from: https://stripe.com/docs/stripe-cli
   ```

2. **Login to Stripe**
   ```bash
   stripe login
   ```

3. **Forward Webhooks to Local Server**
   ```bash
   stripe listen --forward-to localhost:3000/api/v1/webhook/subscription
   ```

4. **Get Webhook Secret from CLI**
   - The CLI will output a webhook signing secret (starts with `whsec_`)
   - Copy it and add to your `.env` file:
     ```
     STRIPE_WEBHOOK_SECRET=whsec_your_cli_secret_here
     ```

5. **Trigger Test Events** (Optional)
   ```bash
   # Test checkout completion
   stripe trigger checkout.session.completed

   # Test subscription update
   stripe trigger customer.subscription.updated

   # Test payment success
   stripe trigger invoice.payment_succeeded
   ```

## Environment Variables Required

Add these to your `blackRiverBackend/.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Frontend URL (for redirects after checkout)
CLIENT_URL=http://localhost:5173
```

## Testing Webhooks Locally

### Using ngrok (Alternative to Stripe CLI)

1. **Install ngrok**
   ```bash
   # Download from: https://ngrok.com/download
   ```

2. **Start ngrok tunnel**
   ```bash
   ngrok http 3000
   ```

3. **Use ngrok URL in Stripe Dashboard**
   - Copy the HTTPS URL from ngrok (e.g., `https://abc123.ngrok.io`)
   - Set webhook endpoint in Stripe Dashboard to:
     ```
     https://abc123.ngrok.io/api/v1/webhook/subscription
     ```

4. **Get Webhook Secret**
   - From Stripe Dashboard webhook settings
   - Add to `.env` file

## Webhook Events Handled

The webhook handler processes these events:

1. **`checkout.session.completed`**
   - Activates subscription when payment is successful
   - Updates payment status to 'paid'
   - Sets subscription status to 'active'
   - Calculates next billing date
   - Updates installment tracking

2. **`customer.subscription.updated`**
   - Updates subscription status based on Stripe subscription state
   - Handles cancellations
   - Updates past_due status

3. **`invoice.payment_succeeded`**
   - Updates payment status for recurring payments
   - Increments installment count
   - Updates next billing date

4. **`invoice.payment_failed`**
   - Updates payment status to 'failed'
   - Sets subscription status to 'past_due'

## Verification

After setting up, test by:

1. Creating a subscription from admin panel
2. Completing checkout in Stripe
3. Checking backend logs for webhook events
4. Verifying subscription status in database

## Troubleshooting

- **Webhook not receiving events**: Check if webhook URL is accessible and correctly configured
- **Signature verification failed**: Ensure `STRIPE_WEBHOOK_SECRET` matches the secret from Stripe Dashboard
- **Events not processed**: Check backend logs for errors
- **Local testing issues**: Use Stripe CLI or ngrok for local development


