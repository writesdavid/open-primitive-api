# Stripe Setup — Open Primitive API

10 minutes. Test mode first. Real payments later.

---

## 1. Create account

Go to [dashboard.stripe.com](https://dashboard.stripe.com). Sign up or sign in.

Make sure **Test mode** is toggled ON (top-right toggle). You will see "TEST DATA" in the header.

---

## 2. Create products

Click **Products** in the left sidebar. Then **Add product**.

**Product 1:**
- Name: `Open Primitive Builder`
- Pricing: `$29.00` / month / recurring
- Click **Save product**
- Copy the **Price ID** (starts with `price_`). Save it somewhere.

**Product 2:**
- Name: `Open Primitive Pro`
- Pricing: `$99.00` / month / recurring
- Click **Save product**
- Copy the **Price ID**. Save it somewhere.

---

## 3. Get your API secret key

Go to **Developers** (left sidebar) > **API Keys**.

Copy the **Secret key** (starts with `sk_test_`). Save it somewhere.

---

## 4. Create webhook endpoint

Go to **Developers** > **Webhooks** > **Add endpoint**.

- **Endpoint URL:** `https://api.openprimitive.com/v1/billing/webhook`
- **Listen to:** Events on your account
- Click **Select events**, then search and check these 3:
  - `checkout.session.completed`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- Click **Add endpoint**

On the endpoint page, click **Reveal** under Signing secret. Copy it (starts with `whsec_`). Save it somewhere.

---

## 5. Add env vars to Vercel

Go to [vercel.com](https://vercel.com) > **open-primitive-api** project > **Settings** > **Environment Variables**.

Add these 4, one at a time:

| Name | Value |
|------|-------|
| `STRIPE_SECRET_KEY` | your `sk_test_...` key |
| `STRIPE_WEBHOOK_SECRET` | your `whsec_...` secret |
| `STRIPE_PRICE_BUILDER` | Price ID for Builder (`price_...`) |
| `STRIPE_PRICE_PRO` | Price ID for Pro (`price_...`) |

Set all 4 to **Production** + **Preview** environments.

---

## 6. Redeploy

```bash
cd ~/open-primitive-api && source ~/.nvm/nvm.sh && npx vercel redeploy $(npx vercel ls --scope writesdavids-projects 2>/dev/null | grep open-primitive-api | head -1 | awk '{print $2}') --scope writesdavids-projects
```

Or just push a commit and let it redeploy automatically if you have Git integration.

---

## 7. Test

Go to [api.openprimitive.com/upgrade.html](https://api.openprimitive.com/upgrade.html).

Click **Subscribe** on Builder. It should redirect to Stripe Checkout.

Use test card: `4242 4242 4242 4242`, any future expiry, any CVC.

---

## When ready for real payments

1. Toggle **Test mode OFF** in Stripe dashboard
2. Create the same 2 products in live mode (new Price IDs)
3. Copy new live API key (`sk_live_...`) and new webhook secret
4. Update all 4 Vercel env vars with live values
5. Redeploy
