// evaluator.js — Task definitions and shared state helpers for the evaluation mode

// Semester indices in the app's 0-based list (Spring/Summer/Fall repeating from 2024)
// Spring 2024=0, Summer 2024=1, Fall 2024=2, Spring 2025=3, ..., Spring 2026=6, Summer 2026=7
const SPRING_2026_IDX = 6;
const SUMMER_2026_IDX = 7;

// CS-department courses that count as "core computing" for the BSCS degree
const CORE_COMPUTING_CODES = new Set([
  "COP 2220", "COT 3100", "CIS 3253", "COP 3503", "CDA 3100",
  "COT 3210", "COP 3530", "CNT 4504", "COP 3703", "COP 3404",
  "COP 4620", "CEN 4010", "COT 4400", "CAP 4630", "COP 4610",
]);

// Work shift: Monday=1, Wednesday=3, Friday=5
// Time quarters from 6 AM (1 quarter = 15 min): 9AM = q12, 1PM = q28 (exclusive end)
const WORK_DAYS    = new Set([1, 3, 5]);
const WORK_START_Q = 12; // 9:00 AM
const WORK_END_Q   = 28; // 1:00 PM (exclusive)

// Removes every greyedCols/greyedRows key the calendar could have written,
// regardless of which semester the user was on during a previous task.
function clearAllGreyedFilters() {
  for (let i = 0; i < 24; i++) {
    localStorage.removeItem(`cal_${i}_greyedCols`);
    localStorage.removeItem(`cal_${i}_greyedRows`);
  }
}

export const TASKS = [
  {
    id: 1,
    title: "Adding Courses",
    shortDesc: "Add two Spring 2026 courses that don't conflict with your work shift.",
    description:
      "You are a sophomore working the opening shift (9 AM – 1 PM) at Chick-fil-A " +
      "on Monday, Wednesday, and Friday during the Spring 2026 semester. " +
      "Add two courses to your Spring 2026 schedule with the following constraints:\n\n" +
      "• The two courses may total no more than 6 credit hours combined.\n" +
      "• Neither course may overlap with your work shift (Mon/Wed/Fri 9 AM – 1 PM).\n" +
      "• At most one of the two courses may be an online course.\n" +
      "• At least one course must be a core computing course " +
      "(e.g. COP 3503, COP 3530, COT 3100, CDA 3100, or similar).",
    hint: "Navigate to the Course Catalog, search for a core computing course, " +
          "check its section times, and enroll in a section that does not meet " +
          "on Mon/Wed/Fri between 9 AM and 1 PM. Repeat for a second course. " +
          "Keep the total credit hours at or below 6.",
    startPage: "../landing-page.html",
    // Ensure the app targets Spring 2026 and starts with a blank calendar.
    setup() {
      clearAllGreyedFilters();
      localStorage.setItem("cal_semIdx", String(SPRING_2026_IDX));
      localStorage.setItem(`cal_${SPRING_2026_IDX}_courses`, "[]");
    },
    check(iframeSrc) {
      try {
        const enrolled = JSON.parse(
          localStorage.getItem(`cal_${SPRING_2026_IDX}_courses`) || "[]"
        );
        if (enrolled.length < 2) return false;

        // Credits lookup for all Spring 2026 courses (from courses.csv)
        const CREDITS = {
          "BSC 2010C":3,"BSC 2011C":3,"CAP 4630":3,"CAP 4770":3,"CDA 3100":3,
          "CDA 4205":3,"CEN 4010":3,"CEN 4072":3,"CHM 2045C":4,"CHM 2046C":4,
          "CIS 3253":3,"CIS 4360":3,"CNT 4504":3,"CNT 4713":3,"COP 2220":3,
          "COP 3404":3,"COP 3503":3,"COP 3530":3,"COP 3703":3,"COP 4331":3,
          "COP 4610":3,"COP 4620":3,"COT 3100":3,"COT 3210":3,"COT 4400":3,
          "MAC 1147":3,"MAC 2311":4,"MAC 2312":4,"MAS 3105":3,"PHY 2048C":4,
          "PHY 2049":4,"SPC 1608":3,"SPC 2600":3,"SPC 2608":3,"SPC 3710":3,
          "STA 3032":3,
        };
        const totalCredits = enrolled.reduce((s, c) => s + (CREDITS[c.code] || 3), 0);
        if (totalCredits > 6) return false; // exceeds 6-credit cap

        let onlineCount = 0;
        let coreCount   = 0;

        for (const course of enrolled) {
          const isOnline = !course.blocks || course.blocks.length === 0;
          if (isOnline) { onlineCount++; continue; }

          // Check for work-shift conflict on MWF
          for (const block of course.blocks) {
            if (
              WORK_DAYS.has(block.day) &&
              block.startQ < WORK_END_Q &&
              block.endQ   >= WORK_START_Q
            ) {
              return false; // conflicts with work shift
            }
          }
        }

        // Re-pass to count core courses (online ones can still be core)
        for (const course of enrolled) {
          if (CORE_COMPUTING_CODES.has(course.code)) coreCount++;
        }

        if (onlineCount > 1) return false; // too many online
        if (coreCount   < 1) return false; // no core computing course

        return true;
      } catch {
        return false;
      }
    }
  },
  {
    id: 2,
    title: "Dropping Courses",
    shortDesc: "Drop one course from your Spring 2026 schedule while staying above 9 credit hours.",
    description:
      "You are currently enrolled in 12 credit hours for Spring 2026, but balancing " +
      "your classes with your part-time job has become too demanding. You have decided " +
      "to lighten your load by dropping one course.\n\n" +
      "Your current schedule:\n" +
      "• CIS 3253 – Legal & Ethical Issues (Online)\n" +
      "• CDA 3100 – Computer Organization (MWF 11:00 AM – 11:50 AM)\n" +
      "• SPC 1608 – Public Speaking (MW 3:05 PM – 4:20 PM)\n" +
      "• COP 3503 – Data Structures (TTh 9:30 AM – 10:45 AM)\n\n" +
      "Constraint: You must remain enrolled in at least 9 credit hours.",
    hint: "Click on a course block in the calendar to open its detail page, " +
          "then click the 'Drop Course' button.",
    startPage: "../calendar.html",

    // Pre-populate Spring 2026 (index 6) with exactly the 4 specified courses.
    // Called by the shell before the iframe loads so the calendar renders the
    // correct schedule immediately.
    setup() {
      // Time-quarter helpers  (1 quarter = 15 min from 6 AM)
      // CDA 3100  11:00–11:50 AM  MWF   → startQ 20, endQ 23
      // SPC 1608   3:05–4:20 PM  MW    → startQ 36, endQ 41
      // COP 3503   9:30–10:45 AM TTh   → startQ 14, endQ 18
      const courses = [
        {
          code:   "CIS 3253",
          crn:    "820103",
          label:  "CIS 3253 (Online)",
          href:   "courses/course-cis-3253.html",
          blocks: []
        },
        {
          code:   "CDA 3100",
          crn:    "820042",
          label:  "CDA 3100 (11:00 AM-11:50 AM)",
          href:   "courses/course-cda-3100.html",
          blocks: [
            { day: 1, startQ: 20, endQ: 23 },
            { day: 3, startQ: 20, endQ: 23 },
            { day: 5, startQ: 20, endQ: 23 }
          ]
        },
        {
          code:   "SPC 1608",
          crn:    "820312",
          label:  "SPC 1608 (3:05 PM-4:20 PM)",
          href:   "courses/course-spc-1608.html",
          blocks: [
            { day: 1, startQ: 36, endQ: 41 },
            { day: 3, startQ: 36, endQ: 41 }
          ]
        },
        {
          code:   "COP 3503",
          crn:    "482910",
          label:  "COP 3503 (9:30 AM-10:45 AM)",
          href:   "courses/course-cop-3503.html",
          blocks: [
            { day: 2, startQ: 14, endQ: 18 },
            { day: 4, startQ: 14, endQ: 18 }
          ]
        }
      ];
      localStorage.setItem(`cal_${SPRING_2026_IDX}_courses`, JSON.stringify(courses));
      localStorage.setItem("cal_semIdx", String(SPRING_2026_IDX));
      clearAllGreyedFilters();
    },

    check(iframeSrc) {
      try {
        const PRELOADED = new Set(["CIS 3253", "CDA 3100", "SPC 1608", "COP 3503"]);
        const enrolled  = JSON.parse(
          localStorage.getItem(`cal_${SPRING_2026_IDX}_courses`) || "[]"
        );
        const enrolledCodes = new Set(enrolled.map(c => c.code));

        const dropped   = [...PRELOADED].filter(code => !enrolledCodes.has(code));
        const remaining = [...PRELOADED].filter(code =>  enrolledCodes.has(code));

        // At least 1 pre-loaded course dropped AND ≥ 3 of the originals remain (= 9 credits)
        return dropped.length >= 1 && remaining.length >= 3;
      } catch {
        return false;
      }
    }
  },
  {
    id: 3,
    title: "Planning a Summer Semester",
    shortDesc: "Add at least two Summer 2026 courses without exceeding 6 credit hours.",
    description:
      "You want to stay on track for graduation and are planning to take courses " +
      "during the Summer 2026 semester.\n\n" +
      "Navigate to the Summer 2026 schedule and add at least two courses with the " +
      "following constraints:\n\n" +
      "• All selected courses must be offered in Summer 2026.\n" +
      "• Total planned credits must not exceed 6 credit hours.",
    hint: "Use the arrow buttons on the calendar to move from Spring 2026 to Summer 2026, " +
          "then search the Course Catalog for courses offered in Summer (look for 'Su' " +
          "in the offered terms).",
    startPage: "../calendar.html",

    // Preserve the Spring 2026 schedule from Task 2; only clear Summer 2026.
    // Also pre-fetch course metadata so check() can validate credits and offered terms.
    setup() {
      clearAllGreyedFilters();
      localStorage.setItem("cal_semIdx", String(SPRING_2026_IDX));
      localStorage.setItem(`cal_${SUMMER_2026_IDX}_courses`, "[]");

      fetch("https://unf-deg-plan-evaluator.onrender.com/api/courses")
        .then(r => r.json())
        .then(data => {
          const meta = {};
          (data.courses || []).forEach(c => {
            meta[c.code] = { credits: c.credits, offered: c.offered || "" };
          });
          localStorage.setItem("eval_t3_meta", JSON.stringify(meta));
        })
        .catch(() => {}); // silently fail — check() has safe defaults
    },

    check(iframeSrc) {
      try {
        const enrolled = JSON.parse(
          localStorage.getItem(`cal_${SUMMER_2026_IDX}_courses`) || "[]"
        );
        if (enrolled.length < 2) return false;

        const meta = JSON.parse(localStorage.getItem("eval_t3_meta") || "{}");

        // Total credits must not exceed 6 (default 3 per course if metadata not yet loaded)
        const totalCredits = enrolled.reduce(
          (sum, c) => sum + ((meta[c.code] && meta[c.code].credits) || 3), 0
        );
        if (totalCredits > 6) return false;

        // Every course must be offered in Summer
        const allOfferedSummer = enrolled.every(c => {
          if (!meta[c.code]) return true; // metadata not loaded yet — skip check
          return meta[c.code].offered.includes("Su");
        });
        return allOfferedSummer;
      } catch {
        return false;
      }
    }
  },
  {
    id: 4,
    title: "Adding a Course via Search Catalog",
    shortDesc: "Search the course catalog and add one course to your Spring 2026 schedule.",
    description:
      "You enjoy building your schedule your own way and like exploring the course " +
      "catalog to find the perfect class that fits your interests and preferred times.\n\n" +
      "Your current Spring 2026 schedule:\n" +
      "• CDA 3100 – Computer Organization (MWF 11:00 AM – 11:50 AM)\n" +
      "• SPC 1608 – Public Speaking (MW 3:05 PM – 4:20 PM)\n" +
      "• COP 3503 – Programming II (TTh 9:30 AM – 10:45 AM)\n\n" +
      "Use the Course Catalog to search for and add one course to your Spring 2026 " +
      "schedule with the following constraint:\n\n" +
      "• The course must fit within your existing schedule without time conflicts.",
    hint: "Click 'Course Catalog' in the top navigation bar, search for any course, " +
          "open its detail page, select a section that does not overlap your current " +
          "classes, and click Enroll.",
    startPage: "../calendar.html",
    setup() {
      clearAllGreyedFilters();
      const courses = [
        {
          code:   "CDA 3100",
          crn:    "820042",
          label:  "CDA 3100 (11:00 AM-11:50 AM)",
          href:   "courses/course-cda-3100.html",
          blocks: [
            { day: 1, startQ: 20, endQ: 23 },
            { day: 3, startQ: 20, endQ: 23 },
            { day: 5, startQ: 20, endQ: 23 }
          ]
        },
        {
          code:   "SPC 1608",
          crn:    "820312",
          label:  "SPC 1608 (3:05 PM-4:20 PM)",
          href:   "courses/course-spc-1608.html",
          blocks: [
            { day: 1, startQ: 36, endQ: 41 },
            { day: 3, startQ: 36, endQ: 41 }
          ]
        },
        {
          code:   "COP 3503",
          crn:    "482910",
          label:  "COP 3503 (9:30 AM-10:45 AM)",
          href:   "courses/course-cop-3503.html",
          blocks: [
            { day: 2, startQ: 14, endQ: 18 },
            { day: 4, startQ: 14, endQ: 18 }
          ]
        }
      ];
      localStorage.setItem(`cal_${SPRING_2026_IDX}_courses`, JSON.stringify(courses));
      localStorage.setItem("cal_semIdx", String(SPRING_2026_IDX));
      localStorage.removeItem("eval_t4_catalog_code");
    },
    check(iframeSrc) {
      try {
        const PRELOADED = new Set(["CDA 3100", "SPC 1608", "COP 3503"]);

        // The catalog stores the code the user clicked before navigating to the detail page
        const catalogCode = localStorage.getItem("eval_t4_catalog_code");
        if (!catalogCode) return false;

        const enrolled = JSON.parse(
          localStorage.getItem(`cal_${SPRING_2026_IDX}_courses`) || "[]"
        );

        // The specific course clicked in the catalog must now be enrolled
        // and must not have been in the pre-loaded schedule
        const enrolledCodes = new Set(enrolled.map(c => c.code));
        return enrolledCodes.has(catalogCode) && !PRELOADED.has(catalogCode);
      } catch {
        return false;
      }
    }
  },
];

// ── State helpers ─────────────────────────────────────────────────────────────

export function getEvalState() {
  try {
    return JSON.parse(localStorage.getItem("eval_state") || "{}");
  } catch {
    return {};
  }
}

export function setEvalState(state) {
  localStorage.setItem("eval_state", JSON.stringify(state));
}

/** Call when the user clicks Begin inside the shell (timer starts here). */
export function beginTask(taskId) {
  const state = getEvalState();
  state.activeTaskId = taskId;
  state.taskStartTime = Date.now();
  setEvalState(state);
}

/** Call when the task is successfully completed. */
export function completeTask(taskId, elapsed, clicks) {
  const state = getEvalState();
  state.activeTaskId = null;
  state.taskStartTime = null;
  if (!state.completedTasks) state.completedTasks = {};
  state.completedTasks[taskId] = { elapsed, completedAt: Date.now(), clicks: clicks || 0 };
  setEvalState(state);
}

/** Call when the user quits a task. */
export function quitTask() {
  const state = getEvalState();
  state.activeTaskId = null;
  state.taskStartTime = null;
  setEvalState(state);
}

export function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function getTaskById(id) {
  return TASKS.find(t => t.id === id) || null;
}

export function getNextTask(currentId) {
  return TASKS.find(t => t.id === currentId + 1) || null;
}
