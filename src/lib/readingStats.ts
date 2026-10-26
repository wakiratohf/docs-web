import type { DocItem } from '../types';
import { plainTextOf } from './search';

export interface ReadingStats {
  /** Tổng số từ */
  words: number;
  /** Tổng số ký tự (không tính khoảng trắng dư thừa) */
  characters: number;
  /** Thời gian đọc ước tính tính bằng phút (tối thiểu 1 phút) */
  minutes: number;
  /** Chuỗi hiển thị ngắn gọn, vd: "⏱ 3 phút đọc • 650 từ" */
  label: string;
}

/** Tốc độ đọc trung bình: 200 từ/phút (chuẩn quốc tế cho văn bản thông thường) */
const WORDS_PER_MINUTE = 200;

/**
 * Đếm số từ trong văn bản (hỗ trợ cả tiếng Việt có dấu, tiếng Anh và số).
 * Loại bỏ các ký tự Markdown/HTML thông dụng trước khi đếm.
 */
export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;

  // Lọc bớt các ký tự cú pháp markdown đặc biệt trước khi đếm từ
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' ') // khối code
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // link [text](url) -> text
    .replace(/[#*_~`>|\\-]/g, ' ') // ký tự định dạng markdown
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return 0;

  // Tách từ theo khoảng trắng
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);
  return tokens.length;
}

/**
 * Đếm số ký tự (không tính ký tự xuống dòng / khoảng trắng thừa).
 */
export function countCharacters(text: string): number {
  if (!text) return 0;
  return text.replace(/\s/g, '').length;
}

/**
 * Tính toán số liệu thống kê đọc từ văn bản thô.
 */
export function calculateReadingStats(rawText: string): ReadingStats {
  const words = countWords(rawText);
  const characters = countCharacters(rawText);
  const minutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  const label = `⏱ ${minutes} phút đọc • ${words.toLocaleString('vi-VN')} từ`;

  return {
    words,
    characters,
    minutes,
    label,
  };
}

/**
 * Tính toán số liệu thống kê đọc trực tiếp từ DocItem.
 */
export function getDocReadingStats(doc: DocItem): ReadingStats {
  const text = plainTextOf(doc);
  return calculateReadingStats(text);
}
