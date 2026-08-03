export const ACCESS_ERROR_CODES = ["missing_branch", "forbidden"] as const;

export type AccessErrorCode = (typeof ACCESS_ERROR_CODES)[number];

const ACCESS_ERROR_MESSAGES: Record<AccessErrorCode, { title: string; description: string }> = {
  missing_branch: {
    title: "Chưa có chi nhánh hoạt động",
    description:
      "Cửa hàng của bạn chưa có chi nhánh hoạt động. Vui lòng liên hệ quản trị viên hoặc thiết lập chi nhánh trước khi tiếp tục.",
  },
  forbidden: {
    title: "Không có quyền truy cập",
    description: "Bạn không có quyền truy cập chức năng này. Vui lòng liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn.",
  },
};

export function resolveAccessError(code: string | undefined) {
  if (code && code in ACCESS_ERROR_MESSAGES) {
    return { code: code as AccessErrorCode, ...ACCESS_ERROR_MESSAGES[code as AccessErrorCode] };
  }
  return {
    code: "unknown" as const,
    title: "Đã xảy ra lỗi",
    description: "Không thể hoàn tất yêu cầu. Vui lòng thử lại hoặc quay về trang chủ.",
  };
}
