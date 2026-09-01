export interface TutorialStep {
  target?: string;
  route?: string;
  title: string;
  description: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Chào mừng bạn đến với CounterOps!",
    description:
      "Chúng tôi sẽ hướng dẫn bạn qua các trang chính trong vài bước ngắn. Bạn có thể bỏ qua bất cứ lúc nào.",
  },
  {
    target: "tutorial-sidebar",
    title: "Thanh điều hướng",
    description:
      "Đây là thanh điều hướng chính. Dùng nó để di chuyển giữa các trang: Tổng quan, Bán hàng, Kho hàng, Báo cáo và hơn thế nữa.",
  },
  {
    target: "tutorial-dashboard-kpis",
    title: "Chỉ số kinh doanh",
    description:
      "Các thẻ này hiển thị doanh thu, số đơn hàng và lợi nhuận theo thời gian thực để bạn nắm được tình hình hoạt động.",
  },
  {
    target: "tutorial-branch-selector",
    title: "Chọn chi nhánh",
    description:
      "Dùng bộ chọn này để chuyển đổi giữa các chi nhánh nếu cửa hàng của bạn có nhiều chi nhánh.",
  },
  {
    route: "/pos",
    target: "tutorial-pos-workspace",
    title: "Bán hàng (POS)",
    description:
      "Trang này dùng để tạo đơn hàng, chọn món và thanh toán trực tiếp tại quầy hoặc theo bàn.",
  },
  {
    route: "/menu",
    target: "tutorial-content-header",
    title: "Quản lý thực đơn",
    description:
      "Quản lý món ăn, đồ uống, giá cả và tình trạng còn hàng của từng món tại đây.",
  },
  {
    route: "/inventory",
    target: "tutorial-content-header",
    title: "Quản lý kho hàng",
    description:
      "Theo dõi tồn kho, nhập/xuất nguyên liệu và nhận cảnh báo khi sắp hết hàng.",
  },
  {
    route: "/reports",
    target: "tutorial-content-header",
    title: "Báo cáo & phân tích",
    description:
      "Tạo báo cáo cuối ngày, xem tài liệu thuế và phân tích hiệu quả kinh doanh tại đây.",
  },
  {
    title: "Bạn đã sẵn sàng! 🎉",
    description:
      "Bạn đã nắm được các trang chính. Hãy bắt đầu tạo đơn hàng đầu tiên. Chúc buổi kinh doanh suôn sẻ!",
  },
];
