import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatNumberInput, parseFormattedNumber } from "@/lib/utils/format";

type NumberInputProps = {
  /** Tên field trong FormData — giá trị submit là số thuần (đã parse). */
  name: string;
  /** Giá trị khởi tạo (số). */
  defaultValue?: number;
  /** Giá trị tối thiểu, áp dụng cả khi gõ lẫn khi parse. */
  min?: number;
  /** Số chữ số thập phân tối đa được phép. */
  decimals?: number;
  placeholder?: string;
  required?: boolean;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
};

/**
 * Ô nhập số có format (dấu phân tách hàng nghìn kiểu VN, ví dụ "1.000").
 * Giá trị submit qua FormData luôn là số thuần (không dấu phân tách).
 * Hỗ trợ số thập phân với dấu phẩy "," (ví dụ "1,5").
 */
export function NumberInput({
  name,
  defaultValue = 0,
  min = 0,
  decimals = 0,
  placeholder,
  required,
  className,
  id,
  "aria-describedby": ariaDescribedBy,
}: NumberInputProps) {
  const [value, setValue] = React.useState(() =>
    defaultValue.toLocaleString("vi-VN", { maximumFractionDigits: decimals })
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;

    // Phân biệt dấu thập phân với dấu phân tách nghìn:
    // - "," luôn là dấu thập phân (kiểu VN).
    // - "." là dấu thập phân chỉ khi không có "," và phần sau "." cuối cùng rỗng
    //   hoặc có ≤ decimals chữ số; nếu không thì là phân tách nghìn do format chèn
    //   vào (ví dụ "4.000" gõ tiếp thành "4.0000" phải là 40.000, không phải 4).
    let intRaw = raw;
    let decRaw = "";
    let hasDecimal = false;
    const commaIdx = raw.lastIndexOf(",");
    const dotIdx = raw.lastIndexOf(".");
    if (commaIdx !== -1) {
      intRaw = raw.slice(0, commaIdx);
      decRaw = raw.slice(commaIdx + 1);
      hasDecimal = true;
    } else if (decimals > 0 && dotIdx !== -1) {
      const after = raw.slice(dotIdx + 1);
      const afterDigits = after.replace(/\D/g, "");
      if (after === "" || (afterDigits.length >= 1 && afterDigits.length <= decimals)) {
        intRaw = raw.slice(0, dotIdx);
        decRaw = after;
        hasDecimal = true;
      }
    }

    const intDigits = intRaw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const decDigits = decRaw.replace(/\D/g, "").slice(0, decimals);
    const formattedInt = formatNumberInput(intDigits || "0");

    if (hasDecimal && decimals > 0 && (decRaw === "" || decDigits !== "")) {
      // Giữ dấu phẩy thập phân khi đang gõ (kể cả khi phần thập phân chưa có chữ số).
      setValue(`${formattedInt},${decDigits}`);
    } else {
      setValue(formattedInt);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Chặn ký tự không hợp lệ ở cấp keydown (phím số, dấu phẩy, điều hướng, copy/paste...)
    const allowed = /^[\d,]$/;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && !allowed.test(e.key)) {
      e.preventDefault();
    }
  }

  function handleBlur() {
    const num = parseFormattedNumber(value);
    if (num === null) {
      setValue(defaultValue.toLocaleString("vi-VN", { maximumFractionDigits: decimals }));
    } else if (num < min) {
      setValue(min.toLocaleString("vi-VN", { maximumFractionDigits: decimals }));
    } else {
      // toLocaleString("vi-VN") cho đúng dấu phân tách nghìn "." và thập phân ","
      setValue(num.toLocaleString("vi-VN", { maximumFractionDigits: decimals }));
    }
  }

  return (
    <>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className={className}
        placeholder={placeholder}
        required={required}
        aria-describedby={ariaDescribedBy}
        value={value}
        onChange={onChange}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
      />
      {/* Giá trị submit qua FormData luôn là số thuần (không dấu phân tách). */}
      <input type="hidden" name={name} value={parseFormattedNumber(value) ?? ""} />
    </>
  );
}
