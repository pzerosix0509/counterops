import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import {
  MOCK_ORG_ID,
  MOCK_BRANCH_ID,
  MOCK_USER_ID,
  MOCK_INVENTORY_ITEMS,
} from "@/lib/mock/data";
import { createMockServerClient } from "@/lib/mock/supabase";

// ── GET /api/ai/sessions/[sessionId] ──

describe("API — GET /api/ai/sessions/[sessionId]", () => {
  it("returns messages for a valid session", async () => {
    const { GET } = await import("@/app/api/ai/sessions/[sessionId]/route");

    // Seed a session + messages
    const client = createMockServerClient();
    const sessionId = "00000000-0000-4000-a000-000000000099";
    await client.from("ai_chat_sessions").insert({
      id: sessionId,
      organization_id: MOCK_ORG_ID,
      branch_id: MOCK_BRANCH_ID,
      user_id: MOCK_USER_ID,
      title: "Test session",
      mode: "chat",
      message_count: 2,
    });
    await client.from("ai_chat_messages").insert([
      {
        id: "00000000-0000-4000-a000-000000000091",
        organization_id: MOCK_ORG_ID,
        branch_id: MOCK_BRANCH_ID,
        session_id: sessionId,
        role: "user",
        content: "Xin chào",
      },
      {
        id: "00000000-0000-4000-a000-000000000092",
        organization_id: MOCK_ORG_ID,
        branch_id: MOCK_BRANCH_ID,
        session_id: sessionId,
        role: "assistant",
        content: "Chào bạn!",
      },
    ]);

    const req = new NextRequest("http://localhost/api/ai/sessions/" + sessionId);
    const res = await GET(req, { params: { sessionId } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toBeDefined();
    expect(body.messages.length).toBe(2);
  });

  it("returns 400 for invalid sessionId", async () => {
    const { GET } = await import("@/app/api/ai/sessions/[sessionId]/route");
    const req = new NextRequest("http://localhost/api/ai/sessions/not-a-uuid");
    const res = await GET(req, { params: { sessionId: "not-a-uuid" } });
    expect(res.status).toBe(400);
  });
});

// ── GET /api/inventory/movements ──

describe("API — GET /api/inventory/movements", () => {
  it("returns movements for a valid itemId", async () => {
    const { GET } = await import("@/app/api/inventory/movements/route");
    const itemId = MOCK_INVENTORY_ITEMS[0].id;
    const url = `http://localhost/api/inventory/movements?itemId=${itemId}`;
    const req = new NextRequest(url);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movements).toBeDefined();
    expect(Array.isArray(body.movements)).toBe(true);
  });

  it("returns 400 when itemId is missing", async () => {
    const { GET } = await import("@/app/api/inventory/movements/route");
    const req = new NextRequest("http://localhost/api/inventory/movements");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing itemId");
  });
});
