# x402 Micropayments for Open Primitive API

Research date: 2026-03-21

---

## 1. Does @x402/server work on Cloudflare Workers?

No package called `@x402/server` exists. The x402 ecosystem uses scoped packages per framework:

- `@x402/hono` -- Hono middleware (what we need)
- `@x402/core` -- shared protocol logic
- `@x402/evm` -- EVM payment scheme (USDC on Base)
- `x402-express` -- Express middleware
- `x402-next` -- Next.js middleware

All packages target Web Standards APIs (fetch, Request, Response). They run on Cloudflare Workers without modification.

## 2. Hono-specific x402 middleware

`@x402/hono` is the official package. Published on npm by Coinbase.

### Minimal Hono example (one protected route)

```typescript
import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const app = new Hono();

// Point to Coinbase's free facilitator
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://facilitator.x402.org",
});

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:8453", new ExactEvmScheme()); // Base mainnet

// Define which routes cost money
app.use(
  paymentMiddleware(
    {
      "GET /v1/eligible": {
        accepts: {
          scheme: "exact",
          price: "$0.01",           // 1 cent per call
          network: "eip155:8453",   // Base mainnet
          payTo: "0xYOUR_USDC_ADDRESS",
        },
        description: "Check supplement eligibility against FDA data",
      },
      "GET /v1/compare": {
        accepts: {
          scheme: "exact",
          price: "$0.01",
          network: "eip155:8453",
          payTo: "0xYOUR_USDC_ADDRESS",
        },
        description: "Compare supplements head-to-head",
      },
    },
    resourceServer,
  ),
);

// Routes work as normal -- middleware intercepts unpaid requests
app.get("/v1/eligible", (c) => {
  return c.json({ eligible: true, product: "example" });
});

app.get("/v1/compare", (c) => {
  return c.json({ comparison: "example" });
});

export default app;
```

### Packages to install

```bash
npm install @x402/hono @x402/core @x402/evm
```

## 3. Cloudflare's native x402 support

Cloudflare co-founded the x402 Foundation with Coinbase. They offer two paths:

### Path A: x402 Proxy Template (zero code)
A standalone Cloudflare Worker that sits in front of any origin. Configure protected routes in `wrangler.jsonc` vars -- no code changes to your app.

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/x402-proxy-template
```

You define routes, prices, and descriptions in config. The proxy handles 402 responses, payment verification, and forwarding.

### Path B: @x402/hono middleware (code-level)
The approach shown above. You add middleware directly to your Hono app. More control, same Worker.

**Recommendation for Open Primitive:** Path B. We already have a Hono worker at api.openprimitive.com. Adding middleware is 20 lines. The proxy template adds a second Worker we do not need.

## 4. Simplest implementation

See the code in section 2. That is the simplest path: install 3 packages, add the middleware call before your routes, deploy.

For the Cloudflare Worker export pattern:

```typescript
// worker/index.ts
export default app;
```

No changes to the export. The middleware runs inside Hono's request pipeline.

## 5. Wallet/payment setup (provider side)

Three things to set up:

### Step 1: Coinbase Business Account
- Sign up at coinbase.com/business
- Get a verified USDC deposit address on Base network
- This is where payments settle

### Step 2: CDP API Key
- Go to https://portal.cdp.coinbase.com
- Create an API key (CDP_API_KEY_ID + CDP_API_KEY_SECRET)
- This connects your app to the Coinbase facilitator for payment verification

### Step 3: Set the payTo address
- Use your Coinbase Business USDC deposit address as the `payTo` value in the middleware config
- Any EVM wallet that can receive USDC on Base works

### Environment variables needed

```
CDP_API_KEY_ID=your_key_id
CDP_API_KEY_SECRET=your_key_secret
```

Set these as Cloudflare Worker secrets:
```bash
npx wrangler secret put CDP_API_KEY_ID
npx wrangler secret put CDP_API_KEY_SECRET
```

## 6. Coinbase free facilitator

Yes. Coinbase runs a hosted facilitator at `https://facilitator.x402.org`.

- **Free tier:** 1,000 settled payments per month
- **After that:** $0.001 per settled payment
- **What it does:** Verifies payment signatures, submits transactions onchain, handles settlement

No infrastructure to run. Point HTTPFacilitatorClient at the URL and payments work.

For Open Primitive's scale (early API usage), the free tier covers everything.

## 7. Client/agent side

### What an agent needs to pay

The agent needs:
1. A wallet with USDC on Base (even $1 covers 100 calls at $0.01 each)
2. The `@x402/fetch` package (or manual header construction)

### Simplest client code

```typescript
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0xYOUR_PRIVATE_KEY");
const paidFetch = wrapFetchWithPayment(fetch, account);

// Fetch handles 402 automatically -- pays and retries
const response = await paidFetch("https://api.openprimitive.com/v1/eligible?q=ashwagandha");
const data = await response.json();
```

### What happens under the hood

1. Client sends GET to `/v1/eligible`
2. Server returns `402 Payment Required` with payment requirements in headers
3. Client reads requirements, signs a USDC transfer authorization
4. Client retries the request with `X-PAYMENT` header containing the signed payload
5. Server forwards the payment to the facilitator for verification
6. Facilitator settles onchain, server returns 200 with the data

### For agents without x402/fetch

Any HTTP client works. The agent:
1. Makes the initial request
2. Parses the 402 response headers for payment requirements
3. Constructs and signs the payment
4. Retries with `X-PAYMENT: <base64-encoded-payment>`

Claude, GPT-4, and other LLM agents can do this natively if they have wallet access.

---

## Next steps

1. Create a Coinbase Business account and get a USDC address on Base
2. Get CDP API keys from portal.cdp.coinbase.com
3. `npm install @x402/hono @x402/core @x402/evm`
4. Add paymentMiddleware to worker/index.ts (or index.js -- may need to convert to TS)
5. Set CDP secrets in Cloudflare via wrangler
6. Deploy and test with `@x402/fetch` client
7. Start with Base Sepolia testnet (network: `eip155:84532`) before going to mainnet

## Sources

- [Coinbase x402 Quickstart for Sellers](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)
- [Coinbase x402 Quickstart for Buyers](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers)
- [@x402/hono on npm](https://www.npmjs.com/package/@x402/hono)
- [Coinbase x402 GitHub (includes Hono example)](https://github.com/coinbase/x402/tree/main/examples/typescript/servers/hono)
- [Cloudflare x402 docs](https://developers.cloudflare.com/agents/x402/)
- [Cloudflare x402 proxy template](https://github.com/cloudflare/templates/tree/main/x402-proxy-template)
- [Cloudflare x402 blog post](https://blog.cloudflare.com/x402/)
- [Coinbase facilitator free tier announcement](https://x.com/CoinbaseDev/status/1995564027951665551)
- [x402.org](https://www.x402.org/)
