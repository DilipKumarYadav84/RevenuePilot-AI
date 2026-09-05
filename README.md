# RevenuePilot AI

RevenuePilot AI is an agentic-commerce demo that turns buying intent into verified revenue - without giving AI unrestricted control over money.

**AI proposes. Merchant policy decides. Razorpay verifies. Audit proves what happened.**

## Problem

AI shopping assistants can recommend products, but a recommendation model should not be able to independently grant discounts, choose final payable amounts, or mark payments successful. Those actions need deterministic merchant controls and server-side verification.

## Solution

RevenuePilot combines conversational product discovery with controlled commerce execution:

- Grounded catalog recommendations
- Customer hesitation detection
- Deterministic action proposals
- Merchant policy evaluation
- Offer provenance checks
- Explicit customer offer acceptance
- Razorpay Test Mode checkout
- Server-side payment signature verification
- Explainable audit trail and merchant console

## Why It Is Different

- An LLM can propose an action, but cannot approve a discount.
- An LLM cannot create a Razorpay order.
- The frontend cannot set the final amount.
- Merchant policy can `APPROVE`, `MODIFY`, `BLOCK`, or `REQUIRE_APPROVAL`.
- The backend verifies payments before they are marked verified.
- Important recommendation, policy, offer, and payment decisions are auditable.

## Architecture

```text
Customer
  |
  v
Conversation
  |
  v
Gemini structured extraction (local deterministic fallback)
  |
  v
Deterministic catalog ranking
  |
  v
Grounded recommendation
  |
  v
Action proposal
  |
  v
Merchant Policy Engine
  |
  v
Offer execution
  |
  v
Customer acceptance
  |
  v
Razorpay Test Mode
  |
  v
Server-side HMAC verification
  |
  v
Verified payment
  |
  v
Audit Trail / Merchant Console
```

The provider may help interpret a shopper message and write grounded discovery copy. Persisted offer, policy, and payment state remain server-authoritative, and the local fallback preserves the same safety boundaries when an external provider is unavailable.

## Key Demo Flow

1. Shopper: "I need an AI laptop under INR 70,000."
2. NeuralBook X15 becomes the best catalog match.
3. Shopper signals that the product is too expensive.
4. AI deterministically proposes a 15% discount.
5. Merchant policy caps the executable discount to 10%.
6. Shopper explicitly accepts the offer.
7. Razorpay Test Mode checkout opens.
8. The backend verifies the payment signature.
9. Merchant Console shows the policy decision and payment audit.

## Safety Boundary

RevenuePilot separates understanding from authority:

- AI understands shopper intent and proposes a permitted action.
- Merchant policy is authoritative for executable commercial actions.
- Product pricing and payable amounts are loaded and calculated on the server.
- Payment completion is server-controlled through Razorpay signature verification.

## Features

- Shopper Journey
- Merchant Console
- Director Dual-View
- Scenario Playbook
- Policy-controlled offers
- Razorpay Test Mode checkout
- Audit trail
- Demo reset workflow
- Gemini provider with local deterministic fallback

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | React, Vite, TypeScript |
| Backend | Node.js, Express, TypeScript |
| Data | MongoDB, Mongoose |
| Validation | Zod |
| AI | Gemini, local deterministic fallback, optional OpenAI adapter |
| Payments | Razorpay Test Mode |

## Project Structure

```text
RevenuePilot-AI/
├── backend/
│   ├── scripts/             # Seed and demo reset scripts
│   ├── src/modules/         # AI, offers, payments, policies, audit, dashboard
│   └── tests/               # Backend regression and security tests
├── frontend/
│   └── src/                 # React application and UI components
└── README.md
```

## Environment Variables

Set backend environment variables in `backend/.env` (names only):

```text
NODE_ENV
PORT
MONGODB_URI
FRONTEND_URL
AI_PROVIDER
AI_API_KEY
AI_MODEL
AI_STRUCTURED_MODEL
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
MERCHANT_ADMIN_KEY
```

Set the frontend API location in `frontend/.env`:

```text
VITE_API_BASE_URL
```

Never commit environment files or payment credentials.

## Local Setup

MongoDB must be available and `MONGODB_URI` must be configured before starting the backend.

```bash
cd backend
npm install
npm run dev
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

## Demo Reset

Reset demo conversations, offers, payments, audit data, policy records, and seeded catalog data:

```bash
cd backend
npm run reset:demo
```

This command refuses to run when `NODE_ENV=production`.

## Run Tests

```bash
cd backend
npm run test
npm run build
```

The backend currently has **183 passing tests**.

```bash
cd frontend
npm run build
```

## Demo Scenarios

- **AI laptop discovery** - grounded catalog search within a stated budget.
- **Battery preference reranking** - a new priority changes ranking without abandoning prior context.
- **Price hesitation policy cap** - a 15% proposal is evaluated and capped by merchant policy.
- **Extreme discount attempt** - prompt text cannot bypass policy or create an unsafe payment flow.

## Screenshots

Add final screenshots under `docs/screenshots` before submission.

| View | Screenshot |
| --- | --- |
| Shopper Journey | Add final image |
| Policy-modified offer | Add final image |
| Razorpay checkout | Add final image |
| Merchant Console | Add final image |
| Director Dual-View | Add final image |
| Scenario Playbook | Add final image |

## Demo Video

Demo video: [Add final submission video link here]

## Security Notes

- Secrets remain in backend environment configuration only.
- The frontend never receives the Razorpay Key Secret.
- Payable amounts are server-authoritative; the frontend does not submit an amount for checkout.
- Razorpay payment signatures are verified by the server using HMAC.
- Public conversation APIs do not accept forged assistant messages.
- Offer creation requires a matching, server-generated action-proposal audit record.

## Known Limitations

- No Razorpay webhook reconciliation.
- No full production authentication system.
- `REQUIRES_APPROVAL` is a safe-stop state, not a complete human approval workflow.
- No multi-merchant tenancy.
- Built for demo use with Razorpay Test Mode, not production deployment.

## Buildathon Submission

RevenuePilot AI was built for the Razorpay AI Buildathon, with a focus on AI Growth and Agentic Commerce: making commerce assistance useful while keeping pricing, payment, and policy authority deterministic and verifiable.

## Author

Dilip Kumar Yadav  
GitHub: https://github.com/DilipKumarYadav84
