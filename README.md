# Meowdoku

Sudoku với mèo thay cho số. Gồm 3000 màn chơi đơn, bảng xếp hạng, đấu 1-1 (PvP) và chơi cùng bạn (co-op).

Stack: **Next.js 16 + TypeScript + Tailwind 4**, **MongoDB Atlas**, **Upstash Redis**. Toàn bộ chạy được trên Vercel.

## Chạy thử trên máy

1. Cài thư viện:
   ```bash
   npm install
   ```
2. Tạo file `.env.local` theo mẫu `.env.example`:
   - `MONGODB_URI`: tạo cluster miễn phí ở MongoDB Atlas, vào **Network Access** cho phép `0.0.0.0/0` (vì IP của Vercel thay đổi liên tục).
   - `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN`: tạo database miễn phí ở Upstash, lấy ở tab REST API.
   - `AUTH_SECRET`: tạo bằng `openssl rand -base64 48`.
3. Tạo index cho MongoDB (chạy một lần):
   ```bash
   npm run db:indexes
   ```
4. Chạy:
   ```bash
   npm run dev
   ```
   Mở http://localhost:3000. Để thử PvP, mở thêm một cửa sổ ẩn danh làm người chơi thứ hai.

Các màn chơi đã được sinh sẵn trong `public/levels/` và `data/`. Chỉ cần chạy lại `npm run levels:generate` khi bạn đổi luật sinh màn.

## Deploy lên Vercel

1. Đẩy code lên GitHub rồi import vào Vercel.
2. Trong project trên Vercel, vào **Storage → Marketplace → Upstash Redis** để tạo database. Vercel sẽ tự thêm biến `KV_REST_API_URL` và `KV_REST_API_TOKEN`; code nhận được cả hai kiểu tên biến.
3. Thêm `MONGODB_URI`, `MONGODB_DB` và `AUTH_SECRET` vào mục Environment Variables.
4. Deploy.

Gói Hobby của Vercel chỉ dành cho mục đích phi thương mại. Nếu game có quảng cáo hoặc bán vật phẩm thì cần gói Pro.

## Lưu trữ ở đâu

| Dữ liệu | Nơi lưu | Ghi chú |
|---|---|---|
| Đề của 3000 màn | `public/levels/*.json` | Chia 30 gói × 100 màn, phục vụ qua CDN, **không có đáp án** |
| Đáp án | `data/levels/*.json`, `data/rooms.json` | Chỉ server đọc; `next.config.ts` đóng gói thư mục này vào các API |
| Người chơi, kết quả, trận đấu | MongoDB: `users`, `results`, `matches` | Nguồn dữ liệu gốc |
| Bảng xếp hạng | Redis sorted set: `lb:level:{id}`, `lb:global`, `lb:pvp` | Mất dữ liệu thì chạy `npm run lb:rebuild` |
| Phòng PvP/co-op, hàng chờ | Redis: `room:*`, `mm:*` | Tự hết hạn sau 2 giờ |

## Chống gian lận

- Khi người chơi mở màn, server cấp một **vé chơi** (JWT) ghi giờ bắt đầu và số gợi ý đã dùng. Thời gian giải được tính theo đồng hồ server.
- Server so lời giải với đáp án và từ chối nếu giải nhanh hơn 0,4 giây mỗi ô trống.
- Ở PvP và co-op, server kiểm tra từng nước đi và client không bao giờ nhận đáp án. Để chặn đoán mò, PvP thua khi sai 3 lần, co-op thua khi cả nhóm sai 5 lần.
- Ghép trận chạy bằng một script Lua nguyên tử trên Redis, nên một người không bao giờ bị ghép vào hai trận. Kết thúc trận dùng khóa `SET NX`, nên kết quả chỉ được ghi một lần.

## Giới hạn hiện tại và hướng nâng cấp

- **Thời gian thực dùng polling** (mỗi người gọi khoảng 1 lần/giây). Cách này chạy được trên Vercel, nhưng mỗi trận PvP 3 phút tốn khoảng 1.500–2.000 lệnh Redis, nên gói miễn phí của Upstash chỉ đủ vài trăm trận mỗi tháng. Khi đông người chơi, nên chuyển sang Socket.IO chạy trên VPS. Phần logic trong `src/lib/server/rooms.ts` dùng lại được, chỉ cần thay lớp truyền tin.
- **Tài khoản khách** gắn với cookie: xóa cookie là mất tài khoản. Có thể thêm Auth.js (Google/Discord) sau và gắn tài khoản khách vào.
- Chưa có bảng xếp hạng theo tuần. Để thêm, dùng key dạng `lb:weekly:2026-W42` kèm TTL.

## Cấu trúc thư mục

```
scripts/
  generate-levels.ts      Sinh 3000 màn và kho đề PvP/co-op (có seed, chạy lại ra giống hệt)
  create-indexes.ts       Tạo index MongoDB
  rebuild-leaderboards.ts Dựng lại bảng xếp hạng Redis từ MongoDB
src/lib/
  sudoku.ts               Bộ giải, bộ sinh đề, kiểm tra xung đột (dùng chung client/server)
  config.ts               Số màn, luật tính sao, thông số PvP/co-op
  server/                 Code chỉ chạy trên server: auth, mongo, redis, leaderboard, rooms, matchmaking
src/app/
  play/                   Bản đồ màn và trang chơi
  pvp/  coop/  room/      Sảnh đấu, sảnh co-op, phòng chơi
  leaderboard/            Bảng xếp hạng
  api/                    Các route API
```

## Đổi luật

- **Số sao, thời gian chuẩn, giới hạn PvP/co-op:** sửa trong `src/lib/config.ts`.
- **Độ khó và phân bổ kích thước bàn:** sửa `LEVEL_BANDS` trong `config.ts` và `GIVENS` trong `scripts/generate-levels.ts`, rồi chạy lại `npm run levels:generate`. Lưu ý: đổi luật sẽ làm thay đổi đề của các màn, nên kỷ lục cũ không còn so sánh được. Khi đó hãy tăng `PACK_VERSION`.
