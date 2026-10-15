#!/bin/sh
# Hook của certbot: ghép chứng chỉ mới thành file PEM cho mongod rồi khởi động lại.
# certbot đặt RENEWED_LINEAGE=/etc/letsencrypt/live/<tên miền>.
set -eu

dest=/etc/mongodb/tls/mongod.pem
cat "$RENEWED_LINEAGE/fullchain.pem" "$RENEWED_LINEAGE/privkey.pem" > "$dest.new"
chown mongodb:mongodb "$dest.new"
chmod 600 "$dest.new"
mv -f "$dest.new" "$dest"
systemctl restart mongod
