# IELTS Squad

Ứng dụng web ôn IELTS Academic theo nhóm 2–10 người. Mỗi ngày cả nhóm nhận chung một bộ đề Listening,
Reading và Writing, làm lúc nào cũng được trước giờ chốt. Speaking là bài thi thử đầy đủ làm theo cặp
qua video ngay trong app, có bấm giờ như phòng thi và transcript để chấm.

**Production:** https://ielts-squad.vercel.app

| | |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components), React 19, TypeScript |
| Dữ liệu | Supabase: Auth, Postgres + RLS, Storage, Realtime, pg_cron |
| Giao diện | Tailwind CSS 4, shadcn/ui |
| Giọng nói | Kokoro (đọc đề Listening) và Whisper (chuyển giọng nói thành chữ) chạy trong trình duyệt qua Transformers.js |
| Gọi video | WebRTC, tín hiệu qua Supabase Realtime, máy chủ chuyển tiếp Cloudflare Realtime TURN |
| Hosting | Vercel (project `ielts-squad`) |

## Mục lục

- [Tính năng](#tính-năng)
- [Bắt đầu](#bắt-đầu)
- [Biến môi trường](#biến-môi-trường)
- [Lệnh](#lệnh)
- [Cấu trúc mã nguồn](#cấu-trúc-mã-nguồn)
- [Kiến trúc và bảo mật](#kiến-trúc-và-bảo-mật)
- [Ngân hàng đề](#ngân-hàng-đề)
- [Phòng nói](#phòng-nói)
- [Gọi video](#gọi-video)
- [Deploy lên production](#deploy-lên-production)
- [Kiểm thử](#kiểm-thử)
- [Xử lý sự cố](#xử-lý-sự-cố)
- [Ghi chú thiết kế](#ghi-chú-thiết-kế)

## Tính năng

- **Bộ đề hằng ngày.** 00:00 giờ Việt Nam cả nhóm nhận một bộ Listening, Reading, Writing; Writing
  xen kẽ Task 1 và Task 2. Có giờ chốt, đồng hồ làm bài tính ở server, streak cho người làm đủ.
- **Chấm tự động và chấm bằng Claude.** Listening và Reading chấm ngay trong database. Writing và
  Speaking tạo sẵn gói prompt để dán vào Claude, rồi dán kết quả JSON về; bạn bè chấm chéo thêm.
- **Ngân hàng 302 đề soạn sẵn**, đủ cho 60 ngày Listening, Reading, Writing và 120 lượt Speaking.
  Trưởng nhóm có thể nhập thêm đề do Claude soạn theo định dạng được kiểm tra chặt.
- **Phòng nói theo cặp.** Vào phòng là bật camera và micro. Một người làm giám khảo, đọc câu hỏi và
  bấm giờ cho từng câu; Part 2 có 1 phút chuẩn bị và 2 phút nói; đồng hồ tổng canh bài thi 11–14 phút.
- **Transcript và video.** Máy thí sinh tự ghi âm, cắt theo từng câu, chuyển thành chữ kèm thời gian
  trả lời. Có thể ghi lại cả buổi thành video gồm các camera, câu hỏi và đồng hồ.

## Bắt đầu

Cần Node.js 22, npm và một project Supabase (hoặc Docker để chạy Supabase trên máy).

```bash
git clone https://github.com/loocnguyn/ielts-squad.git
cd ielts-squad
npm install
cp .env.example .env.local   # điền URL và publishable key của project Supabase
npm run dev                  # http://localhost:3000
```

Áp dụng schema trong `supabase/migrations` theo thứ tự tên file (`npx supabase db push`, hoặc dán vào
SQL editor), rồi cấu hình Auth như ở [Deploy lên production](#deploy-lên-production).

### Chạy với Supabase cục bộ

Để thử mọi thứ mà không đụng tới dữ liệu thật:

```bash
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit
cp .env.development.local.example .env.development.local
npm run dev
```

`supabase start` dựng Postgres, Auth, API, Storage và Realtime trên Docker rồi áp dụng các migration.
`.env.development.local` chỉ ghi đè `.env.local` khi chạy `npm run dev`; xóa file này để quay lại
project thật, `npx supabase stop` để tắt. Ở chế độ cục bộ, đăng ký không cần xác nhận email.

## Biến môi trường

| Biến | Bắt buộc | Dùng cho |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Có | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Có | Publishable key. App không dùng secret key ở đâu cả. |
| `CLOUDFLARE_TURN_KEY_ID` | Cho gọi video | Turn Token ID của Cloudflare Realtime TURN |
| `CLOUDFLARE_TURN_API_TOKEN` | Cho gọi video | API token đi kèm. Chỉ nằm ở server. |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Không | Dùng dịch vụ TURN khác thay cho Cloudflare. `TURN_URLS` cách nhau bằng dấu phẩy. |

Thiếu hai biến TURN thì app vẫn chạy, nhưng phòng nói chỉ gọi được video khi hai máy nối thẳng được
với nhau (xem [Gọi video](#gọi-video)).

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Dev server ở http://localhost:3000 |
| `npm run build` / `npm start` | Build và chạy bản production |
| `npm test` | Unit test (Vitest) |
| `npm run typecheck` | Sinh route types rồi chạy `tsc` |
| `npm run lint` | ESLint |
| `npm run bank:check` | Kiểm tra toàn bộ ngân hàng đề soạn sẵn |
| `npm run bank:build` | Xuất ngân hàng đề ra `src/content/bank/*.json` |
| `npm run turn:setup` | Cài máy chủ chuyển tiếp cho gọi video lên Vercel rồi deploy lại |

Đừng chạy `npm run build` trong lúc `npm run dev` đang mở: hai lệnh dùng chung thư mục `.next`.

## Cấu trúc mã nguồn

```
src/
  app/                  Routes (App Router)
    (app)/              Các trang sau đăng nhập: nhóm, bảng ngày, ngân hàng đề, hồ sơ
    attempt/            Màn hình làm bài
    room/[groupId]/     Phòng nói
    actions/            Server actions
  components/
    room/               Phòng nói: gọi video, ghi hình, bảng giám khảo
    attempt/, tests/    Giao diện làm bài và hiển thị đề
  lib/
    speaking-room/      Kịch bản bài thi Speaking, bấm giờ, transcript, cấu hình TURN
    tests/              Schema nhập đề, prompt chấm điểm
    audio/              Ghi âm, Whisper, Kokoro
    supabase/           Client cho trình duyệt, server và proxy
content/bank/           Nguồn của 302 đề soạn sẵn
scripts/                Công cụ ngân hàng đề, cài TURN
supabase/migrations/    Schema, RLS, hàm Postgres, lịch pg_cron
e2e/                    Script thử realtime với tài khoản thử cục bộ
```

## Kiến trúc và bảo mật

- **Không có secret key.** Mọi thao tác có đặc quyền (phát đề, chấm điểm, streak, lưu đề, lượt thi nói)
  là hàm Postgres `SECURITY DEFINER` tự kiểm tra người gọi. App chỉ dùng publishable key.
- **Đáp án không xuống trình duyệt trước khi nộp.** Đáp án và transcript Listening nằm ở bảng
  `test_secrets` (RLS bật, không có policy). `submit_attempt` so đáp án trong database;
  `get_attempt_review` chỉ trả đáp án cho bài đã nộp mà người gọi được xem.
- **Đồng hồ ở server.** `start_attempt` ghi `started_at`; hạn nộp là `started_at` cộng thời lượng đề,
  không quá giờ chốt ngày. Nộp trễ thì bài được tính theo bản lưu tự động gần nhất.
- **Phát đề.** `pg_cron` chạy `private.deal_all_groups()` lúc 00:00 giờ Việt Nam (17:00 UTC).
  `ensure_daily_set` cũng phát đề khi một thành viên mở bảng ngày, nên nhóm mới có đề ngay.
- **Ai thấy gì.** Tiến độ cả nhóm luôn thấy. Bài làm và điểm của người khác chỉ mở khi bạn đã nộp cùng
  kỹ năng, hoặc sau giờ chốt.
- **Realtime.** Kênh broadcast riêng tư `group:{id}` cho bảng ngày và `group:{id}:room` cho phòng nói,
  chỉ thành viên nhóm đọc và gửi được (policy trên `realtime.messages`).

## Ngân hàng đề

Trang **Ngân hàng đề** tạo prompt theo kỹ năng; dán vào claude.ai rồi dán JSON trả về. App kiểm tra
(`src/lib/tests/import-schema.ts`): đủ số câu, đánh số liên tục, có đáp án, đáp án True/False/Not Given
và trắc nghiệm hợp lệ, đáp án điền từ xuất hiện nguyên văn trong bài, số liệu biểu đồ khớp.

Đề Listening cần audio trước khi được phát: mở đề và bấm **Tạo audio**. Kokoro đọc lời thoại nhiều
giọng ngay trên máy, nén MP3 rồi lưu lên Storage.

### Bộ đề soạn sẵn

`content/bank/` chứa 302 đề: 60 Listening (2 part, 20 câu), 60 Reading (1 passage, 13 câu), 62 Writing
(32 Task 1, 30 Task 2) và 120 Speaking đủ Part 1, 2, 3. Đề được viết mới theo đúng định dạng thi, không
chép đề Cambridge hay IDP đã xuất bản.

1. `npm run bank:check` đưa từng đề qua bộ kiểm tra của app và vài kiểm tra riêng (giới hạn từ của
   đáp án, thứ tự đáp án trong bài nghe, độ dài bài).
2. `npm run bank:build` ghi `src/content/bank/*.json`. Các file này chỉ được đọc ở server vì có đáp án.
3. Trưởng nhóm vào **Ngân hàng đề**, bấm **Nạp đề soạn sẵn**. Nạp lại nhiều lần không sao.
4. Audio Listening được đọc sẵn trên máy: `npx tsx scripts/bank/cli.mts serve-audio`, mở
   `http://localhost:3000/auth/dev-tts` trong `npm run dev` (trang này không có ở production). File MP3
   ra `bank-audio/` (không commit). Sau đó ở **Ngân hàng đề** bấm **Tải audio** và chọn cả thư mục.

## Phòng nói

Speaking là bài thi thử đầy đủ làm theo cặp, ở `/room/{groupId}` (thẻ Speaking trên bảng ngày, hoặc tab
**Buổi nói**). Mỗi người nhận một đề riêng mà nhóm chưa ai gặp; chỉ máy giám khảo nhận nội dung đề.

### Luồng một lượt thi

1. Một người bấm **Hỏi …** để làm giám khảo cho người kia, rồi **Hiện câu hỏi và bắt đầu**.
2. Với mỗi câu hỏi, giám khảo đọc câu hỏi, đọc xong thì bấm **Bấm giờ trả lời** (hoặc phím cách).
   Đồng hồ đếm lên so với độ dài gợi ý: khoảng 25 giây ở Part 1, 20 giây ở câu hỏi kết Part 2, 50 giây
   ở Part 3. Hai bên cùng thấy đồng hồ. Bấm **Câu tiếp** (hoặc phím cách) để sang câu sau.
3. Tới Part 2, giám khảo đọc lời giới thiệu trong lúc thí sinh chưa thấy gì, rồi bấm **Đưa cue card,
   bắt đầu 1 phút**: lúc đó cue card mới hiện ở máy thí sinh và 1 phút chuẩn bị bắt đầu đếm. Hết phút
   chuẩn bị, giám khảo mời nói rồi bấm **Bắt đầu 2 phút**.
4. Bảng giám khảo luôn có hai đồng hồ: thời gian của Part hiện tại so với chuẩn (Part 1 và Part 3 từ 4
   đến 5 phút, Part 2 từ 3 đến 4 phút) và của cả bài so với 11–14 phút. Quá giờ thì đồng hồ chuyển đỏ.
5. Bấm **Kết thúc bài thi** ở câu cuối. Máy thí sinh cắt bản ghi theo từng câu, Whisper chuyển thành
   chữ ngay trên máy, rồi `finish_speaking_turn` lưu thành bài Speaking của ngày.

### Transcript và chấm điểm

Transcript chia theo Part, ghi độ dài cả bài và thời gian trả lời của từng câu đã bấm giờ, ví dụ
`Candidate (0:24): …` và `Candidate (long turn, 1:52): …`. Xem, tải về, copy gói chấm cho Claude và chấm
chéo Pronunciation ở tab **Buổi nói**.

### Ghi hình

**Ghi hình** tạo một video gồm các camera, câu hỏi đang hỏi và đồng hồ, ghép ngay trong trình duyệt
của người bấm. Chrome và Edge cho chọn nơi lưu từ đầu (chọn thư mục Google Drive trên máy là video tự
lên Drive); trình duyệt khác tải file về khi dừng.

Lượt thi trong phòng không tính vào streak, để không ai mất chuỗi vì bạn thi cùng vắng mặt.

## Gọi video

Video nối thẳng giữa các máy (WebRTC); tín hiệu đi qua kênh Realtime riêng tư của nhóm. Nối thẳng chỉ
được khi mạng của cả hai cho phép. VPN (ví dụ Cloudflare WARP), 4G và nhiều mạng nhà hoặc công ty đổi
cổng theo từng đích (NAT đối xứng), nên hai nhà khác mạng thường không thấy và không nghe được nhau.
Khi đó cần một **máy chủ chuyển tiếp (TURN)** để chuyển hình và tiếng giữa hai bên.

### Cài máy chủ chuyển tiếp (một lần)

1. Đăng nhập https://dash.cloudflare.com, mở **Realtime → TURN Server**, tạo một TURN key. Cloudflare
   hiện **Turn Token ID** và **API token**.
2. Trong thư mục project, chạy:

   ```bash
   npm run turn:setup
   ```

   Lệnh này hỏi hai giá trị trên (token được nhập ẩn), thử khóa với Cloudflare, lưu thành biến môi
   trường Production trên Vercel rồi deploy lại. Cách khác: tự thêm `CLOUDFLARE_TURN_KEY_ID` và
   `CLOUDFLARE_TURN_API_TOKEN` trong Vercel → Settings → Environment Variables, rồi deploy lại.

Theo tài liệu Cloudflare, 1.000 GB đầu tiên miễn phí, sau đó 0,05 USD/GB. Một buổi nói 30 phút có video
ước tính dưới 1 GB.

### Cách phòng xử lý kết nối

- Server phát danh sách máy chủ cho người đã đăng nhập (`getIceConfig`); với Cloudflare đó là thông tin
  đăng nhập ngắn hạn, khóa gốc không rời server.
- Cuộc gọi rớt hoặc không lên thì máy tự dò lại đường truyền, một bên dẫn để hai lần thử không triệt
  tiêu nhau. Người rời phòng được nhận biết qua tín hiệu có mặt gửi mỗi 5 giây.
- Khi chưa có máy chủ chuyển tiếp, phòng tự kiểm tra mạng của máy mình và báo nếu mạng đó chặn gọi
  trực tiếp. Không nối được sau 12 giây thì phòng báo "Chưa nối được hình và tiếng".
- Ô video ghi **Qua máy chủ chuyển tiếp** khi cuộc gọi đi đường này. Mở `/room/{id}?relay=1` để ép
  mọi cuộc gọi đi qua máy chủ chuyển tiếp khi cần kiểm tra cấu hình.

## Deploy lên production

App chạy trên Vercel, project `ielts-squad`, domain https://ielts-squad.vercel.app. Thư mục đã được
liên kết với project (`.vercel/project.json`).

```bash
npx vercel deploy --prod
```

Mỗi lần deploy, kiểm tra theo thứ tự:

1. `npm run typecheck && npm run lint && npm test`.
2. Migration mới đã áp dụng lên project Supabase production **trước** khi deploy mã dùng tới nó
   (`npx supabase db push`, hoặc qua Supabase MCP `apply_migration`).
3. `npx vercel deploy --prod`, rồi mở trang chủ, trang đăng nhập và một phòng nói để chắc chắn.

### Cấu hình một lần

- **Vercel → Settings → Environment Variables** (Production): hai biến Supabase, và hai biến TURN
  (xem [Gọi video](#gọi-video)). Biến mới chỉ có hiệu lực từ lần deploy sau.
- **Supabase → Authentication → URL Configuration**: Site URL `https://ielts-squad.vercel.app`; Redirect
  URLs gồm `https://ielts-squad.vercel.app/auth/callback`, `http://localhost:3000/auth/callback` và
  `http://localhost:3000/**`. Đổi domain thì cập nhật lại.
- **Supabase Auth**: đăng nhập bằng email và mật khẩu, có xác nhận email và quên mật khẩu. Email mặc
  định của Supabase chỉ gửi vài thư mỗi giờ; khi đông người dùng, cấu hình SMTP riêng.

Project chưa nối GitHub với Vercel, nên push code không tự deploy. Muốn tự deploy khi push nhánh `mvp`,
chạy `npx vercel git connect`.

## Kiểm thử

- `npm test` chạy unit test cho schema nhập đề, JSON chấm điểm, prompt, làm tròn band, kịch bản và
  bấm giờ Speaking, cấu hình TURN.
- `node e2e/realtime-check.mjs <groupId>` kiểm tra kênh realtime riêng tư của một nhóm bằng hai tài khoản
  thử trong `e2e/local-test-users.json` (không commit; dạng
  `{ "a": { "email", "password", "name" }, "b": { … } }`, đăng ký hai tài khoản đó qua app cục bộ).
- Thử phòng nói với hai người trên một máy: mở một tab ở `http://localhost:3000` và một tab ở
  `http://127.0.0.1:3000` (hai tab giữ hai phiên đăng nhập riêng). Để thử đường chuyển tiếp, chạy một
  TURN cục bộ (`coturn/coturn` trên Docker, cổng 3478), đặt `TURN_*` trong `.env.development.local` và
  mở phòng với `?relay=1`.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| Vào phòng thấy tên nhau nhưng không có hình, tiếng | Chưa có máy chủ chuyển tiếp, mạng chặn gọi trực tiếp | [Cài máy chủ chuyển tiếp](#cài-máy-chủ-chuyển-tiếp-một-lần); tạm thời tắt VPN như Cloudflare WARP |
| Phòng báo "Trình duyệt chưa được phép dùng camera và micro" | Đã chặn quyền ở thanh địa chỉ, hoặc app khác đang giữ camera | Cho phép quyền, đóng app đang dùng camera, tải lại trang |
| Có hình nhưng không nghe tiếng | Trình duyệt chặn tự phát âm thanh | Bấm **Bấm để nghe và xem** trên ô video |
| Đề Listening không được phát | Đề chưa có audio | Ngân hàng đề → **Tải audio** hoặc **Tạo audio** |
| Biến môi trường mới không có tác dụng | Vercel chỉ đọc biến khi build | Deploy lại |

## Ghi chú thiết kế

- Phát đề bằng `pg_cron` trong Supabase thay cho Vercel Cron (gói Hobby không bảo đảm đúng giờ), và chấm
  trắc nghiệm bằng hàm Postgres thay cho API route, nên không cần secret key.
- Bảng `test_secrets` tách đáp án khỏi `tests`; `daily_sets.closes_at` lưu giờ chốt.
- Dạng map/plan labelling của Listening mô tả sơ đồ bằng chữ (chưa có hình).
- Full test Chủ nhật mới có công tắc trong cài đặt nhóm, chưa có bộ đề.
- Speaking chuyển từ làm một mình theo từng Part sang thi theo cặp trong phòng nói, dùng bảng
  `speaking_turns` và cột `attempts.test_id`, `tests.bank_key`. Đề Speaking từng Part của bộ đề mẫu không
  còn được phát theo ngày.
- Dự án riêng tư, không phát hành mã nguồn.
