// Nạp biến môi trường cho các script giống Next.js: .env.local được ưu tiên hơn .env.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
