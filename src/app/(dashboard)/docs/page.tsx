import { Card, Code, PageHeader } from "@/components/ui";
import { appUrl, CONTRACT_FIELDS, curlSnippet, mcpConfigSnippet, NEVER_SEND, nodeSnippet, workerSnippet } from "@/lib/integration";

export const metadata = { title: "Tích hợp · Site Monitoring" };

const REST = [
  ["GET", "/api/v1/projects", "read", "Danh sách project + số lỗi chưa xử lý, số lỗi 24h"],
  ["POST", "/api/v1/projects", "admin", "Tạo project {name} → trả khoá + secret cho that/thu/dev"],
  ["GET", "/api/v1/projects/:slug", "read", "Chi tiết project, cài đặt cảnh báo, key id"],
  ["GET", "/api/v1/projects/:slug/issues", "read", "?status&env&release&period&q&sort&limit&offset"],
  ["GET", "/api/v1/projects/:slug/events", "read", "?kind=error|event|notification&env&before&limit"],
  ["GET", "/api/v1/projects/:slug/releases", "read", "Phiên bản theo môi trường"],
  ["GET", "/api/v1/issues/:id", "read", "Chi tiết nhóm lỗi, chuỗi theo giờ, event mới nhất, bình luận"],
  ["PATCH", "/api/v1/issues/:id", "write", '{"action": "resolve" | "resolve_next_release" | "ignore" | "unresolve"}'],
  ["GET", "/api/v1/issues/:id/events", "read", "Các event đã lưu của nhóm lỗi"],
  ["POST", "/api/v1/issues/:id/comments", "write", '{"body": "phân tích…"}'],
  ["GET", "/api/v1/notifications", "read", "?unread=1"],
  ["POST", "/api/v1/notifications/read", "write", '{"ids": [...]} hoặc {"all": true}'],
];

export default function DocsPage() {
  const base = appUrl();
  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader title="Tích hợp" subtitle="Gửi lỗi từ ứng dụng (push) và cho AI agent đọc / xử lý lỗi." />

      <Card title="1. Gửi lỗi: POST /api/ingest">
        <div className="space-y-3 text-sm text-zinc-700">
          <p>
            Endpoint: <code className="font-mono">{base}/api/ingest</code>. Header: <code>X-GS-Key</code> (key id),{" "}
            <code>X-GS-Timestamp</code> (giây unix, lệch tối đa ±300s), <code>X-GS-Signature</code> ={" "}
            <code>hex(HMAC-SHA256(secret, timestamp + &quot;.&quot; + body))</code>.
          </p>
          <p>
            Body: một sự kiện, một mảng, hoặc <code>{`{"su_kien": [...]}`}</code> (tối đa 100). Trả về <b>202</b> kèm trạng thái từng sự kiện:
            <code> accepted</code> / <code>duplicate</code> (trùng <code>ma_su_kien</code>, không đếm lại) / <code>rejected</code>.
          </p>
          <p>Mỗi môi trường một khoá: khoá quyết định môi trường; <code>moi_truong</code> khác môi trường của khoá sẽ bị từ chối.</p>
        </div>
        <div className="-mx-4 mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Trường (danh sách cho phép)</th>
                <th className="px-4 py-2 font-medium">Bắt buộc</th>
                <th className="px-4 py-2 font-medium">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {CONTRACT_FIELDS.map((f) => (
                <tr key={f.field}>
                  <td className="px-4 py-1.5 font-mono">{f.field}</td>
                  <td className="px-4 py-1.5">{f.required ? "✓" : ""}</td>
                  <td className="px-4 py-1.5 text-zinc-600">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-zinc-700">
          <b>Trường lạ → HTTP 400.</b> Không bao giờ gửi: {NEVER_SEND} Máy chủ lọc thêm email, SĐT, chuỗi giống token → <code>[an]</code>, bỏ query string, stack chỉ giữ tệp:dòng:cột.
        </p>
      </Card>

      <Card title="Cloudflare Worker (waitUntil, timeout, cầu dao, ngân sách)">
        <Code>{workerSnippet()}</Code>
      </Card>
      <Card title="Node.js">
        <Code>{nodeSnippet()}</Code>
      </Card>
      <Card title="curl (thử nhanh)">
        <Code>{curlSnippet()}</Code>
      </Card>

      <Card title="2. AI agent: MCP">
        <p className="mb-2 text-sm text-zinc-700">
          Tạo token ở <a className="text-violet-700 hover:underline" href="/settings/tokens">API tokens</a>, rồi thêm server MCP{" "}
          <code>{base}/api/mcp</code> (Streamable HTTP). Công cụ: list_projects, create_project, get_integration_guide, list_issues, get_issue,
          list_issue_events, update_issue_status, add_issue_comment, list_events, list_releases, list_notifications, mark_notifications_read.
        </p>
        <Code>{mcpConfigSnippet()}</Code>
      </Card>

      <Card title="3. AI agent: REST API (Authorization: Bearer smt_…)">
        <div className="-m-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Method</th>
                <th className="px-4 py-2 font-medium">Đường dẫn</th>
                <th className="px-4 py-2 font-medium">Quyền</th>
                <th className="px-4 py-2 font-medium">Mô tả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {REST.map(([m, p, s, d]) => (
                <tr key={m + p}>
                  <td className="px-4 py-1.5 font-mono text-xs">{m}</td>
                  <td className="px-4 py-1.5 font-mono text-xs">{p}</td>
                  <td className="px-4 py-1.5">{s}</td>
                  <td className="px-4 py-1.5 text-zinc-600">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
