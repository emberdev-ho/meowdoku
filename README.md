# Meowdoku

Game nối mèo theo kiểu nối ô cổ điển. Gồm 100 màn chơi đơn, bảng xếp hạng, đấu 1-1 (PvP) và chơi cùng bạn (co-op).

## Luật chơi

- Bấm hai ô mèo giống hệt nhau để nối. Đường nối chỉ đi qua ô trống, rẽ tối đa 2 lần, và được vòng ra ngoài viền bàn.
- Nối xong hai ô biến mất, các ô còn lại dồn theo kiểu của màn. Kiểu dồn xoay vòng theo màn: đứng yên, dồn xuống, lên, trái, phải, tách sang hai bên, dồn vào giữa theo hàng, tách lên và xuống, dồn vào giữa theo cột.
- Xóa sạch bàn trước khi hết giờ để qua màn. Sao tính theo thời gian còn lại: còn từ một nửa trở lên được 3 sao, từ một phần tư được 2 sao.
- Mỗi màn có 3 lần gợi ý và 3 lần tự trộn bàn. Hết nước đi thì bàn tự trộn, không mất lượt.
- Màn 1–10 là bàn 6×8, màn 11–30 là 8×12, màn 31–100 là 9×16. Mỗi loại mèo có 4 ô; 36 loại là 9 chú mèo nhân 4 kiểu (màu nền ô và nơ, mũ, kính). PvP dùng bàn 8×12, co-op dùng bàn 9×16.
- Trên điện thoại dựng đứng, bàn tự xoay 90° để ô không quá nhỏ; luật không đổi.

Hình mèo do dự án tự vẽ. Không dùng hình, tên hay âm thanh của Pokémon.

## Chạy thử trên máy

1. Cài thư viện:
   ```bash
   npm install
   ```
2. Tạo file `.env.local` theo mẫu `.env.example`:
   - `MONGODB_URI`: dùng MongoDB chạy trên máy, đặt `mongodb://127.0.0.1:27017`. Trên macOS cài và bật bằng:
     ```bash
     brew tap mongodb/brew && brew install mongodb-community@8.0 && brew services start mongodb-community@8.0
     ```
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

Bàn của mỗi màn được sinh từ seed cố định ngay trên trình duyệt và server (`levelSpec` trong `src/lib/config.ts`), nên không có file màn chơi nào phải sinh trước.

## Deploy lên Vercel

1. Đẩy code lên GitHub rồi import vào Vercel.
2. Trong project trên Vercel, vào **Storage → Marketplace → Upstash Redis** để tạo database. Vercel sẽ tự thêm biến `KV_REST_API_URL` và `KV_REST_API_TOKEN`; code nhận được cả hai kiểu tên biến.
3. Thêm `MONGODB_URI`, `MONGODB_DB` và `AUTH_SECRET` vào mục Environment Variables. Vercel không kết nối được tới MongoDB trên máy bạn, nên `MONGODB_URI` phải trỏ tới một server truy cập được từ Internet (xem mục bên dưới).
4. Deploy.

Gói Hobby của Vercel chỉ dành cho mục đích phi thương mại. Nếu game có quảng cáo hoặc bán vật phẩm thì cần gói Pro.

## MongoDB tự quản

Code chỉ dùng thao tác đọc/ghi và index, không dùng transaction hay change stream, nên một `mongod` đơn lẻ là đủ, không cần cluster hay replica set.

### Tạm thời: MongoDB Atlas (khi chưa có VPS)

Trước khi có VPS, bản trên Vercel dùng tạm một cluster miễn phí (M0) trên MongoDB Atlas, không cần sửa code:

1. Tạo cluster M0, chọn region gần Function Region của Vercel.
2. **Database Access:** tạo user chỉ có quyền `readWrite` trên database `meowdoku` (mục Specific Privileges), không dùng quyền `atlasAdmin`.
3. **Network Access:** cho phép `0.0.0.0/0` vì IP của Vercel thay đổi liên tục.
4. Lấy chuỗi kết nối `mongodb+srv://...` (Connect → Drivers), đặt vào `MONGODB_URI` trên Vercel, rồi tạo index một lần từ máy bạn: `MONGODB_URI='<URI>' npm run db:indexes`.

Khi đã dựng xong VPS, chuyển dữ liệu sang rồi đổi `MONGODB_URI` trên Vercel. Nên làm lúc ít người chơi, vì dữ liệu ghi vào Atlas sau khi dump sẽ không được chuyển:

```bash
mongodump --uri '<URI Atlas>' --db meowdoku --archive=meowdoku.gz --gzip
```
```bash
mongorestore --uri '<URI VPS>' --archive=meowdoku.gz --gzip
```

### Dựng trên VPS cho bản chạy trên Vercel

IP của Vercel thay đổi liên tục nên cổng MongoDB phải mở ra Internet. Script `deploy/mongo/setup.sh` cài MongoDB 8.0 trên Ubuntu 22.04/24.04 với:

- Xác thực bắt buộc: user `admin` (quyền root) và user `meowdoku` (chỉ `readWrite` trên database `meowdoku`), mật khẩu ngẫu nhiên lưu ở `/root/meowdoku-mongo.env`.
- TLS bắt buộc bằng chứng chỉ Let's Encrypt, tự gia hạn qua certbot.
- Tường lửa `ufw`: chỉ mở cổng SSH, 80 (để gia hạn chứng chỉ) và 27017.
- Sao lưu hằng ngày lúc 03:15 vào `/var/backups/meowdoku`, giữ 14 bản. Bản sao lưu nằm trên chính VPS, nên chép thêm ra nơi khác. MongoDB là nguồn dữ liệu gốc; Redis thì dựng lại được bằng `npm run lb:rebuild`.

Các bước:

1. Trỏ một tên miền (bản ghi A) về IP của VPS, ví dụ `db.example.com`. Chưa có tên miền thì dùng dạng `203-0-113-5.sslip.io` (thay bằng IP của VPS, dấu chấm đổi thành gạch ngang).
2. Chép thư mục lên VPS và chạy (chạy script là đồng ý điều khoản của Let's Encrypt):
   ```bash
   scp -r deploy/mongo root@203.0.113.5:/root/mongo-setup
   ```
   ```bash
   ssh root@203.0.113.5 'bash /root/mongo-setup/setup.sh db.example.com you@example.com'
   ```
3. Nếu nhà cung cấp VPS có tường lửa riêng (security group), mở thêm cổng 80 và 27017 ở đó.
4. Lấy URI bằng `sudo grep MONGODB_URI /root/meowdoku-mongo.env` trên VPS, đặt vào Environment Variables trên Vercel, rồi tạo index một lần từ máy bạn: `MONGODB_URI='<URI>' npm run db:indexes`.
5. Trên Vercel, chọn Function Region gần VPS (Settings → Functions), vì mỗi request API gọi MongoDB vài lần.

### Khi go live: chuyển app về chính VPS

- Đổi `net.bindIp` trong `/etc/mongod.conf` thành `127.0.0.1`, chạy `ufw delete allow 27017/tcp` và `systemctl restart mongod`.
- App kết nối qua loopback: `mongodb://meowdoku:<mật khẩu>@127.0.0.1:27017/meowdoku?authSource=meowdoku&tls=true&tlsAllowInvalidHostnames=true`.
- certbot đang gia hạn chứng chỉ ở chế độ standalone (tự mở cổng 80). Khi đã có nginx hoặc Caddy chiếm cổng 80, phải đổi certbot sang chế độ `--webroot` hoặc plugin nginx.

## Lưu trữ ở đâu

| Dữ liệu | Nơi lưu | Ghi chú |
|---|---|---|
| Bàn của các màn | Sinh từ seed (`src/lib/config.ts`) | Không lưu ở đâu; client và server sinh ra cùng một bàn |
| Người chơi, kết quả, trận đấu | MongoDB: `users`, `results`, `matches` | Nguồn dữ liệu gốc |
| Bảng xếp hạng | Redis sorted set: `lb:level:{id}`, `lb:global`, `lb:pvp` | Mất dữ liệu thì chạy `npm run lb:rebuild` |
| Phòng PvP/co-op, bàn đang chơi, hàng chờ | Redis: `room:*`, `mm:*` | Tự hết hạn sau 2 giờ |

## Chống gian lận

- Khi người chơi mở màn, server cấp một **vé chơi** (JWT) ghi giờ bắt đầu và số gợi ý đã dùng. Thời gian giải được tính theo đồng hồ server.
- Khi xóa sạch bàn, client gửi toàn bộ nước đi. Server sinh lại bàn từ seed, chơi lại từng nước (đường nối, dồn ô, trộn bàn đều theo seed) và chỉ ghi kết quả nếu mọi nước hợp lệ, bàn sạch, số lần tự trộn không vượt giới hạn, và thời gian nằm trong khoảng hợp lý (ít nhất 0,25 giây mỗi cặp, không quá giới hạn của màn).
- Ở PvP và co-op, bàn đang chơi nằm trên Redis. Mỗi nước nối được server kiểm tra lại rồi ghi bằng script Lua so-sánh-rồi-ghi, nên hai người co-op bấm cùng lúc không ghi đè lên nhau.
- Bàn hiện công khai trên máy người chơi nên không chặn được người dùng công cụ tự giải; giới hạn thời gian tối thiểu chỉ chặn kết quả gửi lên quá nhanh.
- Ghép trận chạy bằng một script Lua nguyên tử trên Redis, nên một người không bao giờ bị ghép vào hai trận. Kết thúc trận dùng khóa `SET NX`, nên kết quả chỉ được ghi một lần.

## Giới hạn hiện tại và hướng nâng cấp

- **Thời gian thực dùng polling** (mỗi người gọi khoảng 1 lần/giây). Cách này chạy được trên Vercel, nhưng mỗi trận PvP 3 phút tốn khoảng 1.500–2.000 lệnh Redis, nên gói miễn phí của Upstash chỉ đủ vài trăm trận mỗi tháng. Khi đông người chơi, nên chuyển sang Socket.IO chạy trên VPS. Phần logic trong `src/lib/server/rooms.ts` dùng lại được, chỉ cần thay lớp truyền tin.
- **Tài khoản khách** gắn với cookie: xóa cookie là mất tài khoản. Có thể thêm Auth.js (Google/Discord) sau và gắn tài khoản khách vào.
- Chưa có bảng xếp hạng theo tuần. Để thêm, dùng key dạng `lb:weekly:2026-W42` kèm TTL.

## Cấu trúc thư mục

```
scripts/
  create-indexes.ts       Tạo index MongoDB
  rebuild-leaderboards.ts Dựng lại bảng xếp hạng Redis từ MongoDB
  env.ts                  Nạp .env.local rồi .env cho các script (giống Next.js)
deploy/mongo/
  setup.sh                Dựng MongoDB trên VPS: xác thực, TLS, tường lửa, sao lưu
  mongod.conf             Cấu hình mongod (chép vào /etc/mongod.conf)
  create-users.js         Tạo user admin và user cho app
  renew-hook.sh           Hook certbot: cập nhật chứng chỉ cho mongod
  backup.sh               Sao lưu hằng ngày bằng mongodump
src/lib/
  onet.ts                 Luật nối ô: tìm đường, dồn ô, sinh và trộn bàn, chơi lại ván (dùng chung client/server)
  config.ts               Số màn, luật tính sao, thông số PvP/co-op
  server/                 Code chỉ chạy trên server: auth, mongo, redis, leaderboard, rooms, matchmaking
src/app/
  play/                   Bản đồ màn và trang chơi
  pvp/  coop/  room/      Sảnh đấu, sảnh co-op, phòng chơi
  leaderboard/            Bảng xếp hạng
  api/                    Các route API
```

## Đổi luật

- **Số gợi ý, số lần trộn, cách tính sao, thời gian, thông số PvP/co-op:** sửa trong `src/lib/config.ts`.
- **Thêm màn:** tăng `LEVEL_COUNT` và thêm dải mới vào cuối `LEVEL_BANDS`. Bàn của mỗi màn chỉ phụ thuộc vào số thứ tự của nó, nên các màn cũ giữ nguyên. Số ô của bàn phải chia hết cho số loại mèo và mỗi loại có số chẵn ô.
- **Đổi dải đã có, đổi `SEED` hoặc đổi cách sinh/trộn bàn trong `src/lib/onet.ts`:** bàn của các màn cũ sẽ khác đi, nên kỷ lục cũ không còn so sánh được và các ván đang chơi dở khi deploy sẽ bị từ chối lúc nộp.
