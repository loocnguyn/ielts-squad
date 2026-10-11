# IELTS Squad

Web app ôn IELTS Academic theo nhóm (2–10 người): mỗi ngày cả nhóm nhận chung một bộ đề 4 kỹ năng,
ai làm giờ nào cũng được, miễn xong trước giờ chốt. Đề do Claude Pro soạn, Writing và Speaking chấm
bằng Claude Pro qua copy–dán, giọng đọc và nhận giọng nói chạy ngay trong trình duyệt.

Stack: Next.js 16 (App Router, Cache Components) · Supabase (Auth, Postgres + RLS, Storage, Realtime,
pg_cron) · Tailwind 4 + shadcn/ui · Kokoro (TTS) và Whisper (STT) qua Transformers.js.

## Chạy trên máy

```bash
npm install
cp .env.example .env.local   # điền URL và publishable key của project Supabase
npm run dev
```

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Dev server ở http://localhost:3000 |
| `npm run build` | Build production |
| `npm test` | Unit test (kiểm tra JSON đề, JSON chấm điểm, prompt, làm tròn band) |
| `npm run typecheck` | Sinh route types rồi chạy `tsc` |
| `npm run lint` | ESLint |

Đừng chạy `npm run build` trong lúc `npm run dev` đang mở: hai lệnh dùng chung thư mục `.next`, dev
server sẽ phục vụ CSS cũ cho đến khi khởi động lại.

## Chạy với Supabase cục bộ (Docker)

Để thử mọi thứ mà không đụng tới project thật:

```bash
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit
```

Lệnh này dựng Postgres, Auth, API, Storage và Realtime trên máy rồi áp dụng `supabase/migrations`.
Để app dùng nó, copy `.env.development.local.example` thành `.env.development.local` (file này chỉ ghi
đè `.env.local` khi chạy `npm run dev`). Ở chế độ cục bộ, đăng ký bằng email không cần xác nhận thư.
Xóa `.env.development.local` để quay lại project thật; `npx supabase stop` để tắt.

`node e2e/realtime-check.mjs <groupId>` kiểm tra kênh realtime riêng tư của một nhóm bằng hai tài
khoản thử trong `e2e/local-test-users.json` (file này không được commit; tự tạo với dạng
`{ "a": { "email", "password", "name" }, "b": { ... } }` rồi đăng ký hai tài khoản đó qua app).

## Cấu hình Supabase

Schema nằm trong `supabase/migrations`. Áp dụng theo thứ tự tên file (qua Supabase CLI
`supabase db push`, hoặc dán vào SQL editor).

Trong dashboard, phần Authentication:

1. **URL Configuration**: đặt Site URL là domain của app, và thêm `https://<domain>/auth/callback`
   (cùng `http://localhost:3000/auth/callback` khi dev) vào Redirect URLs.
2. **Providers**: bật Google, GitHub, Discord và điền client ID / secret lấy từ từng nhà cung cấp.
   Email + mật khẩu và magic link đã bật sẵn.
3. **Allow manual linking**: bật để trang Hồ sơ liên kết được nhiều kiểu đăng nhập vào một tài khoản.
4. Email mặc định của Supabase giới hạn vài thư mỗi giờ. Khi có nhiều người dùng, cấu hình SMTP riêng.

## Deploy

App chạy trên Vercel tại https://ielts-squad.vercel.app (project `ielts-squad`). Hai biến
`NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` đã đặt cho Production và Preview.
Deploy lại bằng `npx vercel deploy --prod`. Sau lần deploy đầu, nhớ làm bước 1 ở phần Cấu hình Supabase
với domain này, nếu không link trong email xác nhận sẽ dẫn về `localhost`.

## Cách app hoạt động

- **Không cần secret key.** Mọi thao tác có đặc quyền (phát đề, chấm điểm, streak, lưu đề) là hàm
  Postgres `SECURITY DEFINER` tự kiểm tra người gọi. App chỉ dùng publishable key.
- **Đáp án không bao giờ xuống trình duyệt trước khi nộp.** Đáp án và transcript Listening nằm ở bảng
  `test_secrets` (RLS bật, không có policy). Hàm `submit_attempt` so đáp án trong database;
  `get_attempt_review` chỉ trả đáp án cho bài đã nộp mà người gọi được xem.
- **Đồng hồ ở server.** `start_attempt` ghi `started_at`; hạn nộp = `started_at` + thời lượng đề, không
  vượt quá giờ chốt ngày. Nộp trễ thì bài được tính theo bản lưu tự động gần nhất, đóng dấu tại hạn nộp.
- **Phát đề ngày.** `pg_cron` chạy `private.deal_all_groups()` lúc 00:00 giờ Việt Nam (17:00 UTC). Khi
  một thành viên mở bảng ngày, `ensure_daily_set` cũng tự phát đề nếu chưa có, nên nhóm mới tạo có đề
  ngay. Writing: ngày lẻ Task 1, ngày chẵn Task 2. Speaking: xoay vòng Part 1, 2, 3.
- **Ai thấy gì.** Tiến độ (ai đang làm, ai đã nộp) cả nhóm luôn thấy. Bài làm và điểm của người khác
  chỉ mở khi bạn đã nộp cùng kỹ năng đó, hoặc sau giờ chốt.
- **Realtime.** Kênh broadcast riêng tư `group:{id}`; bảng ngày cũng tự làm mới mỗi phút.

## Ngân hàng đề

Trang **Ngân hàng đề** tạo prompt theo kỹ năng, bạn dán vào claude.ai rồi dán JSON trả về. App kiểm tra
(`src/lib/tests/import-schema.ts`): đủ số câu, đánh số liên tục, có đáp án, đáp án True/False/Not Given
và trắc nghiệm hợp lệ, đáp án điền từ xuất hiện nguyên văn trong bài, số liệu biểu đồ khớp. Chính tả
Anh–Mỹ được mở rộng sẵn vào đáp án.

Đề Listening cần audio trước khi được phát: mở đề trong Ngân hàng đề, bấm **Tạo audio**. Kokoro đọc
lời thoại nhiều giọng ngay trên máy, nén MP3 rồi lưu lên Storage. Chỉ làm một lần cho mỗi đề.

`src/content/starter-tests.json` là bộ 7 đề mẫu (nút **Dùng bộ đề mẫu**), cũng là dữ liệu cho unit test.

## Khác với bản thiết kế ban đầu

- Phát đề bằng `pg_cron` trong Supabase thay cho Vercel Cron (gói Hobby của Vercel không bảo đảm đúng
  giờ), và chấm trắc nghiệm bằng hàm Postgres thay cho API route. Nhờ vậy không cần secret key.
- Thêm bảng `test_secrets` tách đáp án khỏi `tests`, và cột `daily_sets.closes_at`.
- Dạng map/plan labelling của Listening mô tả sơ đồ bằng chữ (chưa có hình).
- Full test Chủ nhật mới có công tắc trong cài đặt nhóm, chưa có bộ đề.
