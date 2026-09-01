import { z } from "zod";

/**
 * Zod schemas for Grab mock integration validation
 */

export const grabOrderItemSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string().min(1),
  quantity: z.number().int().positive("Số lượng phải > 0"),
  unit_price: z.number().int().min(0),
  notes: z.string().optional(),
});
export type GrabOrderItem = z.infer<typeof grabOrderItemSchema>;

export const grabOrderPayloadSchema = z.object({
  grab_order_id: z.string().min(1, "Mã đơn Grab không được trống"),
  merchant_id: z.string().min(1),
  customer_phone: z.string().min(1),
  customer_name: z.string().min(1),
  delivery_address: z.string().optional(),
  items: z.array(grabOrderItemSchema).min(1, "Đơn phải có ít nhất 1 món"),
  subtotal: z.number().int().min(0),
  total_amount: z.number().int().min(0),
  special_instructions: z.string().optional(),
  ordered_at: z.string().datetime(),
});
export type GrabOrderPayload = z.infer<typeof grabOrderPayloadSchema>;

export const toggleGrabOnlineSchema = z.object({
  isOnline: z.boolean(),
});
export type ToggleGrabOnlineInput = z.infer<typeof toggleGrabOnlineSchema>;

export const syncGrabMenuSchema = z.object({
  // Future extension: detailed menu sync options
  includeUnavailable: z.boolean().optional(),
});
export type SyncGrabMenuInput = z.infer<typeof syncGrabMenuSchema>;
