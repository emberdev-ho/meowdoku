// Tạo user quản trị và user cho app. Chạy được nhiều lần.
// Lần đầu chưa có user nào nên mongod cho phép tạo user quản trị qua localhost
// (localhost exception); các lần sau đăng nhập bằng mật khẩu đã lưu.
// Mật khẩu lấy từ biến môi trường để không lộ trên dòng lệnh.
const { ADMIN_PASS, APP_PASS } = process.env;
if (!ADMIN_PASS || !APP_PASS) throw new Error("Thiếu ADMIN_PASS hoặc APP_PASS");

const admin = db.getSiblingDB("admin");
let authed = false;
try {
  authed = admin.auth("admin", ADMIN_PASS).ok === 1;
} catch {
  // Chưa có user admin: tạo ở bước dưới.
}
if (!authed) {
  admin.createUser({ user: "admin", pwd: ADMIN_PASS, roles: [{ role: "root", db: "admin" }] });
  admin.auth("admin", ADMIN_PASS);
  print("Đã tạo user admin.");
}

const app = db.getSiblingDB("meowdoku");
const roles = [{ role: "readWrite", db: "meowdoku" }];
if (app.getUser("meowdoku")) {
  app.updateUser("meowdoku", { pwd: APP_PASS, roles });
  print("Đã cập nhật user meowdoku.");
} else {
  app.createUser({ user: "meowdoku", pwd: APP_PASS, roles });
  print("Đã tạo user meowdoku.");
}
