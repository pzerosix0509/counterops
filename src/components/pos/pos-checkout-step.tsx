"use client";

import { Input } from "@/components/ui/input";
import { getCustomerPhoneError } from "@/lib/customers/phone";
import type { OperationalSettings } from "@/lib/settings/operational";

function normalizeNumberInput(value: string): string {
  return value.replace(/^0+(?=\d)/, "");
}

function numberInputValue(value: string): number {
  return Number(value) || 0;
}

export function PosCheckoutStep({
  customerPhone,
  customerName,
  discount,
  tax,
  serviceFee,
  settings,
  onCustomerPhoneChange,
  onCustomerNameChange,
  onDiscountChange,
  onTaxChange,
  onServiceFeeChange,
}: {
  customerPhone: string;
  customerName: string;
  discount: string;
  tax: string;
  serviceFee: string;
  settings: OperationalSettings;
  onCustomerPhoneChange: (value: string) => void;
  onCustomerNameChange: (value: string) => void;
  onDiscountChange: (value: string) => void;
  onTaxChange: (value: string) => void;
  onServiceFeeChange: (value: string) => void;
}) {
  const phoneError = getCustomerPhoneError(customerPhone);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">SĐT khách (RFM)</label>
          <Input
            value={customerPhone}
            onChange={(e) => onCustomerPhoneChange(e.target.value)}
            placeholder="0901234567"
            inputMode="tel"
            maxLength={20}
            aria-invalid={phoneError ? true : undefined}
          />
          {phoneError ? <p className="mt-1 text-xs text-destructive">{phoneError}</p> : null}
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tên khách</label>
          <Input value={customerName} onChange={(e) => onCustomerNameChange(e.target.value)} placeholder="Tuỳ chọn" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="text-xs text-muted-foreground">Giảm giá (%)</label>
          <Input
            type="number"
            min="0"
            value={discount}
            max={settings.maxDiscountPercent}
            disabled={!settings.discountsEnabled}
            onChange={(event) => {
              const normalized = normalizeNumberInput(event.target.value);
              if (!normalized) {
                onDiscountChange("");
                return;
              }
              const raw = numberInputValue(normalized);
              onDiscountChange(String(Math.min(Math.max(0, raw), settings.maxDiscountPercent)));
            }}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Thuế (%)</label>
          <Input
            type="number"
            min="0"
            max="100"
            value={tax}
            onChange={(event) => {
              const normalized = normalizeNumberInput(event.target.value);
              if (!normalized) {
                onTaxChange("");
                return;
              }
              onTaxChange(String(Math.min(100, numberInputValue(normalized))));
            }}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Phí DV</label>
          <Input type="number" min="0" value={serviceFee} onChange={(event) => onServiceFeeChange(normalizeNumberInput(event.target.value))} />
        </div>
      </div>
    </div>
  );
}
