const TZ = "Asia/Ho_Chi_Minh";

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(d));
}

export function timeAgo(d: Date | string | null | undefined, now = Date.now()) {
  if (!d) return "—";
  const s = Math.round((now - new Date(d).getTime()) / 1000);
  if (s < 0) return "vừa xong";
  if (s < 60) return `${s} giây trước`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} giờ trước`;
  const days = Math.round(h / 24);
  if (days < 60) return `${days} ngày trước`;
  return formatDateTime(d);
}

export function compact(n: number) {
  return new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export const ENV_LABEL: Record<string, string> = { that: "Thật", thu: "Thử", dev: "Dev" };
export const envLabel = (e: string) => ENV_LABEL[e] ?? e;

export const STATUS_LABEL = { unresolved: "Chưa xử lý", resolved: "Đã xử lý", ignored: "Bỏ qua" } as const;
export const LEVEL_LABEL = { fatal: "Nghiêm trọng", error: "Lỗi", warning: "Cảnh báo", info: "Thông tin" } as const;
export const KIND_LABEL = { error: "Lỗi", event: "Sự kiện", notification: "Thông báo" } as const;
