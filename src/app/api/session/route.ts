import { ensureUser, publicUser } from "@/lib/server/auth";
import { route } from "@/lib/server/http";

// Gọi khi mở game: trả về người chơi hiện tại hoặc tạo tài khoản khách.
export const POST = route(async () => publicUser(await ensureUser()));
