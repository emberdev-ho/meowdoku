#!/usr/bin/env bash
# Cài MongoDB 8.0 trên VPS Ubuntu 22.04/24.04: bắt buộc xác thực, TLS bằng Let's Encrypt,
# tường lửa, tự gia hạn chứng chỉ và sao lưu hằng ngày. Chạy lại nhiều lần vẫn an toàn.
#
#   sudo bash setup.sh <tên miền> [email]
#
# Tên miền phải trỏ (bản ghi A) về IP của VPS; chưa có tên miền thì dùng dạng 1-2-3-4.sslip.io.
# Chạy script này đồng nghĩa với việc đồng ý điều khoản của Let's Encrypt.
set -euo pipefail

DOMAIN=${1:?"Cách dùng: sudo bash setup.sh <tên miền> [email]"}
EMAIL=${2:-}
HERE=$(cd "$(dirname "$0")" && pwd)
CREDS=/root/meowdoku-mongo.env

[[ $EUID -eq 0 ]] || { echo "Cần chạy bằng root (sudo)." >&2; exit 1; }
. /etc/os-release
case "$VERSION_CODENAME" in
  jammy | noble) ;;
  *) echo "Chỉ hỗ trợ Ubuntu 22.04 (jammy) và 24.04 (noble), máy này là $PRETTY_NAME." >&2; exit 1 ;;
esac
# MongoDB 5.0 trở lên cần CPU x86_64 có AVX.
if [[ $(uname -m) == x86_64 ]] && ! grep -qw avx /proc/cpuinfo; then
  echo "CPU của VPS không hỗ trợ AVX nên không chạy được MongoDB 8.0." >&2
  exit 1
fi

echo "==> Cài MongoDB 8.0, certbot, ufw"
apt-get update -q
apt-get install -yq gnupg curl certbot ufw
curl -fsSL https://pgp.mongodb.com/server-8.0.asc | gpg --dearmor --yes -o /usr/share/keyrings/mongodb-server-8.0.gpg
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu $VERSION_CODENAME/mongodb-org/8.0 multiverse" \
  > /etc/apt/sources.list.d/mongodb-org-8.0.list
apt-get update -q
apt-get install -yq mongodb-org

echo "==> Tường lửa"
# Giữ cổng SSH đang dùng để không tự khóa mình ngoài.
SSH_PORT=$(echo "${SSH_CONNECTION:-}" | awk '{print $4}')
ufw allow "${SSH_PORT:-22}/tcp"
ufw allow 80/tcp     # certbot cần cổng 80 khi cấp và gia hạn chứng chỉ
ufw allow 27017/tcp  # MongoDB cho Vercel
ufw --force enable

echo "==> Chứng chỉ TLS cho $DOMAIN"
if [[ -n $EMAIL ]]; then account=(-m "$EMAIL"); else account=(--register-unsafely-without-email); fi
certbot certonly --standalone --non-interactive --agree-tos --keep-until-expiring "${account[@]}" -d "$DOMAIN"
install -d -o mongodb -g mongodb -m 700 /etc/mongodb/tls
install -m 755 "$HERE/renew-hook.sh" /etc/letsencrypt/renewal-hooks/deploy/mongod.sh

echo "==> Cấu hình mongod"
install -m 644 "$HERE/mongod.conf" /etc/mongod.conf
systemctl enable mongod
# Hook ghép chứng chỉ vào /etc/mongodb/tls và khởi động lại mongod với cấu hình mới.
RENEWED_LINEAGE=/etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/renewal-hooks/deploy/mongod.sh

MONGO_LOCAL="mongodb://127.0.0.1:27017/admin?tls=true&tlsAllowInvalidHostnames=true"
for _ in $(seq 30); do
  mongosh "$MONGO_LOCAL" --quiet --eval 'db.runCommand({ ping: 1 }).ok' > /dev/null 2>&1 && break
  sleep 1
done

echo "==> Tạo user"
# Mật khẩu sinh một lần rồi giữ nguyên ở các lần chạy sau. Không in ra màn hình.
if [[ -f $CREDS ]]; then . "$CREDS"; fi
ADMIN_PASS=${ADMIN_PASS:-$(openssl rand -hex 24)}
APP_PASS=${APP_PASS:-$(openssl rand -hex 24)}
(umask 077 && cat > "$CREDS" <<EOF
ADMIN_PASS='$ADMIN_PASS'
APP_PASS='$APP_PASS'
MONGODB_URI='mongodb://meowdoku:$APP_PASS@$DOMAIN:27017/meowdoku?authSource=meowdoku&tls=true'
EOF
)
ADMIN_PASS=$ADMIN_PASS APP_PASS=$APP_PASS mongosh "$MONGO_LOCAL" --quiet --file "$HERE/create-users.js"

echo "==> Sao lưu hằng ngày"
(umask 077 && echo "password: $APP_PASS" > /root/meowdoku-mongodump.yaml)
install -m 755 "$HERE/backup.sh" /usr/local/bin/meowdoku-mongo-backup
echo "15 3 * * * root /usr/local/bin/meowdoku-mongo-backup" > /etc/cron.d/meowdoku-mongo-backup

cat <<EOF

Xong. Lấy MONGODB_URI cho Vercel (Settings → Environment Variables) bằng:
  sudo grep MONGODB_URI $CREDS
File này cũng chứa mật khẩu admin, chỉ root đọc được.
Nếu nhà cung cấp VPS có tường lửa riêng (security group), mở thêm cổng 80 và 27017 ở đó.
EOF
