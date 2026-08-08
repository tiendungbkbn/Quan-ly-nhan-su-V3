# Quản Lý Nhân Sự Nước Ngoài (HRM Portal)

Hệ thống quản lý nhân sự dành cho HR quản lý nhân viên ngoại quốc (chủ yếu người Trung Quốc) làm việc tại Việt Nam. Toàn bộ giao diện bằng tiếng Việt.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — chạy API server (port 8080)
- `pnpm --filter @workspace/hrm run dev` — chạy frontend (port 22871)
- `pnpm run typecheck` — kiểm tra TypeScript toàn bộ workspace
- `pnpm run build` — build tất cả packages
- `pnpm --filter @workspace/api-spec run codegen` — tạo lại API hooks và Zod schemas từ OpenAPI spec
- `pnpm --filter @workspace/db run push` — đẩy thay đổi schema DB (chỉ dev)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (artifacts/api-server)
- Frontend: React + Vite + Tailwind CSS + shadcn/ui (artifacts/hrm)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec at lib/api-spec/openapi.yaml)
- DOCX generation: docxtemplater + pizzip
- OCR: tesseract.js (lazy import — fallback to regex extraction if unavailable)
- ZIP: archiver

## Where things live

- `lib/api-spec/openapi.yaml` — nguồn sự thật cho API contract
- `lib/db/src/schema/` — Drizzle schema (employees, documents, templates)
- `artifacts/api-server/src/routes/` — route handlers (employees, documents, dashboard, templates, ocr)
- `artifacts/hrm/src/` — React frontend
- `uploads/templates/` — file .docx template được upload (tạo tự động)
- `uploads/ocr/` — file ảnh OCR tạm thời (tự xóa sau khi xử lý)

## Architecture decisions

- Tất cả API endpoint dùng Zod schemas từ codegen (không hand-write)
- Document history tự động ghi log khi tạo/cập nhật document
- DOCX template dùng Jinja2-style tags: {{T1}}...{{T13}} ánh xạ đến các field nhân viên
- OCR fallback: nếu tesseract.js không có, dùng regex để trích xuất từ MRZ line
- File upload lưu disk (multer diskStorage), không dùng object storage cho bản đầu

## Product

- **Dashboard**: Thống kê tổng quan, cảnh báo hết hạn giấy tờ (30/60/90 ngày), biểu đồ
- **Quản lý nhân viên**: CRUD đầy đủ, search/filter, checkbox để chọn hàng loạt
- **Chi tiết nhân viên**: Tab thông tin, tab giấy tờ (CRUD), tab lịch sử thay đổi
- **Hồ sơ mẫu**: Upload/quản lý template .docx, tạo hồ sơ hàng loạt (download ZIP)

## Field mapping (T1-T13)

| Tag | Field | Description |
|-----|-------|-------------|
| T1 | fullName | Họ tên |
| T2 | dob | Ngày sinh |
| T3 | gender | Giới tính |
| T4 | cccd | Số CCCD |
| T5 | passportNo | Số hộ chiếu |
| T6 | passportIssueDate | Ngày cấp hộ chiếu |
| T7 | passportExpiry | Ngày hết hạn hộ chiếu |
| T8 | employeeCode | Mã số NV |
| T9 | company | Tên công ty |
| T10 | position | Chức vụ |
| T11 | phone | SĐT |
| T12 | email | Email |
| T13 | tempAddress | Địa chỉ tạm trú |
| CUA_KHAU | cuaKhau | Cửa khẩu nhập cảnh (có thể ghi đè khi tạo hồ sơ hàng loạt) |

## User preferences

- Giao diện 100% tiếng Việt
- Không dùng emoji trong UI

## Gotchas

- Sau khi thay đổi OpenAPI spec, luôn chạy codegen trước khi sửa route handler
- `lib/api-zod` cần `"lib": ["esnext", "dom"]` trong tsconfig vì Orval generate `File`/`Blob` types
- archiver package dùng `require()` (không phải ES import) để tránh lỗi type
- `req.params.id` trong Express 5 là `string | string[]` — luôn parse bằng Zod
