// api.ts — typed API client for the Degree Planner backend
// All pages import from this file; change API_BASE here to point to your server.

export const API_BASE = "https://unf-deg-plan-evaluator.onrender.com";

// ── Types ─────────────────────────────────────────────────────────────────

export interface Course {
  code: string;
  name: string;
  credits: number;
  category: string;
  offered: string;
  prereqs: string[];
  tags: string[];
}

export interface CourseDetail extends Course {
  description: string;
  sections: Section[];
  unlocks: string[];
}

export interface Section {
  crn: string;
  days: number[];       // 0=Sun … 6=Sat
  startTime: string;
  endTime: string;
  dates: string;
  room: string;
  professor: string;
  format: string;
}

export interface Semester {
  name: string;   // "Spring" | "Summer" | "Fall"
  year: number;
}

// ── Semesters list (static, matches backend) ──────────────────────────────

export const SEMESTERS: Semester[] = [];
for (let y = 2024; y <= 2030; y++) {
  SEMESTERS.push({ name: "Spring", year: y });
  SEMESTERS.push({ name: "Summer", year: y });
  SEMESTERS.push({ name: "Fall",   year: y });
}

export function getCurrentSemesterIndex(): number {
  const now = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();
  const season = month <= 4 ? "Spring" : month <= 7 ? "Summer" : "Fall";
  const idx = SEMESTERS.findIndex(s => s.name === season && s.year === year);
  return idx >= 0 ? idx : 0;
}

// ── API functions ─────────────────────────────────────────────────────────

export async function fetchCourses(query?: string, filter?: string): Promise<Course[]> {
  const params = new URLSearchParams();
  if (query)  params.set("q",      query);
  if (filter) params.set("filter", filter);
  const url = `${API_BASE}/api/courses${params.toString() ? "?" + params : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET /api/courses failed: ${res.status}`);
  const data = await res.json();
  return data.courses as Course[];
}

export async function fetchCourse(code: string): Promise<CourseDetail> {
  const slug = code.replace(" ", "-");
  const res = await fetch(`${API_BASE}/api/courses/${slug}`);
  if (!res.ok) throw new Error(`GET /api/courses/${slug} failed: ${res.status}`);
  return res.json() as Promise<CourseDetail>;
}

// ── LocalStorage state helpers ────────────────────────────────────────────

export interface EnrolledCourse {
  code: string;
  crn: string;
  label: string;
  href: string;
  blocks: CourseBlock[];
}

export interface CourseBlock {
  day: number;
  startQ: number;   // 15-min quarter index from 6 AM (0 = 6:00 AM, 4 = 7:00 AM …)
  endQ: number;
}

function semKey(semIdx: number, name: string): string {
  return `cal_${semIdx}_${name}`;
}

export function getSemIdx(): number {
  const stored = localStorage.getItem("cal_semIdx");
  return stored !== null ? parseInt(stored) : getCurrentSemesterIndex();
}

export function setSemIdx(idx: number): void {
  localStorage.setItem("cal_semIdx", String(idx));
}

export function getEnrolled(semIdx: number): EnrolledCourse[] {
  return JSON.parse(localStorage.getItem(semKey(semIdx, "courses")) ?? "[]");
}

export function setEnrolled(semIdx: number, courses: EnrolledCourse[]): void {
  localStorage.setItem(semKey(semIdx, "courses"), JSON.stringify(courses));
}

export function getGreyedCols(semIdx: number): Set<number> {
  return new Set(JSON.parse(localStorage.getItem(semKey(semIdx, "greyedCols")) ?? "[]"));
}

export function setGreyedCols(semIdx: number, cols: Set<number>): void {
  localStorage.setItem(semKey(semIdx, "greyedCols"), JSON.stringify([...cols]));
}

export function getGreyedRows(semIdx: number): Set<number> {
  return new Set(JSON.parse(localStorage.getItem(semKey(semIdx, "greyedRows")) ?? "[]"));
}

export function setGreyedRows(semIdx: number, rows: Set<number>): void {
  localStorage.setItem(semKey(semIdx, "greyedRows"), JSON.stringify([...rows]));
}

/** All course codes completed BEFORE (not during) a given semester index. */
export function getCompletedCodes(semIdx: number): Set<string> {
  const completed = new Set<string>(["COP 2220"]); // hard-coded prior completion
  for (let i = 0; i < semIdx; i++) {
    getEnrolled(i).forEach(c => completed.add(c.code));
  }
  return completed;
}

/** Course codes enrolled in the current semester. */
export function getInProgressCodes(semIdx: number): Set<string> {
  return new Set(getEnrolled(semIdx).map(c => c.code));
}

// ── Time helpers ──────────────────────────────────────────────────────────

const START_HOUR = 6;

export function timeToQ(timeStr: string): number | null {
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const period = m[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return (h - START_HOUR) * 4 + Math.floor(min / 15);
}

export function timeToQEnd(timeStr: string): number | null {
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  let min = parseInt(m[2]);
  const period = m[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  min -= 1;
  if (min < 0) { min = 59; h -= 1; }
  return (h - START_HOUR) * 4 + Math.floor(min / 15);
}

export function hourLabel(h: number): string {
  if (h < 12)   return `${h}:00 AM`;
  if (h === 12) return `12:00 PM`;
  return `${h - 12}:00 PM`;
}

// ── Navigation helper ─────────────────────────────────────────────────────

export const PAGES = {
  landing:  "landing-page.html",
  calendar: "calendar.html",
  planner:  "degree-planner.html",
  catalog:  "catalog.html",
} as const;

export function nav(page: keyof typeof PAGES, params?: Record<string, string>): void {
  let url = PAGES[page];
  if (params) {
    const p = new URLSearchParams(params);
    url += "?" + p.toString();
  }
  window.location.href = url;
}
