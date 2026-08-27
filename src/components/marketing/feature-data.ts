import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Boxes,
  ChefHat,
  ShoppingCart,
  Table2,
  UtensilsCrossed,
} from "lucide-react";

export interface Feature {
  id: string;
  title: string;
  description: string;
  demoLabel: string;
  icon: LucideIcon;
}

export const FEATURES: Feature[] = [
  {
    id: "order",
    title: "Bán hàng POS",
    description:
      "Nhận đơn tại quầy hay tại bàn, áp dụng giảm giá, thanh toán tiền mặt hoặc chuyển khoản ngay trên một màn hình.",
    demoLabel: "Đặt món",
    icon: ShoppingCart,
  },
  {
    id: "kitchen",
    title: "Bếp realtime",
    description:
      "Món mới hiện ngay lập tức cho khu bếp, theo dõi món đang làm và báo hoàn tất để phục vụ đúng lúc.",
    demoLabel: "Quản lý bếp",
    icon: ChefHat,
  },
  {
    id: "tables",
    title: "Quản lý bàn / phòng",
    description:
      "Nắm rõ bàn trống, đặt trước và chuyển bàn chỉ với một thao tác — không còn nhầm lẫn giữa các ca.",
    demoLabel: "Bàn / Khu vực",
    icon: Table2,
  },
  {
    id: "menu",
    title: "Thực đơn linh hoạt",
    description:
      "Quản lý món ăn, combo và giá theo giờ; cập nhật một lần là đồng bộ đến mọi thiết bị bán hàng.",
    demoLabel: "Thêm món mới",
    icon: UtensilsCrossed,
  },
  {
    id: "inventory",
    title: "Kho hàng thông minh",
    description:
      "Tự động trừ tồn kho khi bán, cảnh báo sắp hết hàng và nhập hàng nhanh từ file Excel mẫu.",
    demoLabel: "Quản lý kho",
    icon: Boxes,
  },
  {
    id: "ai",
    title: "AI trợ lý kinh doanh",
    description:
      "Hỏi đáp số liệu bằng tiếng Việt: doanh thu hôm nay, món bán chạy, dự báo nhu cầu — không cần tự tính trên bảng tính.",
    demoLabel: "AI & Báo cáo",
    icon: Bot,
  },
];

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const MOTION = {
  entranceMs: 500,
  exitMs: 250,
  holdMs: 1400,
  staggerMs: 60,
} as const;

export interface DemoOrderItem {
  name: string;
  qty: number;
  price: number;
}

export const DEMO_ORDER: { table: string; items: DemoOrderItem[] } = {
  table: "Bàn 4",
  items: [
    { name: "Cà phê sữa đá", qty: 2, price: 28000 },
    { name: "Bánh mì trứng", qty: 1, price: 30000 },
    { name: "Trà tắc", qty: 1, price: 20000 },
  ],
};

export const DEMO_KITCHEN = [
  { table: "Bàn 4", item: "Cà phê sữa đá", qty: 2 },
  { table: "Bàn 7", item: "Phở bò", qty: 1 },
  { table: "Bàn 2", item: "Trà tắc", qty: 3 },
];

export const DEMO_TABLES = [
  { name: "Bàn 1", status: "Trống" },
  { name: "Bàn 2", status: "Có khách" },
  { name: "Bàn 3", status: "Đặt trước" },
  { name: "Bàn 4", status: "Có khách" },
  { name: "Bàn 5", status: "Trống" },
  { name: "Bàn 6", status: "Tạm khóa" },
];

export const DEMO_MENU = [
  { name: "Phở bò", category: "Món chính", price: 65000 },
  { name: "Cà phê sữa đá", category: "Đồ uống", price: 28000 },
  { name: "Trà tắc", category: "Đồ uống", price: 20000 },
];

export const DEMO_NEW_DISH = { name: "Bánh mì chảo", price: 35000 };

export const DEMO_INVENTORY: {
  name: string;
  stock: string;
  status: string;
  variant: "success" | "warning" | "danger";
}[] = [
  { name: "Cà phê hạt", stock: "12 kg", status: "Đủ", variant: "success" },
  { name: "Trứng", stock: "3 khay", status: "Sắp hết", variant: "warning" },
  { name: "Bột chiên", stock: "0 kg", status: "Hết hàng", variant: "danger" },
];

export const DEMO_AI_QUESTION = "Doanh thu hôm nay bao nhiêu?";

export const DEMO_AI_ANSWER =
  "Hôm nay đạt 4.286.000 đ, tăng 12% so với hôm qua. Món bán chạy nhất là Phở bò.";

export const DEMO_REVENUE = 4286000;

export const DEMO_BEST_SELLER = "Phở bò";

export const DEMO_DASHBOARD = [
  { label: "Đơn hàng", value: "86" },
  { label: "Khách", value: "142" },
  { label: "Món đang làm", value: "6" },
];
