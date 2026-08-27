/** True when the event target is a Radix layer portaled outside DialogContent (Select/Popover). */

let openSelects = 0;
let lastSelectCloseAt = 0;
const SELECT_OVERLAY_GUARD_MS = 400;

export function noteSelectOpenChange(open: boolean) {
  if (open) {
    openSelects += 1;
    return;
  }
  openSelects = Math.max(0, openSelects - 1);
  lastSelectCloseAt = Date.now();
}

export function shouldIgnoreDialogOutsideEvent(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (
    target.closest("[data-radix-select-content]") ||
    target.closest("[data-radix-select-viewport]") ||
    target.closest("[data-radix-popper-content-wrapper]") ||
    target.closest("[data-radix-focus-guard]")
  ) {
    return true;
  }
  if (!target.closest("[data-dialog-overlay]")) return false;
  if (openSelects > 0) return true;
  return Date.now() - lastSelectCloseAt < SELECT_OVERLAY_GUARD_MS;
}
