/** Tiny dependency-free SVG charts. */

export function Sparkline({ data, className = "h-6 w-24" }: { data: number[]; className?: string }) {
  const max = Math.max(1, ...data);
  const w = 100;
  const h = 24;
  const bw = w / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      {data.map((v, i) => {
        const bh = v === 0 ? 0 : Math.max(1.5, (v / max) * h);
        return <rect key={i} x={i * bw + 0.3} y={h - bh} width={Math.max(0.5, bw - 0.6)} height={bh} className="fill-violet-400" />;
      })}
    </svg>
  );
}

/** Bar chart with hour labels; `data` is hourly counts, oldest first, ending at the current hour. */
export function HourlyBars({ data, height = 120 }: { data: number[]; height?: number }) {
  const max = Math.max(1, ...data);
  const total = data.reduce((a, b) => a + b, 0);
  const now = new Date();
  const labelEvery = Math.ceil(data.length / 8);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-500">
        <span>Tổng: {total.toLocaleString("vi-VN")}</span>
        <span>Cao nhất / giờ: {Math.max(0, ...data).toLocaleString("vi-VN")}</span>
      </div>
      <div className="flex items-end gap-px" style={{ height }}>
        {data.map((v, i) => {
          const hoursAgo = data.length - 1 - i;
          const t = new Date(now.getTime() - hoursAgo * 3_600_000);
          const label = t.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit" });
          return (
            <div key={i} className="group relative flex h-full flex-1 items-end" title={`${label}h: ${v}`}>
              <div
                className="w-full rounded-t-sm bg-violet-500/80 group-hover:bg-violet-700"
                style={{ height: v === 0 ? 1 : `${Math.max(3, (v / max) * 100)}%`, opacity: v === 0 ? 0.25 : 1 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        {data.map((_, i) =>
          i % labelEvery === 0 ? (
            <span key={i}>
              {new Date(now.getTime() - (data.length - 1 - i) * 3_600_000).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
                hour: "2-digit",
                day: data.length > 48 ? "2-digit" : undefined,
                month: data.length > 48 ? "2-digit" : undefined,
              })}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
