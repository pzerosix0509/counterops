// Table status transition helpers. All currency is integer VND.

import type { MembershipRole } from "@/types/database";

export type TableStatus = "available" | "occupied" | "reserved" | "disabled";

// Roles that may free a table even when an open order exists on it.
export const FREE_TABLE_BYPASS_ROLES: MembershipRole[] = ["owner", "admin", "manager"];

export function canFreeTable(
  role: MembershipRole,
  currentStatus: TableStatus,
  hasOpenOrder: boolean
): boolean {
  // Only transitioning an occupied table requires checking for an open order.
  if (currentStatus !== "occupied") return true;
  if (!hasOpenOrder) return true;
  return FREE_TABLE_BYPASS_ROLES.includes(role);
}
