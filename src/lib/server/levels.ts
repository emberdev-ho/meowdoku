// Đọc dữ liệu màn có đáp án từ thư mục data/ (không public).
// next.config.ts khai báo outputFileTracingIncludes để Vercel đóng gói thư mục này.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chunkFile, chunkOf, isValidLevelId } from "../config";
import { ApiError } from "./http";

export type ServerPuzzle = { id: string; size: number; grid: string; solution: string };
export type ServerLevel = { id: number; size: number; diff: number; grid: string; solution: string };

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

export function countEmpties(grid: string): number {
  let n = 0;
  for (const ch of grid) if (ch === "0") n++;
  return n;
}
