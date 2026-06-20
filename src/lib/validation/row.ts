import { z } from "zod";

/**
 * Map flat Zod issues (path: ["fieldName"]) into a row-level error report
 * suitable for the import preview UI. The path is translated to the
 * original column header (when supplied) so users can find the cell
 * quickly in their spreadsheet.
 */
export interface RowIssue {
  field: string;
  column?: string;
  message: string;
  code: string;
}

export function flattenZodIssues(
  error: z.ZodError,
  columnByField: Record<string, string>
): RowIssue[] {
  return error.issues.map((issue) => {
    const field = String(issue.path[0] ?? "");
    return {
      field,
      column: columnByField[field] ?? field,
      message: issue.message,
      code: issue.code,
    };
  });
}

export interface ValidatedRow<T> {
  rowNumber: number;
  data: T;
}

export interface ValidationReport<T> {
  cleaned: ValidatedRow<T>[];
  errors: Array<{ rowNumber: number; issues: RowIssue[] }>;
}

/**
 * Validate a batch of parsed rows, returning a per-row error map keyed
 * by the row number reported in the original file. Rows that pass
 * validation are returned in `cleaned` for further processing.
 */
export function validateRows<T>(
  items: Array<{ rowNumber: number; values: Record<string, unknown> }>,
  schema: z.ZodType<T>,
  columnByField: Record<string, string>
): ValidationReport<T> {
  const cleaned: ValidatedRow<T>[] = [];
  const errors: Array<{ rowNumber: number; issues: RowIssue[] }> = [];
  for (const item of items) {
    const parsed = schema.safeParse(item.values);
    if (parsed.success) {
      cleaned.push({ rowNumber: item.rowNumber, data: parsed.data });
    } else {
      errors.push({ rowNumber: item.rowNumber, issues: flattenZodIssues(parsed.error, columnByField) });
    }
  }
  return { cleaned, errors };
}
