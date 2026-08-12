import { z } from "zod";

export const uploadDocumentSchema = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(1).max(160),
    fileName: z.string().trim().min(1).max(240),
    mimeType: z.string().trim().max(120).nullable().optional(),
    content: z.string().min(1).optional(),
    binary: z
      .object({
        data: z.string().min(1).max(20_000_000), // base64
        mime: z.string().trim().min(1).max(120),
      })
      .optional(),
  })
  .refine((value) => Boolean(value.content || value.binary), {
    message: "Cần content hoặc binary.",
  });
