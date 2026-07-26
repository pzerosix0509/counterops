// This is the files defining all the mock data
// using the data type from the types/database
// Purpose: 
// Using this file to create new mock data, modify existing mock data

// import all the types defined in the database
import type {
  Organization, Branch, Profile, Membership,
  MenuCategory, Product, SalesChannel,
  Area, Room, DiningTable,
  InventoryItem, InventoryBalance, InventoryMovement,
  Recipe, RecipeItem,
  Order, OrderItem, Payment,
} from "@/types/database";

// a method to calculate the ISO date an hour ago
function hoursAgo(n: number): string {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d.toISOString();
}

// a method to calculate the ISO date a day ago
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// MOCK user's data
// ORG_ID = organization_Id 
// BRANCH_ID = chi nhanh cua user
// USER_ID = the id of the user account
export const MOCK_ORG_ID = "org_1";
export const MOCK_BRANCH_ID = "branch_1";
export const MOCK_USER_ID = "user_1";

// create a mock Organization data
export const MOCK_ORGANIZATIONS: Organization[] = [
  {
    id: MOCK_ORG_ID,
    name: "Quán Cafe Demo",
    slug: "quan-cafe-demo",
    business_type: "cafe",
    timezone: "Asia/Ho_Chi_Minh",
    currency: "VND",
    allow_negative_inventory: false,
    created_at: daysAgo(30),
    updated_at: daysAgo(1),
  },
];

// mock branch
export const MOCK_BRANCHES: Branch[] = [
  {
    id: MOCK_BRANCH_ID,
    organization_id: MOCK_ORG_ID,
    name: "Chi nhánh chính",
    address: "123 Nguyễn Huệ, Q.1, TP.HCM",
    phone: "0901234567",
    timezone: "Asia/Ho_Chi_Minh",
    is_active: true,
    created_at: daysAgo(30),
    updated_at: daysAgo(1),
  },
];

export const MOCK_PROFILES: Profile[] = [
  {
    id: MOCK_USER_ID,
    full_name: "Admin Demo",
    phone: "0901234567",
    avatar_url: null,
    default_organization_id: MOCK_ORG_ID,
    created_at: daysAgo(30),
    updated_at: daysAgo(1),
  },
];

export const MOCK_MEMBERSHIPS: Membership[] = [
  {
    id: "mem_1",
    organization_id: MOCK_ORG_ID,
    branch_id: null,
    user_id: MOCK_USER_ID,
    role: "owner",
    status: "active",
    invited_by: null,
    joined_at: daysAgo(30),
    created_at: daysAgo(30),
  },
];

export const MOCK_CATEGORIES: MenuCategory[] = [
  { id: "cat_1", organization_id: MOCK_ORG_ID, parent_id: null, name: "Cà phê", sort_order: 1, created_at: daysAgo(30), updated_at: daysAgo(30) },
  { id: "cat_2", organization_id: MOCK_ORG_ID, parent_id: null, name: "Trà", sort_order: 2, created_at: daysAgo(30), updated_at: daysAgo(30) },
  { id: "cat_3", organization_id: MOCK_ORG_ID, parent_id: null, name: "Sinh tố", sort_order: 3, created_at: daysAgo(30), updated_at: daysAgo(30) },
  { id: "cat_4", organization_id: MOCK_ORG_ID, parent_id: null, name: "Bánh ngọt", sort_order: 4, created_at: daysAgo(30), updated_at: daysAgo(30) },
  { id: "cat_5", organization_id: MOCK_ORG_ID, parent_id: null, name: "Khác", sort_order: 5, created_at: daysAgo(30), updated_at: daysAgo(30) },
];

export const MOCK_PRODUCTS: Product[] = [
  { id: "prod_1", organization_id: MOCK_ORG_ID, category_id: "cat_1", name: "Espresso", code: "CF001", image_url: null, description: "Cà phê espresso nguyên chất", menu_type: "drink", product_type: "regular", cost_price: 5000, sale_price: 25000, unit: "ly", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_2", organization_id: MOCK_ORG_ID, category_id: "cat_1", name: "Cappuccino", code: "CF002", image_url: null, description: "Cà phê capuccino với bọt sữa", menu_type: "drink", product_type: "regular", cost_price: 8000, sale_price: 35000, unit: "ly", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_3", organization_id: MOCK_ORG_ID, category_id: "cat_1", name: "Latte", code: "CF003", image_url: null, description: "Cà phê latte sữa nóng", menu_type: "drink", product_type: "regular", cost_price: 8000, sale_price: 35000, unit: "ly", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_4", organization_id: MOCK_ORG_ID, category_id: "cat_1", name: "Cà phê sữa đá", code: "CF004", image_url: null, description: "Cà phê sữa đá truyền thống", menu_type: "drink", product_type: "regular", cost_price: 4000, sale_price: 20000, unit: "ly", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_5", organization_id: MOCK_ORG_ID, category_id: "cat_1", name: "Cà phê đen", code: "CF005", image_url: null, description: "Cà phê đen đá", menu_type: "drink", product_type: "regular", cost_price: 3000, sale_price: 15000, unit: "ly", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_6", organization_id: MOCK_ORG_ID, category_id: "cat_2", name: "Trà đào", code: "TR001", image_url: null, description: "Trà đào cam sả", menu_type: "drink", product_type: "regular", cost_price: 5000, sale_price: 30000, unit: "ly", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_7", organization_id: MOCK_ORG_ID, category_id: "cat_2", name: "Trà chanh", code: "TR002", image_url: null, description: "Trà chanh tươi mát", menu_type: "drink", product_type: "regular", cost_price: 3000, sale_price: 20000, unit: "ly", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_8", organization_id: MOCK_ORG_ID, category_id: "cat_2", name: "Trà sữa", code: "TR003", image_url: null, description: "Trà sữa trân châu", menu_type: "drink", product_type: "regular", cost_price: 7000, sale_price: 35000, unit: "ly", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_9", organization_id: MOCK_ORG_ID, category_id: "cat_3", name: "Sinh tố bơ", code: "ST001", image_url: null, description: "Sinh tố bơ đậm đặc", menu_type: "drink", product_type: "regular", cost_price: 10000, sale_price: 40000, unit: "ly", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_10", organization_id: MOCK_ORG_ID, category_id: "cat_3", name: "Sinh tố xoài", code: "ST002", image_url: null, description: "Sinh tố xoài tươi", menu_type: "drink", product_type: "regular", cost_price: 8000, sale_price: 35000, unit: "ly", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_11", organization_id: MOCK_ORG_ID, category_id: "cat_4", name: "Bánh mì nướng", code: "BN001", image_url: null, description: "Bánh mì nướng bơ tỏi", menu_type: "food", product_type: "regular", cost_price: 5000, sale_price: 25000, unit: "phần", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_12", organization_id: MOCK_ORG_ID, category_id: "cat_4", name: "Bánh bông lan", code: "BN002", image_url: null, description: "Bánh bông lan kem tươi", menu_type: "food", product_type: "regular", cost_price: 8000, sale_price: 30000, unit: "phần", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_13", organization_id: MOCK_ORG_ID, category_id: "cat_4", name: "Tiramisu", code: "BN003", image_url: null, description: "Bánh tiramisu Ý", menu_type: "food", product_type: "regular", cost_price: 12000, sale_price: 45000, unit: "phần", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_14", organization_id: MOCK_ORG_ID, category_id: "cat_5", name: "Nước suối", code: "KC001", image_url: null, description: "Nước suối Lavie 500ml", menu_type: "drink", product_type: "regular", cost_price: 3000, sale_price: 10000, unit: "chai", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "prod_15", organization_id: MOCK_ORG_ID, category_id: "cat_5", name: "Coca Cola", code: "KC002", image_url: null, description: "Coca Cola lon 330ml", menu_type: "drink", product_type: "regular", cost_price: 5000, sale_price: 15000, unit: "lon", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
];

export const MOCK_PRODUCT_BRANCH_SETTINGS: any[] = [];

export const MOCK_SALES_CHANNELS: SalesChannel[] = [
  { id: "ch_1", organization_id: MOCK_ORG_ID, name: "Tại quán", type: "dine_in", is_active: true, platform_fee_percent: 0, sort_order: 1 },
  { id: "ch_2", organization_id: MOCK_ORG_ID, name: "Mang về", type: "takeaway", is_active: true, platform_fee_percent: 0, sort_order: 2 },
  { id: "ch_3", organization_id: MOCK_ORG_ID, name: "GrabFood", type: "delivery", is_active: true, platform_fee_percent: 15, sort_order: 3 },
];

export const MOCK_AREAS: Area[] = [
  { id: "area_1", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, name: "Trong nhà", sort_order: 1 },
  { id: "area_2", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, name: "Ngoài trời", sort_order: 2 },
];

export const MOCK_ROOMS: Room[] = [
  { id: "room_1", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: "area_1", name: "Phòng VIP", sort_order: 1 },
  { id: "room_2", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: "area_1", name: "Phòng A", sort_order: 2 },
  { id: "room_3", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: "area_2", name: "Sân vườn", sort_order: 3 },
];

export const MOCK_TABLES: DiningTable[] = [
  { id: "tbl_1", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: "area_1", room_id: null, name: "Bàn 1", seats: 2, status: "occupied", sort_order: 1 },
  { id: "tbl_2", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: "area_1", room_id: null, name: "Bàn 2", seats: 4, status: "available", sort_order: 2 },
  { id: "tbl_3", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: "area_1", room_id: null, name: "Bàn 3", seats: 4, status: "available", sort_order: 3 },
  { id: "tbl_4", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: "area_1", room_id: null, name: "Bàn 4", seats: 6, status: "occupied", sort_order: 4 },
  { id: "tbl_5", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: "area_1", room_id: null, name: "Bàn 5", seats: 6, status: "reserved", sort_order: 5 },
  { id: "tbl_6", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: "area_2", room_id: null, name: "Bàn 6", seats: 2, status: "occupied", sort_order: 6 },
  { id: "tbl_7", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: "area_2", room_id: null, name: "Bàn 7", seats: 4, status: "available", sort_order: 7 },
  { id: "tbl_8", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: "area_2", room_id: null, name: "Bàn 8", seats: 4, status: "available", sort_order: 8 },
  { id: "tbl_9", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: null, room_id: "room_1", name: "VIP 1", seats: 8, status: "available", sort_order: 9 },
  { id: "tbl_10", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, area_id: null, room_id: "room_1", name: "VIP 2", seats: 10, status: "occupied", sort_order: 10 },
];

export const MOCK_INVENTORY_ITEMS: InventoryItem[] = [
  { id: "inv_1", organization_id: MOCK_ORG_ID, name: "Hạt cà phê robusta", code: "KHO001", image_url: null, item_type: "ingredient", unit: "kg", cost_price: 80000, description: "Cà phê hạt robusta Đắk Lắk", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "inv_2", organization_id: MOCK_ORG_ID, name: "Hạt cà phê arabica", code: "KHO002", image_url: null, item_type: "ingredient", unit: "kg", cost_price: 120000, description: "Cà phê hạt arabica Cầu Đất", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "inv_3", organization_id: MOCK_ORG_ID, name: "Sữa tươi", code: "KHO003", image_url: null, item_type: "ingredient", unit: "lít", cost_price: 25000, description: "Sữa tươi tiệt trùng", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "inv_4", organization_id: MOCK_ORG_ID, name: "Sữa đặc", code: "KHO004", image_url: null, item_type: "ingredient", unit: "lon", cost_price: 15000, description: "Sữa đặc có đường", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "inv_5", organization_id: MOCK_ORG_ID, name: "Đường", code: "KHO005", image_url: null, item_type: "ingredient", unit: "kg", cost_price: 15000, description: "Đường RE", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "inv_6", organization_id: MOCK_ORG_ID, name: "Trà túi lọc", code: "KHO006", image_url: null, item_type: "ingredient", unit: "hộp", cost_price: 20000, description: "Trà túi lọc Lipton", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "inv_7", organization_id: MOCK_ORG_ID, name: "Đào hộp", code: "KHO007", image_url: null, item_type: "ingredient", unit: "hộp", cost_price: 25000, description: "Đào hộp nhập khẩu", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "inv_8", organization_id: MOCK_ORG_ID, name: "Trân châu", code: "KHO008", image_url: null, item_type: "ingredient", unit: "kg", cost_price: 30000, description: "Trân châu đen", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "inv_9", organization_id: MOCK_ORG_ID, name: "Bơ sáp", code: "KHO009", image_url: null, item_type: "ingredient", unit: "kg", cost_price: 60000, description: "Bơ sáp Đắk Lắk", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
  { id: "inv_10", organization_id: MOCK_ORG_ID, name: "Xoài cát", code: "KHO010", image_url: null, item_type: "ingredient", unit: "kg", cost_price: 35000, description: "Xoài cát Hòa Lộc", is_active: true, created_at: daysAgo(30), updated_at: daysAgo(1), deleted_at: null },
];

export const MOCK_INVENTORY_BALANCES: InventoryBalance[] = [
  { id: "bal_1", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_1", quantity_on_hand: 25, low_stock_threshold: 5, high_stock_threshold: 50, updated_at: daysAgo(1) },
  { id: "bal_2", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_2", quantity_on_hand: 15, low_stock_threshold: 3, high_stock_threshold: 30, updated_at: daysAgo(1) },
  { id: "bal_3", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_3", quantity_on_hand: 30, low_stock_threshold: 10, high_stock_threshold: 60, updated_at: daysAgo(1) },
  { id: "bal_4", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_4", quantity_on_hand: 20, low_stock_threshold: 5, high_stock_threshold: 40, updated_at: daysAgo(1) },
  { id: "bal_5", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_5", quantity_on_hand: 10, low_stock_threshold: 3, high_stock_threshold: 20, updated_at: daysAgo(1) },
  { id: "bal_6", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_6", quantity_on_hand: 8, low_stock_threshold: 2, high_stock_threshold: 15, updated_at: daysAgo(1) },
  { id: "bal_7", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_7", quantity_on_hand: 5, low_stock_threshold: 2, high_stock_threshold: 10, updated_at: daysAgo(1) },
  { id: "bal_8", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_8", quantity_on_hand: 3, low_stock_threshold: 1, high_stock_threshold: 10, updated_at: daysAgo(1) },
  { id: "bal_9", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_9", quantity_on_hand: 6, low_stock_threshold: 2, high_stock_threshold: 12, updated_at: daysAgo(1) },
  { id: "bal_10", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_10", quantity_on_hand: 4, low_stock_threshold: 2, high_stock_threshold: 10, updated_at: daysAgo(1) },
];

export const MOCK_INVENTORY_MOVEMENTS: InventoryMovement[] = [
  { id: "mov_1", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_1", movement_type: "purchase", quantity_delta: 30, unit_cost: 80000, reference_type: null, reference_id: null, note: "Nhập hàng tháng 6", created_by: MOCK_USER_ID, created_at: daysAgo(7) },
  { id: "mov_2", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_3", movement_type: "purchase", quantity_delta: 50, unit_cost: 25000, reference_type: null, reference_id: null, note: "Nhập sữa tuần", created_by: MOCK_USER_ID, created_at: daysAgo(5) },
  { id: "mov_3", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, inventory_item_id: "inv_1", movement_type: "sale_deduction", quantity_delta: -2, unit_cost: 80000, reference_type: "order", reference_id: "ord_1", note: null, created_by: null, created_at: hoursAgo(2) },
];

export const MOCK_RECIPES: Recipe[] = [
  { id: "rcp_1", organization_id: MOCK_ORG_ID, product_id: "prod_1", version: 1, is_active: true, created_at: daysAgo(30) },
  { id: "rcp_2", organization_id: MOCK_ORG_ID, product_id: "prod_2", version: 1, is_active: true, created_at: daysAgo(30) },
  { id: "rcp_3", organization_id: MOCK_ORG_ID, product_id: "prod_4", version: 1, is_active: true, created_at: daysAgo(30) },
];

export const MOCK_RECIPE_ITEMS: RecipeItem[] = [
  { id: "rci_1", recipe_id: "rcp_1", inventory_item_id: "inv_1", quantity: 0.02, unit: "kg", estimated_cost: 1600 },
  { id: "rci_2", recipe_id: "rcp_1", inventory_item_id: "inv_5", quantity: 0.01, unit: "kg", estimated_cost: 150 },
  { id: "rci_3", recipe_id: "rcp_2", inventory_item_id: "inv_1", quantity: 0.02, unit: "kg", estimated_cost: 1600 },
  { id: "rci_4", recipe_id: "rcp_2", inventory_item_id: "inv_3", quantity: 0.1, unit: "lít", estimated_cost: 2500 },
  { id: "rci_5", recipe_id: "rcp_3", inventory_item_id: "inv_1", quantity: 0.015, unit: "kg", estimated_cost: 1200 },
  { id: "rci_6", recipe_id: "rcp_3", inventory_item_id: "inv_4", quantity: 0.05, unit: "lon", estimated_cost: 750 },
];

export const MOCK_ORDERS: Order[] = [
  {
    id: "ord_1", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID,
    order_number: "ORD-001", table_id: "tbl_1", customer_id: null,
    sales_channel_id: "ch_1", order_type: "dine_in",
    status: "paid", subtotal: 85000, discount_amount: 0, tax_amount: 0,
    service_fee_amount: 0, total_amount: 85000, paid_amount: 85000,
    debt_amount: 0, opened_by: MOCK_USER_ID, closed_by: MOCK_USER_ID,
    opened_at: hoursAgo(3), closed_at: hoursAgo(2),
    cancelled_by: null, cancellation_reason: null,
  },
  {
    id: "ord_2", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID,
    order_number: "ORD-002", table_id: "tbl_4", customer_id: null,
    sales_channel_id: "ch_1", order_type: "dine_in",
    status: "paid", subtotal: 155000, discount_amount: 5000, tax_amount: 0,
    service_fee_amount: 0, total_amount: 150000, paid_amount: 150000,
    debt_amount: 0, opened_by: MOCK_USER_ID, closed_by: MOCK_USER_ID,
    opened_at: hoursAgo(5), closed_at: hoursAgo(3),
    cancelled_by: null, cancellation_reason: null,
  },
  {
    id: "ord_3", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID,
    order_number: "ORD-003", table_id: null, customer_id: null,
    sales_channel_id: "ch_2", order_type: "takeaway",
    status: "paid", subtotal: 45000, discount_amount: 0, tax_amount: 0,
    service_fee_amount: 0, total_amount: 45000, paid_amount: 45000,
    debt_amount: 0, opened_by: MOCK_USER_ID, closed_by: MOCK_USER_ID,
    opened_at: hoursAgo(4), closed_at: hoursAgo(3),
    cancelled_by: null, cancellation_reason: null,
  },
  {
    id: "ord_4", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID,
    order_number: "ORD-004", table_id: "tbl_6", customer_id: null,
    sales_channel_id: "ch_1", order_type: "dine_in",
    status: "sent_to_kitchen", subtotal: 65000, discount_amount: 0, tax_amount: 0,
    service_fee_amount: 0, total_amount: 65000, paid_amount: 0,
    debt_amount: 0, opened_by: MOCK_USER_ID, closed_by: null,
    opened_at: hoursAgo(1), closed_at: null,
    cancelled_by: null, cancellation_reason: null,
  },
  {
    id: "ord_5", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID,
    order_number: "ORD-005", table_id: "tbl_4", customer_id: null,
    sales_channel_id: "ch_3", order_type: "delivery",
    status: "open", subtotal: 120000, discount_amount: 10000, tax_amount: 0,
    service_fee_amount: 5000, total_amount: 115000, paid_amount: 0,
    debt_amount: 0, opened_by: MOCK_USER_ID, closed_by: null,
    opened_at: hoursAgo(1), closed_at: null,
    cancelled_by: null, cancellation_reason: null,
  },
  {
    id: "ord_6", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID,
    order_number: "ORD-006", table_id: "tbl_10", customer_id: null,
    sales_channel_id: "ch_1", order_type: "dine_in",
    status: "paid", subtotal: 320000, discount_amount: 20000, tax_amount: 0,
    service_fee_amount: 0, total_amount: 300000, paid_amount: 300000,
    debt_amount: 0, opened_by: MOCK_USER_ID, closed_by: MOCK_USER_ID,
    opened_at: hoursAgo(8), closed_at: hoursAgo(6),
    cancelled_by: null, cancellation_reason: null,
  },
  {
    id: "ord_7", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID,
    order_number: "ORD-007", table_id: null, customer_id: null,
    sales_channel_id: "ch_2", order_type: "takeaway",
    status: "cancelled", subtotal: 55000, discount_amount: 0, tax_amount: 0,
    service_fee_amount: 0, total_amount: 55000, paid_amount: 0,
    debt_amount: 0, opened_by: MOCK_USER_ID, closed_by: null,
    opened_at: hoursAgo(6), closed_at: null,
    cancelled_by: MOCK_USER_ID, cancellation_reason: "Hủy đơn",
  },
  {
    id: "ord_8", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID,
    order_number: "ORD-008", table_id: "tbl_1", customer_id: null,
    sales_channel_id: "ch_1", order_type: "dine_in",
    status: "paid", subtotal: 200000, discount_amount: 0, tax_amount: 0,
    service_fee_amount: 0, total_amount: 200000, paid_amount: 200000,
    debt_amount: 0, opened_by: MOCK_USER_ID, closed_by: MOCK_USER_ID,
    opened_at: daysAgo(1), closed_at: daysAgo(1),
    cancelled_by: null, cancellation_reason: null,
  },
];

export const MOCK_ORDER_ITEMS: OrderItem[] = [
  { id: "oi_1", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_1", product_id: "prod_4", product_name_snapshot: "Cà phê sữa đá", unit_price_snapshot: 20000, cost_price_snapshot: 4000, quantity: 2, note: null, kitchen_status: "served", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(3) },
  { id: "oi_2", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_1", product_id: "prod_11", product_name_snapshot: "Bánh mì nướng", unit_price_snapshot: 25000, cost_price_snapshot: 5000, quantity: 1, note: null, kitchen_status: "served", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(3) },
  { id: "oi_3", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_1", product_id: "prod_14", product_name_snapshot: "Nước suối", unit_price_snapshot: 10000, cost_price_snapshot: 3000, quantity: 2, note: null, kitchen_status: "not_required", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(3) },
  { id: "oi_4", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_2", product_id: "prod_2", product_name_snapshot: "Cappuccino", unit_price_snapshot: 35000, cost_price_snapshot: 8000, quantity: 2, note: null, kitchen_status: "served", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(5) },
  { id: "oi_5", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_2", product_id: "prod_6", product_name_snapshot: "Trà đào", unit_price_snapshot: 30000, cost_price_snapshot: 5000, quantity: 1, note: null, kitchen_status: "served", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(5) },
  { id: "oi_6", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_2", product_id: "prod_13", product_name_snapshot: "Tiramisu", unit_price_snapshot: 45000, cost_price_snapshot: 12000, quantity: 1, note: null, kitchen_status: "served", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(5) },
  { id: "oi_7", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_3", product_id: "prod_4", product_name_snapshot: "Cà phê sữa đá", unit_price_snapshot: 20000, cost_price_snapshot: 4000, quantity: 1, note: null, kitchen_status: "not_required", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(4) },
  { id: "oi_8", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_3", product_id: "prod_7", product_name_snapshot: "Trà chanh", unit_price_snapshot: 20000, cost_price_snapshot: 3000, quantity: 1, note: null, kitchen_status: "not_required", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(4) },
  { id: "oi_9", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_4", product_id: "prod_1", product_name_snapshot: "Espresso", unit_price_snapshot: 25000, cost_price_snapshot: 5000, quantity: 1, note: null, kitchen_status: "pending", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(1) },
  { id: "oi_10", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_4", product_id: "prod_12", product_name_snapshot: "Bánh bông lan", unit_price_snapshot: 30000, cost_price_snapshot: 8000, quantity: 1, note: "Ít đường", kitchen_status: "pending", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(1) },
  { id: "oi_11", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_5", product_id: "prod_8", product_name_snapshot: "Trà sữa", unit_price_snapshot: 35000, cost_price_snapshot: 7000, quantity: 2, note: "Trân châu nhiều", kitchen_status: "cooking", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(1) },
  { id: "oi_12", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_5", product_id: "prod_10", product_name_snapshot: "Sinh tố xoài", unit_price_snapshot: 35000, cost_price_snapshot: 8000, quantity: 1, note: null, kitchen_status: "pending", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(1) },
  { id: "oi_13", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_6", product_id: "prod_9", product_name_snapshot: "Sinh tố bơ", unit_price_snapshot: 40000, cost_price_snapshot: 10000, quantity: 3, note: null, kitchen_status: "served", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(8) },
  { id: "oi_14", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_6", product_id: "prod_2", product_name_snapshot: "Cappuccino", unit_price_snapshot: 35000, cost_price_snapshot: 8000, quantity: 2, note: null, kitchen_status: "served", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(8) },
  { id: "oi_15", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_6", product_id: "prod_13", product_name_snapshot: "Tiramisu", unit_price_snapshot: 45000, cost_price_snapshot: 12000, quantity: 2, note: null, kitchen_status: "served", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(8) },
  { id: "oi_16", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_6", product_id: "prod_14", product_name_snapshot: "Nước suối", unit_price_snapshot: 10000, cost_price_snapshot: 3000, quantity: 4, note: null, kitchen_status: "not_required", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: hoursAgo(8) },
  { id: "oi_17", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_7", product_id: "prod_6", product_name_snapshot: "Trà đào", unit_price_snapshot: 30000, cost_price_snapshot: 5000, quantity: 1, note: null, kitchen_status: "cancelled", cancellation_stage: null, cancelled_by: MOCK_USER_ID, cancelled_at: hoursAgo(6), created_at: hoursAgo(7) },
  { id: "oi_18", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_7", product_id: "prod_11", product_name_snapshot: "Bánh mì nướng", unit_price_snapshot: 25000, cost_price_snapshot: 5000, quantity: 1, note: null, kitchen_status: "cancelled", cancellation_stage: null, cancelled_by: MOCK_USER_ID, cancelled_at: hoursAgo(6), created_at: hoursAgo(7) },
  { id: "oi_19", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_8", product_id: "prod_2", product_name_snapshot: "Cappuccino", unit_price_snapshot: 35000, cost_price_snapshot: 8000, quantity: 2, note: null, kitchen_status: "served", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: daysAgo(1) },
  { id: "oi_20", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_8", product_id: "prod_9", product_name_snapshot: "Sinh tố bơ", unit_price_snapshot: 40000, cost_price_snapshot: 10000, quantity: 1, note: null, kitchen_status: "served", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: daysAgo(1) },
  { id: "oi_21", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_8", product_id: "prod_15", product_name_snapshot: "Coca Cola", unit_price_snapshot: 15000, cost_price_snapshot: 5000, quantity: 2, note: null, kitchen_status: "not_required", cancellation_stage: null, cancelled_by: null, cancelled_at: null, created_at: daysAgo(1) },
];

export const MOCK_PAYMENTS: Payment[] = [
  { id: "pay_1", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_1", method: "cash", amount: 85000, paid_at: hoursAgo(2), received_by: MOCK_USER_ID, transaction_ref: null },
  { id: "pay_2", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_2", method: "bank_transfer", amount: 150000, paid_at: hoursAgo(3), received_by: MOCK_USER_ID, transaction_ref: "CK001" },
  { id: "pay_3", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_3", method: "cash", amount: 45000, paid_at: hoursAgo(3), received_by: MOCK_USER_ID, transaction_ref: null },
  { id: "pay_4", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_6", method: "cash", amount: 200000, paid_at: hoursAgo(6), received_by: MOCK_USER_ID, transaction_ref: null },
  { id: "pay_5", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_6", method: "bank_transfer", amount: 100000, paid_at: hoursAgo(6), received_by: MOCK_USER_ID, transaction_ref: "CK002" },
  { id: "pay_6", organization_id: MOCK_ORG_ID, branch_id: MOCK_BRANCH_ID, order_id: "ord_8", method: "ewallet", amount: 200000, paid_at: daysAgo(1), received_by: MOCK_USER_ID, transaction_ref: "MOMO001" },
];

export const MOCK_DATA: Record<string, any[]> = {
  organizations: MOCK_ORGANIZATIONS,
  branches: MOCK_BRANCHES,
  profiles: MOCK_PROFILES,
  memberships: MOCK_MEMBERSHIPS,
  menu_categories: MOCK_CATEGORIES,
  products: MOCK_PRODUCTS,
  product_branch_settings: MOCK_PRODUCT_BRANCH_SETTINGS,
  sales_channels: MOCK_SALES_CHANNELS,
  areas: MOCK_AREAS,
  rooms: MOCK_ROOMS,
  dining_tables: MOCK_TABLES,
  inventory_items: MOCK_INVENTORY_ITEMS,
  inventory_balances: MOCK_INVENTORY_BALANCES,
  inventory_movements: MOCK_INVENTORY_MOVEMENTS,
  recipes: MOCK_RECIPES,
  recipe_items: MOCK_RECIPE_ITEMS,
  orders: MOCK_ORDERS,
  order_items: MOCK_ORDER_ITEMS,
  payments: MOCK_PAYMENTS,
  end_of_day_reports: [],
  customers: [],
  audit_logs: [],
  menu_tags: [],
  product_tags: [],
  organization_settings: [],
  ai_chat_sessions: [],
  ai_chat_messages: [],
  ai_message_feedback: [],
  ai_runs: [],
  ai_documents: [],
  ai_document_chunks: [],
  ai_dashboard_templates: [],
};
