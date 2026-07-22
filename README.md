# CounterOps

Store operations platform for cafes and restaurants. Covers sales, kitchen, tables, menu, inventory, reporting, Excel import/export, and an AI analytics assistant.

## Stack

- Next.js 14 App Router + React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase Auth + Postgres + RLS + pgvector
- Vitest

## Features

- POS with table/takeaway modes, order management, and payment
- Kitchen display with order status tracking
- Table and zone management
- Menu management (simple items and recipe-based items)
- Inventory with stock movements, low-stock alerts, and negative stock control
- End-of-day reports and dashboard with channel/category breakdowns
- Excel import/export for menu and inventory
- AI assistant with hybrid RAG, intent planner, streaming, circuit breaker, dashboard builder, and telemetry

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Create `.env.local`**

Copy `.env.example` and fill in your values:

```bash
cp .env.example .env.local
```

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

For the AI assistant, set at least one provider key (`NVIDIA_API_KEY`, `MINIMAX_API_KEY`, or `OPENAI_API_KEY`) and an embedding key (`GOOGLE_AI_API_KEY` or `AI_EMBEDDING_API_KEY`). See `.env.example` for all options.

**3. Run migrations**

Apply all files in `supabase/migrations/` in order via the Supabase SQL editor or CLI:

```bash
supabase db push
```

**4. Start dev server**

```bash
npm run dev
```

Open `http://localhost:3000`, complete onboarding to create your organization and branch.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # TypeScript check
npm run test       # all tests
npm run test:ai    # AI-specific tests only
```

## CI

GitHub Actions runs lint, typecheck, and tests on every push to `main` or `master`. See `.github/workflows/ci.yml`.

## Roles

`owner` / `admin` / `manager` / `cashier` / `reception` / `kitchen` / `staff`. Permissions defined in `src/lib/auth/permissions.ts`.

## Notes

- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never expose it to the client.
- AI falls back to deterministic responses from governed RPCs when no provider key is set.
- Negative inventory behavior is configurable per organization in settings.
