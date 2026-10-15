// Đọc dữ liệu màn có lời giải từ thư mục data/ (không public).
// next.config.ts khai báo outputFileTracingIncludes để Vercel đóng gói thư mục này.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chunkFile, chunkOf, isValidLevelId } from "../config";
import { ApiError } from "./http";

/** regions: chuỗi vùng màu; given: ô có mèo cho sẵn; solution: ô có mèo trong lời giải (tăng dần). */
export type ServerPuzzle = { id: string; size: number; regions: string; given: number[]; solution: number[] };
export type ServerLevel = { id: number; size: number; diff: number; regions: string; given: number[]; solution: number[] };

const chunkCache = new Map<number, Promise<ServerLevel[]>>();
let roomsCache: Promise<{ pvp: ServerPuzzle[]; coop: ServerPuzzle[] }> | null = null;

const dataPath = (...p: string[]) => join(process.cwd(), "data", ...p);

function loadChunk(chunk: number): Promise<ServerLevel[]> {
  let p = chunkCache.get(chunk);
  if (!p) {
    p = readFile(dataPath("levels", chunkFile(chunk)), "utf8").then((s) => JSON.parse(s).levels);
    chunkCache.set(chunk, p);
  }
  return p;
}

export async function getLevel(id: number): Promise<ServerLevel> {
  if (!isValidLevelId(id)) throw new ApiError(404, "Không có màn này.");
  const levels = await loadChunk(chunkOf(id));
  const lvl = levels.find((l) => l.id === id);
  if (!lvl) throw new ApiError(404, "Không có màn này.");
  return lvl;
}

function loadRooms() {
  if (!roomsCache) {
    roomsCache = readFile(dataPath("rooms.json"), "utf8").then((s) => JSON.parse(s));
  }
  return roomsCache;
}

export async function randomRoomPuzzle(mode: "pvp" | "coop"): Promise<ServerPuzzle> {
  const pool = (await loadRooms())[mode];
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function getRoomPuzzle(id: string): Promise<ServerPuzzle> {
  const rooms = await loadRooms();
  const p = [...rooms.pvp, ...rooms.coop].find((x) => x.id === id);
  if (!p) throw new ApiError(500, "Không tìm thấy đề của phòng.");
  return p;
}

/** Danh sách ô có mèo do client gửi lên: mảng số nguyên trong bàn, không trùng, đã sắp xếp. */
export function readCats(raw: unknown, size: number): number[] {
  if (!Array.isArray(raw) || raw.length > size * size) throw new ApiError(400, "Danh sách mèo không hợp lệ.");
  const cats = raw.map(Number);
  if (cats.some((c) => !Number.isInteger(c) || c < 0 || c >= size * size)) throw new ApiError(400, "Danh sách mèo không hợp lệ.");
  return [...new Set(cats)].sort((a, b) => a - b);
}
