import type { Product } from "@/types/database";
import type { PosProductStock } from "@/lib/pos/stock";

export type PosProduct = Product & PosProductStock;
