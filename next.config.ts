import type { NextConfig } from "next";

const config: NextConfig = {
  // Đóng gói thư mục data/ (có đáp án) vào các hàm API khi deploy lên Vercel.
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/**/*"],
  },
  async headers() {
    return [
      {
        // File màn chơi không đổi giữa các lần deploy cùng phiên bản: cache lâu ở CDN.
        source: "/levels/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default config;
