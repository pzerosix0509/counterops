import type { PaymentMethod } from "@/types/database";

export type InventoryDeductionTiming = "payment" | "kitchen_start";
export type DefaultOrderType = "dine_in" | "takeaway";

export interface OperationalSettings {
  inventoryDeductionTiming: InventoryDeductionTiming;
  lowStockAlertEnabled: boolean;
  defaultLowStockThreshold: number;
  defaultOrderType: DefaultOrderType;
  defaultTakeawayChannelId: string | null;
  allowUnpaidOrders: boolean;
  discountsEnabled: boolean;
  maxDiscountPercent: number;
  defaultPaymentMethod: PaymentMethod;
  kitchenSoundEnabled: boolean;
  autoSendToKitchenOnPayment: boolean;
  showRegularItemsInKitchen: boolean;
  autoMarkServedOnReady: boolean;
  businessDayStartTime: string;
  includeServiceFeeInRevenue: boolean;
  autoGenerateEod: boolean;
  receiptStoreName: string | null;
  receiptAddress: string | null;
  receiptPhone: string | null;
  receiptLogoUrl: string | null;
  receiptFooter: string;
  bankCode: string | null;
  bankAccountNumber: string | null;
  taxCode: string | null;
  businessLine: string | null;
  businessStartDate: string | null;
  accountHolderName: string | null;
  province: string | null;
  district: string | null;
  commune: string | null;
}

export const DEFAULT_OPERATIONAL_SETTINGS: OperationalSettings = {
  inventoryDeductionTiming: "payment",
  lowStockAlertEnabled: true,
  defaultLowStockThreshold: 0,
  defaultOrderType: "dine_in",
  defaultTakeawayChannelId: null,
  allowUnpaidOrders: true,
  discountsEnabled: true,
  maxDiscountPercent: 100,
  defaultPaymentMethod: "cash",
  kitchenSoundEnabled: true,
  autoSendToKitchenOnPayment: true,
  showRegularItemsInKitchen: false,
  autoMarkServedOnReady: false,
  businessDayStartTime: "00:00",
  includeServiceFeeInRevenue: true,
  autoGenerateEod: false,
  receiptStoreName: null,
  receiptAddress: null,
  receiptPhone: null,
  receiptLogoUrl: null,
  receiptFooter: "Cảm ơn quý khách.",
  bankCode: null,
  bankAccountNumber: null,
  taxCode: null,
  businessLine: null,
  businessStartDate: null,
  accountHolderName: null,
  province: null,
  district: null,
  commune: null,
};
