#!/bin/sh
# Sao lưu database meowdoku mỗi ngày (cron), giữ 14 bản gần nhất.
# Bản sao lưu nằm trên chính VPS: nên chép định kỳ sang nơi khác để phòng mất VPS.
set -eu

dir=/var/backups/meowdoku
mkdir -p "$dir"
chmod 700 "$dir"

# Mật khẩu đọc từ file cấu hình (chỉ root đọc được) để không lộ trong danh sách tiến trình.
# Kết nối qua loopback nên chứng chỉ (cấp cho tên miền) không khớp 127.0.0.1. mongodump bỏ qua
# tham số tlsAllowInvalidHostnames trong URI, nên dùng --tlsInsecure; kết nối vẫn được mã hóa TLS.
mongodump --quiet \
  --uri "mongodb://meowdoku@127.0.0.1:27017/meowdoku?authSource=meowdoku&tls=true" \
  --tlsInsecure \
  --config /root/meowdoku-mongodump.yaml \
  --archive="$dir/meowdoku-$(date +%Y%m%d-%H%M).gz" --gzip

ls -1t "$dir"/meowdoku-*.gz | tail -n +15 | xargs -r rm -f
