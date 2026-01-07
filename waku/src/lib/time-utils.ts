/**
 * JST（日本標準時）ベースの時刻ユーティリティ
 *
 * このモジュールはブラウザのタイムゾーンに依存せず、
 * 常にJST（UTC+9）で時刻を処理します。
 *
 * @module time-utils
 */

/** JSTオフセット（秒） */
const JST_OFFSET_SECONDS = 9 * 60 * 60;

/** JSTオフセット（ミリ秒） */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 1日の秒数 */
const SECONDS_PER_DAY = 86400;

/** 1時間の秒数 */
const SECONDS_PER_HOUR = 3600;

/** 1分の秒数 */
const SECONDS_PER_MINUTE = 60;

/**
 * 時刻を表すオブジェクト
 */
export interface TimeOfDay {
  /** 時（0-23） */
  hours: number;
  /** 分（0-59） */
  minutes: number;
}

/**
 * 今日の日付をJSTで取得する（YYYY-MM-DD形式）
 *
 * @returns 今日の日付文字列（例: "2024-01-08"）
 *
 * @example
 * const today = getTodayJST();
 * console.log(today); // "2024-01-08"
 */
export function getTodayJST(): string {
  const now = new Date();
  const jstDate = new Date(now.getTime() + JST_OFFSET_MS);
  return jstDate.toISOString().split('T')[0];
}

/**
 * UnixタイムスタンプからJSTの時刻（時・分）を取得する
 *
 * @param timestamp - Unixタイムスタンプ（秒単位）
 * @returns 時刻オブジェクト
 *
 * @example
 * const time = getJSTTime(1704672000);
 * console.log(time); // { hours: 10, minutes: 0 }
 */
export function getJSTTime(timestamp: number): TimeOfDay {
  const jstTimestamp = timestamp + JST_OFFSET_SECONDS;
  const hours = Math.floor((jstTimestamp % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((jstTimestamp % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return { hours, minutes };
}

/**
 * UnixタイムスタンプからJSTの時刻を分単位で取得する
 * ソートや時間比較に使用
 *
 * @param timestamp - Unixタイムスタンプ（秒単位）
 * @returns 0時からの経過分数（0-1439）
 *
 * @example
 * const minutes = getTimeOfDayJST(1704672000);
 * console.log(minutes); // 600 (10:00)
 */
export function getTimeOfDayJST(timestamp: number): number {
  const { hours, minutes } = getJSTTime(timestamp);
  return hours * 60 + minutes;
}

/**
 * Unixタイムスタンプを "HH:MM" 形式の時刻文字列にフォーマットする
 *
 * @param timestamp - Unixタイムスタンプ（秒単位）
 * @returns フォーマットされた時刻文字列（例: "10:30"）
 *
 * @example
 * const timeStr = formatTimeJST(1704672000);
 * console.log(timeStr); // "10:00"
 */
export function formatTimeJST(timestamp: number): string {
  const { hours, minutes } = getJSTTime(timestamp);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * 値（文字列またはUnixタイムスタンプ）を "HH:MM" 形式にフォーマットする
 *
 * @param value - ISO日時文字列またはUnixタイムスタンプ（秒単位）
 * @returns フォーマットされた時刻文字列
 *
 * @example
 * formatTimeFromValue(1704672000); // "10:00"
 * formatTimeFromValue("2024-01-08T10:00:00"); // "10:00"
 */
export function formatTimeFromValue(value: string | number): string {
  const timestamp = typeof value === 'number'
    ? value
    : Math.floor(new Date(value).getTime() / 1000);
  return formatTimeJST(timestamp);
}

/**
 * Dateオブジェクトを "HH:MM" 形式にフォーマットする（ローカル時間）
 *
 * @param date - Dateオブジェクト
 * @returns フォーマットされた時刻文字列
 *
 * @example
 * const time = formatTime(new Date());
 * console.log(time); // "10:30"
 */
export function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * 日付文字列を "M月D日（曜日）" 形式にフォーマットする
 *
 * @param dateStr - 日付文字列（YYYY-MM-DD形式）
 * @returns フォーマットされた日付文字列（例: "1月8日（月）"）
 *
 * @example
 * const dateStr = formatDateJapanese("2024-01-08");
 * console.log(dateStr); // "1月8日（月）"
 */
export function formatDateJapanese(dateStr: string): string {
  const date = new Date(dateStr);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${date.getMonth() + 1}月${date.getDate()}日（${weekdays[date.getDay()]}）`;
}

/**
 * 日付を1日進める
 *
 * @param dateStr - 日付文字列（YYYY-MM-DD形式）
 * @returns 翌日の日付文字列
 *
 * @example
 * const next = getNextDay("2024-01-08");
 * console.log(next); // "2024-01-09"
 */
export function getNextDay(dateStr: string): string {
  // YYYY-MM-DD形式の日付を解析（ローカルタイムゾーンとして解釈）
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day + 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 日付を1日戻す
 *
 * @param dateStr - 日付文字列（YYYY-MM-DD形式）
 * @returns 前日の日付文字列
 *
 * @example
 * const prev = getPreviousDay("2024-01-08");
 * console.log(prev); // "2024-01-07"
 */
export function getPreviousDay(dateStr: string): string {
  // YYYY-MM-DD形式の日付を解析（ローカルタイムゾーンとして解釈）
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day - 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 現在時刻のUnixタイムスタンプを秒単位で取得
 *
 * @returns 現在時刻のUnixタイムスタンプ（秒）
 */
export function getNowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * 時刻文字列と日付文字列からUnixタイムスタンプを生成
 *
 * @param timeStr - 時刻文字列（"HH:MM"形式）
 * @param dateStr - 日付文字列（"YYYY-MM-DD"形式）
 * @returns Unixタイムスタンプ（秒）
 *
 * @example
 * const ts = timeToTimestamp("10:30", "2024-01-08");
 * console.log(ts); // 1704683400
 */
export function timeToTimestamp(timeStr: string, dateStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date(dateStr);
  date.setHours(hours, minutes, 0, 0);
  return Math.floor(date.getTime() / 1000);
}
