// Helper cho route handler: lỗi có mã HTTP và parse body an toàn.
import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Ctx = { params: Promise<Record<string, string>> };

export function route(fn: (req: Request, ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const data = await fn(req, ctx);
      return data instanceof Response ? data : NextResponse.json(data ?? { ok: true });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Lỗi máy chủ, thử lại sau." }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Dữ liệu gửi lên không hợp lệ.");
  }
}

export function intParam(value: string | undefined, name = "id"): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ApiError(400, `Tham số ${name} không hợp lệ.`);
  return n;
}
