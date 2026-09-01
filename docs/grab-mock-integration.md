# Grab Mock Integration - Documentation

## Overview

The Grab mock integration is a **complete simulation of GrabFood Merchant API** built entirely within CounterOps for capstone project demonstration purposes.

### Why Mock?

Since this is an undergraduate capstone project, we cannot use a real GrabFood Merchant account (requires official partnership). The mock integration:

- ✅ Demonstrates how order flows would work in a real Grab integration
- ✅ Allows demo presentations to run independently without external APIs
- ✅ Simulates realistic data (orders from real menu, proper totals)
- ✅ Maintains same database schema as if it were real Grab orders
- ⚠️ **Does NOT** make real HTTP calls to Grab servers (all simulated in-memory + Supabase)

---

## Architecture

### What's Implemented

#### 1. **Mock API Client** (`src/lib/integrations/grab/mock-client.ts`)

Simulates GrabFood Merchant API methods:

```typescript
// In reality, this would call https://api.grab.com/...
const client = getGrabMockClient();

// Mock OAuth2
const token = await client.getAccessToken();

// Mock order accept/reject
const response = await client.acceptOrder("GRAB-123", { 
  acceptance_status: "accepted" 
});

// Mock status updates
await client.updateOrderStatus("GRAB-123", "ready_for_pickup");
```

**Key Design Decision:** All calls are **INSTANT** (no artificial delays). For demo purposes, we want reliability over realism.

#### 2. **Order Webhook Handler** (`src/server/integrations/grab/webhook-handler.ts`)

Receives mock order payloads and creates CounterOps orders:

- Validates payload with Zod schema
- Maps Grab fields → CounterOps `orders` + `order_items` tables
- Uses `sales_channel_id = "Grab (Mock)"` to track source
- Logs all events to `grab_sync_events` table
- Uses admin client (bypass RLS) since it's an internal webhook

#### 3. **Order Sync** (`src/server/integrations/grab/order-sync.ts`)

Handles kitchen acceptance/rejection:

- When kitchen accepts → `grab_sync_status = "accepted"`, order sent to kitchen
- When kitchen rejects → `grab_sync_status = "rejected"`, order cancelled
- Calls mock Grab API to confirm status
- Logs event to `grab_sync_events`

#### 4. **Menu Sync** (`src/server/integrations/grab/menu-sync.ts`)

**Current Status:** Minimal stub implementation

Currently only logs that sync happened. In future expansion, would:
- Detect menu changes (new items, price updates, out of stock)
- Sync availability to Grab
- Handle partial failures

#### 5. **Store Configuration** (`src/server/integrations/grab/store-config.ts`)

Manages per-branch Grab settings:

```typescript
grab_store_config table:
├── is_online: boolean           // Accept orders or not
├── merchant_id: string          // Mock merchant ID
├── last_menu_sync_at: timestamp
├── last_order_sync_at: timestamp
└── created_at, updated_at
```

#### 6. **Simulation Endpoint** (`src/app/api/integrations/grab/simulate/route.ts`)

Called when user clicks "Simulate New Order":

1. Checks if store is `is_online = true`
2. Fetches active menu items for the branch
3. Randomly selects 1-4 items (each with qty 1-3)
4. Calculates real totals (subtotal + delivery fee + platform fee)
5. Generates random customer info
6. Calls webhook endpoint with mock payload
7. Returns created order ID to UI

### Data Flow

```
User clicks "Simulate Order" button (UI)
    ↓
POST /api/integrations/grab/simulate
    ↓
Generate random order (real menu items, real prices)
    ↓
POST /api/integrations/grab/webhook
    ↓
handleGrabOrderWebhook()
    ├─ Validate payload
    ├─ Create orders + order_items in DB
    ├─ Link to "Grab (Mock)" sales channel
    ├─ Log event to grab_sync_events
    └─ Return created order ID
    ↓
Order appears in Kitchen Board + POS (realtime)
    ↓
Kitchen accepts/rejects → orderSync → Grab mock client notified
    ↓
Events logged to grab_sync_events (audit trail)
```

---

## Database Schema

### New Columns on `orders`

```sql
grab_external_id TEXT          -- Grab's order ID (for tracking)
grab_sync_status TEXT          -- none|pending|accepted|rejected|synced|cancelled
```

### New Table: `grab_store_config`

Per-branch configuration (unique per branch).

```sql
CREATE TABLE grab_store_config (
  id UUID PRIMARY KEY,
  organization_id UUID,
  branch_id UUID UNIQUE,
  is_online BOOLEAN DEFAULT false,    -- Store accepts Grab orders?
  merchant_id TEXT,                    -- Mock merchant ID
  last_menu_sync_at TIMESTAMPTZ,
  last_order_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

RLS: manager+ can read/write.

### New Table: `grab_sync_events`

Append-only event log for audit trail.

```sql
CREATE TABLE grab_sync_events (
  id UUID PRIMARY KEY,
  organization_id UUID,
  branch_id UUID,
  order_id UUID (nullable),                -- Link to order if applicable
  event_type TEXT,                          -- order_received|order_accepted|...
  payload JSONB,                            -- Event details (who, what, when)
  created_at TIMESTAMPTZ DEFAULT now()
);
```

RLS: manager+ can SELECT; INSERT via authenticated admin; no UPDATE/DELETE (append-only).

---

## How to Demo

### Prerequisites
```bash
# 1. Apply migration to Supabase
supabase db push

# 2. Verify no typecheck errors
npm run typecheck

# 3. Start dev server
npm run dev
```

### Quick Demo Flow (5 minutes)

1. **Navigate** to `http://localhost:3000/(app)/settings` and scroll down

2. **See** Grab Delivery (Mock) section with:
   - Status indicator (Đang nhận đơn / Không nhận đơn)
   - Toggle button (Bật nhận đơn / Tắt nhận đơn)
   - "Tạo đơn Grab mới (Mock)" button
   - "Đồng bộ menu" button
   - Mock/Demo badge

3. **Click "Bật nhận đơn"** → Store becomes online

4. **Click "Tạo đơn Grab mới (Mock)"** several times
   - Each click simulates a new Grab customer ordering
   - Orders appear immediately in Kitchen Board
   - Orders show Grab badge/label on Kitchen Board, POS, Orders dashboard

5. **In Kitchen Board**, accept/reject orders normally
   - Kitchen doesn't know/care that it's Grab
   - System handles sync in background

6. **Click "Tắt nhận đơn"** → Next simulate attempt shows error "Cửa hàng không đang nhận đơn Grab"

### What Viewers See

- ✅ Grab orders flow through system exactly like POS orders
- ✅ Kitchen board shows orders from multiple channels (dine_in, takeaway, **grab**)
- ✅ Reports/analytics can filter by channel to show Grab revenue separately
- ✅ Orders sync instantly (no artificial delays)
- ✅ Clear UI labels saying "DEMO MODE" (not production)

### Troubleshooting Demo Issues

| Issue | Solution |
|-------|----------|
| "Could not find table 'public.grab_store_config'" | Run `supabase db push` to apply migration |
| Store is offline error | Click "Bật nhận đơn" first in Settings |
| No menu items showing | Ensure products are created & set `is_active = true` |
| Orders not appearing | Check Kitchen Board is refreshed, or check browser console for errors |
| [GRAB MOCK] logs not visible | Open browser DevTools Console tab |

---

## Code Organization

```
src/
├── lib/integrations/grab/
│   ├── types.ts                    # GrabFood API type definitions
│   ├── mock-client.ts              # Simulated API client
│   └── mapper.ts                   # Payload mapping (Grab ↔ CounterOps)
├── server/integrations/grab/
│   ├── webhook-handler.ts          # Process incoming orders
│   ├── order-sync.ts               # Accept/reject sync
│   ├── menu-sync.ts                # Menu availability sync (stub)
│   └── store-config.ts             # Config CRUD
├── server/actions/grab.ts          # Public server actions
├── app/api/integrations/grab/
│   ├── webhook/route.ts            # POST /api/integrations/grab/webhook
│   └── simulate/route.ts           # POST /api/integrations/grab/simulate
├── components/integrations/grab/
│   └── grab-mock-panel.tsx         # Demo UI component
├── app/(app)/integrations/
│   └── page.tsx                    # /integrations page
├── lib/validation/grab-schemas.ts  # Zod validation schemas
└── __tests__/grab-integration.test.ts  # Unit tests
```

---

## Future Expansion (After Capstone)

### Production API Integration

Replace mock client with real HTTP calls:

```typescript
// Before (mock):
const client = getGrabMockClient();
await client.acceptOrder(orderId, {...});

// After (real):
const client = getGrabClient(accessToken);
const response = await fetch('https://api.grab.com/v1/partner/...');
```

### Menu Sync with Retry Logic

Current menu sync is a stub. For production, implement:

1. **Detect changes**: Compare current menu snapshot with last sync state
2. **Partial failures**: Some items fail, some succeed — need retry strategy
3. **Circuit breaker**: Grab API down for 10 mins → disable sync, alert manager

Example pattern already exists in codebase: `src/lib/ai/circuit-breaker.ts`

```typescript
// Future pattern:
const circuitBreaker = new CircuitBreaker({
  threshold: 5,           // Fail after 5 errors
  timeout: 300000,        // Reset after 5 mins
});

const result = await circuitBreaker.execute(async () => {
  return await grabClient.syncMenu(items);
});
```

### Store Hours Sync

Currently not implemented (bỏ qua per requirements). To add:

```sql
ALTER TABLE grab_store_config
  ADD COLUMN store_hours JSONB;

-- Store something like:
{
  "monday": {"open": "08:00", "close": "22:00"},
  "tuesday": {"open": "08:00", "close": "22:00"},
  ...
}
```

---

## Testing

Run tests:

```bash
npm run test -- grab-integration.test.ts
```

Tests cover:

- ✅ Webhook payload validation
- ✅ Order creation from valid payload
- ✅ Rejection handling
- ✅ Menu sync stub runs without error
- ✅ Offline store rejects orders

---

## Logging & Debugging

All Grab operations log with `[GRAB ...]` prefix for easy filtering:

```
[GRAB MOCK] Client initialized for merchant 1-MOCK000001
[GRAB WEBHOOK] Received webhook for org=..., branch=...
[GRAB WEBHOOK] Validated Grab order: GRAB-123456
[GRAB WEBHOOK] Created CounterOps order abc-def-ghi
[GRAB MOCK] Calling acceptOrder: orderId=GRAB-123456, status=accepted
[GRAB ORDER_SYNC] Grab mock response: {success: true, ...}
```

Filter in browser console or server logs for prefix `[GRAB` to see integration activity.

---

## FAQ

**Q: Is this a real connection to Grab?**  
A: No. It's a complete simulation. All "Grab API" calls are mocked in-memory. No real HTTP requests to grab.com.

**Q: Can we use this for production after capstone?**  
A: No. This is demo only. Real production would need:
- Official GrabFood Merchant account
- Real OAuth2 credentials
- Webhook validation (check signatures)
- Production API endpoints
- Rate limiting, retry logic, dead-letter queues
- Compliance with Grab's security requirements

**Q: What if we demo to teachers and they try to place a real Grab order?**  
A: It won't reach Grab servers. Simulated orders only exist in CounterOps database and grab_sync_events log. No customer impact.

**Q: Can we have multiple Grab orders at once?**  
A: Yes. The simulate endpoint calls webhook immediately, so clicking button 5 times creates 5 orders in quick succession. Kitchen board shows all as Grab channel orders.

---

## References

- **Real GrabFood Merchant API**: https://developer.grab.com/docs/grabfood/api/v1-1-3/
- **CounterOps Orders Schema**: See `src/types/database.ts` → `Order`, `OrderItem`
- **Circuit Breaker Pattern** (for future): `src/lib/ai/circuit-breaker.ts`
