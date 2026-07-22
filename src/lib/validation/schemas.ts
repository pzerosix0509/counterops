import { z } from "zod";

export const onboardingSchema = z.object({
  organizationName: z.string().min(2, "Tên cửa hàng tối thiểu 2 ký tự"),
  organizationSlug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug chỉ gồm chữ thường, số và dấu gạch ngang"),
  businessType: z.string().default("restaurant"),
  branchName: z.string().min(1, "Tên chi nhánh không được trống"),
  branchAddress: z.string().optional().nullable(),
  branchPhone: z.string().optional().nullable(),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const productSchema = z.object({
  name: z.string().min(1, "Tên món không được trống"),
  code: z.string().min(1, "Mã món không được trống"),
  categoryId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  menuType: z.enum(["food", "drink", "service", "other"]),
  productType: z.enum(["regular", "prepared"]),
  costPrice: z.number().int().min(0, "Giá vốn không âm"),
  salePrice: z.number().int().min(0, "Giá bán không âm"),
  unit: z.string().min(1),
  isActive: z.boolean().default(true),
  recipe: z
    .array(
      z.object({
        inventoryItemId: z.string().uuid(),
        quantity: z.number().positive(),
        unit: z.string().min(1),
        estimatedCost: z.number().int().min(0).default(0),
      })
    )
    .optional(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
});

export const inventoryItemSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  itemType: z.enum(["ingredient", "sellable_product", "packaging", "other"]),
  unit: z.string().min(1),
  costPrice: z.number().int().min(0),
  description: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  initialQuantity: z.number().min(0).default(0),
  lowStockThreshold: z.number().min(0).default(0),
});
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;

export const inventoryMovementSchema = z.object({
  branchId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  movementType: z.enum(["purchase", "adjustment", "waste", "return", "transfer_in", "transfer_out"]),
  quantityDelta: z.number().refine((v) => v !== 0, "Số lượng phải khác 0"),
  unitCost: z.number().int().min(0).default(0),
  note: z.string().nullable().optional(),
});

export const areaSchema = z.object({ name: z.string().min(1), sortOrder: z.number().int().default(0) });
export const roomSchema = z.object({
  name: z.string().min(1),
  areaId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().default(0),
});
export const tableSchema = z.object({
  branchId: z.string().uuid(),
  areaId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  seats: z.number().int().min(1).default(2),
  sortOrder: z.number().int().default(0),
});
export const tableStatusSchema = z.object({
  status: z.enum(["available", "occupied", "reserved", "disabled"]),
});

export const orderItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  note: z.string().nullable().optional(),
});

export const orderInputSchema = z.object({
  branchId: z.string().uuid(),
  tableId: z.string().uuid().nullable().optional(),
  salesChannelId: z.string().uuid().nullable().optional(),
  orderType: z.enum(["dine_in", "takeaway", "delivery", "online"]).default("dine_in"),
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  items: z.array(orderItemInputSchema).min(1, "Đơn hàng phải có ít nhất 1 món"),
  discountAmount: z.number().int().min(0).default(0),
  taxAmount: z.number().int().min(0).default(0),
  serviceFeeAmount: z.number().int().min(0).default(0),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export const paymentInputSchema = z.object({
  orderId: z.string().uuid(),
  payments: z
    .array(
      z.object({
        method: z.enum(["cash", "bank_transfer", "card", "ewallet", "debt", "other"]),
        amount: z.number().int().positive("Số tiền phải lớn hơn 0"),
        transactionRef: z.string().nullable().optional(),
      })
    )
    .min(1, "Chưa có hình thức thanh toán"),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const kitchenStatusSchema = z.object({
  status: z.enum(["pending", "cooking", "ready", "served", "cancelled"]),
});

export const cancelOrderItemSchema = z.object({
  orderItemId: z.string().uuid(),
  reason: z.string().min(1, "Nhập lý do hủy"),
  stage: z.enum(["before_kitchen", "after_kitchen", "after_temp_bill", "out_of_stock"]),
});

export const eodInputSchema = z.object({
  branchId: z.string().uuid(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const inventorySettingsSchema = z.object({
  allowNegativeInventory: z.boolean(),
});

export const operationalSettingsSchema = z.object({
  allowNegativeInventory: z.boolean(),
  inventoryDeductionTiming: z.enum(["payment", "kitchen_start"]),
  lowStockAlertEnabled: z.boolean(),
  defaultLowStockThreshold: z.number().min(0),
  defaultOrderType: z.enum(["dine_in", "takeaway"]),
  defaultTakeawayChannelId: z.string().uuid().nullable().optional(),
  allowUnpaidOrders: z.boolean(),
  discountsEnabled: z.boolean(),
  maxDiscountPercent: z.number().min(0).max(100),
  defaultPaymentMethod: z.enum(["cash", "bank_transfer", "card", "ewallet", "debt", "other"]),
  kitchenSoundEnabled: z.boolean(),
  autoSendToKitchenOnPayment: z.boolean(),
  showRegularItemsInKitchen: z.boolean(),
  autoMarkServedOnReady: z.boolean(),
  businessDayStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  includeServiceFeeInRevenue: z.boolean(),
  autoGenerateEod: z.boolean(),
  receiptStoreName: z.string().trim().max(120).nullable().optional(),
  receiptAddress: z.string().trim().max(240).nullable().optional(),
  receiptPhone: z.string().trim().max(40).nullable().optional(),
  receiptLogoUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  receiptFooter: z.string().trim().max(240),
  bankCode: z.string().trim().max(20).nullable().optional(),
  bankAccountNumber: z.string().trim().max(30).nullable().optional(),
  salesChannels: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1),
    type: z.string().trim().min(1),
    isActive: z.boolean(),
    platformFeePercent: z.number().min(0).max(100),
    sortOrder: z.number().int().default(0),
  })),
});
export type OperationalSettingsInput = z.infer<typeof operationalSettingsSchema>;
