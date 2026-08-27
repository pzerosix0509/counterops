// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { noteSelectOpenChange, shouldIgnoreDialogOutsideEvent } from "@/lib/ui/dialog-outside";
import { readCategoryForm } from "@/lib/ui/category-form";

function el(html: string): Element {
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild as Element;
}

describe("shouldIgnoreDialogOutsideEvent", () => {
  it("ignores clicks on a portaled select listbox", () => {
    const node = el(`<div data-radix-popper-content-wrapper><div data-radix-select-content role="listbox"><div>Cà phê</div></div></div>`);
    const inner = node.querySelector("div")!.firstElementChild!;
    expect(shouldIgnoreDialogOutsideEvent(inner)).toBe(true);
    expect(shouldIgnoreDialogOutsideEvent(node)).toBe(true);
  });

  it("does not ignore the dialog overlay by default", () => {
    const overlay = el(`<div data-dialog-overlay class="fixed inset-0 bg-black/50"></div>`);
    expect(shouldIgnoreDialogOutsideEvent(overlay)).toBe(false);
  });

  it("ignores overlay click-through right after a select closes", () => {
    noteSelectOpenChange(true);
    noteSelectOpenChange(false);
    const overlay = el(`<div data-dialog-overlay class="fixed inset-0 bg-black/50"></div>`);
    expect(shouldIgnoreDialogOutsideEvent(overlay)).toBe(true);
  });

  it("ignores radix focus guards used while a select is open", () => {
    const guard = el(`<span data-radix-focus-guard></span>`);
    expect(shouldIgnoreDialogOutsideEvent(guard)).toBe(true);
  });
});

describe("readCategoryForm", () => {
  it("treats nhóm món as optional and prefers a new group name", () => {
    const form = new FormData();
    form.set("menuType", "drink");
    form.set("categoryId", "11111111-1111-1111-1111-111111111111");
    form.set("newCategoryName", "  Sinh tố  ");
    expect(readCategoryForm(form)).toEqual({
      menuType: "drink",
      categoryId: null,
      newCategoryName: "Sinh tố",
    });
  });

  it("keeps an existing group when no new name is typed", () => {
    const form = new FormData();
    form.set("menuType", "food");
    form.set("categoryId", "11111111-1111-1111-1111-111111111111");
    expect(readCategoryForm(form)).toEqual({
      menuType: "food",
      categoryId: "11111111-1111-1111-1111-111111111111",
      newCategoryName: "",
    });
  });
});
