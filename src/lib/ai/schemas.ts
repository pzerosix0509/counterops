import { z } from "zod";

const scalarSchema = z.union([z.string(), z.number().finite()]);
const dataRowSchema = z.record(z.string(), scalarSchema);

export const aiChartSpecSchema = z.object({
  type: z.enum(["bar", "line", "area", "pie", "donut", "composed"]),
  title: z.string().trim().min(1).max(160),
  xKey: z.string().trim().min(1).max(80),
  yKey: z.string().trim().min(1).max(80),
  data: z.array(dataRowSchema).max(200),
}).strict();

export const aiDashboardCardSpecSchema = z.object({
  title: z.string().trim().min(1).max(120),
  value: scalarSchema,
  description: z.string().trim().max(240).optional(),
  tone: z.enum(["neutral", "good", "warning", "bad"]).optional(),
  delta: z.object({
    label: z.string().trim().min(1).max(100),
    value: scalarSchema,
    direction: z.enum(["up", "down", "flat"]).optional(),
  }).strict().optional(),
}).strict();

const aiDashboardTableSpecSchema = z.object({
  title: z.string().trim().min(1).max(160),
  columns: z.array(z.object({
    key: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(100),
    align: z.enum(["left", "right"]).optional(),
  }).strict()).min(1).max(12),
  rows: z.array(dataRowSchema).max(100),
}).strict();

export const aiDashboardSpecSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(300).optional(),
  layout: z.literal("grid"),
  filters: z.array(z.string().trim().min(1).max(160)).max(12),
  cards: z.array(aiDashboardCardSpecSchema).max(12),
  charts: z.array(aiChartSpecSchema).max(8),
  tables: z.array(aiDashboardTableSpecSchema).max(8),
  insights: z.array(z.string().trim().min(1).max(400)).max(12),
}).strict();

export const aiModelAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(12_000),
  bullets: z.array(z.string().trim().min(1).max(800)).max(10),
  dashboard: aiDashboardSpecSchema.nullable(),
}).strict();

export const aiChatRequestSchema = z.object({
  question: z.string().trim().max(1000).optional(),
  mode: z.enum(["chat", "dashboard"]).optional(),
  sessionId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  stream: z.boolean().optional(),
  image: z.object({
    data: z.string().max(4_000_000),
    mime: z.string().regex(/^image\/(jpeg|png|webp|gif)$/),
  }).optional(),
}).refine((value) => (value.question?.trim().length ?? 0) >= 2 || Boolean(value.image), {
  message: "Cần câu hỏi (ít nhất 2 ký tự) hoặc ảnh đính kèm.",
  path: ["question"],
}).strict();

export type AiModelAnswerPayload = z.infer<typeof aiModelAnswerSchema>;
