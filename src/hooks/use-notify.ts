"use client";

import { toast } from "sonner";

/**
 * Server actions return a discriminated `ActionResult`. When `ok` is false,
 * callers usually want the error message surfaced as a toast description.
 */
export type ActionResultLike<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

interface ErrorLike {
  message: string;
}

function describeError(err: unknown): string {
  if (!err) return "Đã xảy ra lỗi không xác định.";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object" && "message" in err && typeof (err as ErrorLike).message === "string") {
    return (err as ErrorLike).message;
  }
  return "Đã xảy ra lỗi không xác định.";
}

export function notifySuccess(message: string, description?: string) {
  toast.success(message, description ? { description } : undefined);
}

export function notifyError(message: string, descriptionOrError?: string | unknown) {
  const description =
    typeof descriptionOrError === "string"
      ? descriptionOrError
      : descriptionOrError === undefined
        ? undefined
        : describeError(descriptionOrError);
  toast.error(message, description ? { description } : undefined);
}

export function notifyInfo(message: string, description?: string) {
  toast(message, description ? { description } : undefined);
}

/**
 * Convenience helper for the very common pattern of "call a server action and
 * toast success or failure with the result's error message".
 */
export function notifyActionResult<T>(
  result: ActionResultLike<T>,
  successMessage: string,
  errorTitle: string,
): boolean {
  if (result.ok) {
    notifySuccess(successMessage);
    return true;
  }
  notifyError(errorTitle, result.error.message);
  return false;
}
