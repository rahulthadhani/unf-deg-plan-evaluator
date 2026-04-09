"""
Degree Planner API - FastAPI backend
Run: uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Degree Planner API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"
COURSES_CSV = DATA_DIR / "courses.csv"
PREREQS_CSV = DATA_DIR / "prereqs.csv"
SECTIONS_CSV = DATA_DIR / "sections.csv"


def _split_pipe(value: str) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split("|") if part.strip()]


def _normalize_code(code: str) -> str:
    return code.upper().replace("-", " ").strip()


def _load_courses_base() -> tuple[list[dict], dict[str, str]]:
    courses: list[dict] = []
    descriptions: dict[str, str] = {}
    with COURSES_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = _normalize_code(row["code"])
            description = (row.get("description") or "").strip()
            courses.append(
                {
                    "code": code,
                    "name": (row.get("name") or "").strip(),
                    "credits": int(row.get("credits") or 0),
                    "category": (row.get("category") or "").strip(),
                    "offered": (row.get("offered") or "").strip(),
                    "tags": _split_pipe(row.get("tags") or ""),
                    "prereqs": [],
                }
            )
            if description:
                descriptions[code] = description
    return courses, descriptions


def _load_prereqs() -> dict[str, list[str]]:
    prereq_map: dict[str, list[str]] = defaultdict(list)
    with PREREQS_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            course = _normalize_code(row.get("course_code") or "")
            prereq = _normalize_code(row.get("prereq_code") or "")
            if course and prereq:
                prereq_map[course].append(prereq)
    return prereq_map


def _load_sections() -> dict[str, list[dict]]:
    sections: dict[str, list[dict]] = defaultdict(list)
    with SECTIONS_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = _normalize_code(row.get("course_code") or "")
            if not code:
                continue
            days = [int(d) for d in _split_pipe(row.get("days") or "") if d.isdigit()]
            sections[code].append(
                {
                    "crn": (row.get("crn") or "").strip(),
                    "days": days,
                    "startTime": (row.get("start_time") or "").strip(),
                    "endTime": (row.get("end_time") or "").strip(),
                    "dates": (row.get("dates") or "").strip(),
                    "room": (row.get("room") or "").strip(),
                    "professor": (row.get("professor") or "").strip(),
                    "format": (row.get("format") or "").strip(),
                }
            )
    return sections


def _assemble_data() -> tuple[list[dict], dict[str, dict], dict[str, str], dict[str, list[dict]], dict[str, list[str]]]:
    courses, descriptions = _load_courses_base()
    prereq_map = _load_prereqs()
    sections = _load_sections()
    unlocks: dict[str, list[str]] = defaultdict(list)

    for c in courses:
        c["prereqs"] = prereq_map.get(c["code"], [])
        for prereq in c["prereqs"]:
            unlocks[prereq].append(c["code"])

    course_by_code = {c["code"]: c for c in courses}
    return courses, course_by_code, descriptions, sections, unlocks


COURSES, COURSE_BY_CODE, COURSE_DESCRIPTIONS, SECTIONS, UNLOCKS = _assemble_data()

# Courses in the BSCS core/required flow should never appear in CS elective filtering.
BSCS_REQUIRED_CODES = {
    "MAC 1147", "MAC 2311", "MAC 2312", "MAS 3105", "STA 3032",
    "PHY 2048C", "PHY 2049",
    "COP 2220", "COT 3100", "CIS 3253", "COP 3503", "CDA 3100",
    "COT 3210", "COP 3530", "CNT 4504", "COP 3703", "COP 3404",
    "COP 4620", "CEN 4010", "COT 4400", "CAP 4630", "COP 4610",
}


# ---------------------------------------------------------------------------
# Semester helpers
# ---------------------------------------------------------------------------

def all_semesters() -> list[dict]:
    sems = []
    for y in range(2024, 2031):
        for name in ("Spring", "Summer", "Fall"):
            sems.append({"name": name, "year": y})
    return sems


# ---------------------------------------------------------------------------
# Recommendation models and helpers
# ---------------------------------------------------------------------------

TERM_TO_TOKEN = {"spring": "S", "summer": "SU", "fall": "F"}
START_HOUR = 6


class TimeBlock(BaseModel):
    day: int = Field(ge=0, le=6)
    startQ: int = Field(ge=0)
    endQ: int = Field(ge=0)


class InProgressCourse(BaseModel):
    code: str
    blocks: list[TimeBlock] = Field(default_factory=list)


class RecommendPlanRequest(BaseModel):
    term: str = Field(default="Spring", description="Spring | Summer | Fall")
    completed_codes: list[str] = Field(default_factory=list)
    in_progress: list[InProgressCourse] = Field(default_factory=list)
    blocked_days: list[int] = Field(default_factory=list)
    blocked_hours: list[int] = Field(default_factory=list, description="Hour rows where 0 means 6:00-6:59")
    max_credits: int = Field(default=15, ge=3, le=21)
    max_courses: int = Field(default=5, ge=1, le=8)
    top_n: int = Field(default=3, ge=1, le=5)
    include_online: bool = True
    prefer_categories: list[str] = Field(default_factory=list)
    avoid_categories: list[str] = Field(default_factory=list)


def _time_to_q(time_str: str) -> Optional[int]:
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$", time_str or "", flags=re.I)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2))
    period = m.group(3).upper()
    if period == "PM" and hour != 12:
        hour += 12
    if period == "AM" and hour == 12:
        hour = 0
    return (hour - START_HOUR) * 4 + (minute // 15)


def _time_to_q_end(time_str: str) -> Optional[int]:
    q = _time_to_q(time_str)
    if q is None:
        return None
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$", time_str or "", flags=re.I)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2)) - 1
    period = m.group(3).upper()
    if period == "PM" and hour != 12:
        hour += 12
    if period == "AM" and hour == 12:
        hour = 0
    if minute < 0:
        minute = 59
        hour -= 1
    return (hour - START_HOUR) * 4 + (minute // 15)


def _offered_in_term(course: dict, term: str) -> bool:
    token = TERM_TO_TOKEN.get((term or "").strip().lower())
    if not token:
        return True
    offered = (course.get("offered") or "").upper().replace(" ", "")
    parts = [p for p in offered.split(",") if p]
    return token in parts


def _section_to_blocks(section: dict) -> list[dict]:
    days = section.get("days") or []
    if not days:
        return []
    sq = _time_to_q(section.get("startTime") or "")
    eq = _time_to_q_end(section.get("endTime") or "")
    if sq is None or eq is None:
        return []
    return [{"day": int(d), "startQ": sq, "endQ": eq} for d in days]


def _overlap(a: dict, b: dict) -> bool:
    if a["day"] != b["day"]:
        return False
    return a["startQ"] <= b["endQ"] and b["startQ"] <= a["endQ"]


def _conflicts_with_blocked(section_blocks: list[dict], blocked_days: set[int], blocked_hours: set[int]) -> bool:
    if any(b["day"] in blocked_days for b in section_blocks):
        return True
    for b in section_blocks:
        for h in range(b["startQ"] // 4, b["endQ"] // 4 + 1):
            if h in blocked_hours:
                return True
    return False


def _conflicts_with_occupied(section_blocks: list[dict], occupied: list[dict]) -> bool:
    for sb in section_blocks:
        for ob in occupied:
            if _overlap(sb, ob):
                return True
    return False


def _descendant_counts() -> dict[str, int]:
    memo: dict[str, set[str]] = {}

    def dfs(code: str) -> set[str]:
        if code in memo:
            return memo[code]
        seen: set[str] = set()
        for nxt in UNLOCKS.get(code, []):
            seen.add(nxt)
            seen.update(dfs(nxt))
        memo[code] = seen
        return seen

    return {c["code"]: len(dfs(c["code"])) for c in COURSES}


DESC_COUNTS = _descendant_counts()


def _compatible_sections(
    code: str,
    blocked_days: set[int],
    blocked_hours: set[int],
    include_online: bool,
) -> list[dict]:
    out: list[dict] = []
    for sec in SECTIONS.get(code, []):
        blocks = _section_to_blocks(sec)
        is_online = len(blocks) == 0
        if is_online and not include_online:
            continue
        if not is_online and _conflicts_with_blocked(blocks, blocked_days, blocked_hours):
            continue
        out.append({**sec, "blocks": blocks, "isOnline": is_online})
    return out


def _course_score(course: dict, req: RecommendPlanRequest) -> tuple[float, list[str]]:
    code = course["code"]
    reasons: list[str] = []
    score = 10.0
    direct_unlocks = len(UNLOCKS.get(code, []))
    if direct_unlocks:
        score += 4.0 * direct_unlocks
        reasons.append(f"Unlocks {direct_unlocks} direct follow-on course(s)")
    downstream = DESC_COUNTS.get(code, 0)
    if downstream:
        score += 1.5 * downstream
        reasons.append(f"Important prerequisite path ({downstream} downstream course(s))")
    category = (course.get("category") or "").strip().lower()
    if any(category == c.strip().lower() for c in req.prefer_categories):
        score += 2.5
        reasons.append("Matches preferred category")
    if any(category == c.strip().lower() for c in req.avoid_categories):
        score -= 2.5
        reasons.append("Avoid-category penalty")
    if not reasons:
        reasons.append("Fits current prerequisites and term")
    return score, reasons


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"message": "Degree Planner API is running."}


@app.get("/api/courses")
def get_courses(
    q: Optional[str] = Query(None, description="Text search"),
    filter: Optional[str] = Query(None, description="Tag filter: elective | science | speech | cs"),
):
    """Return courses, optionally filtered by tag and/or text search."""
    pool = list(COURSES)

    filter_tags = {
        "elective": lambda c: (
            "elective" in c["tags"]
            and bool(re.match(r"^(CAP|CDA|CEN|CIS|CNT|COP|COT)\s[34]", c["code"]))
            and (c.get("category") or "").strip().lower() != "cs core"
            and c["code"] not in BSCS_REQUIRED_CODES
        ),
        "science": lambda c: "science" in c["tags"],
        "speech": lambda c: "speech" in c["tags"],
        "cs": lambda c: "cs" in c["tags"],
    }

    if filter and filter in filter_tags:
        pool = [c for c in pool if filter_tags[filter](c)]

    if q:
        ql = q.lower()
        pool = [
            c for c in pool
            if ql in c["code"].lower()
            or ql in c["name"].lower()
            or ql in c["category"].lower()
            or any(ql in p.lower() for p in c["prereqs"])
        ]

    return {"courses": pool, "total": len(pool)}


@app.get("/api/courses/{code}")
def get_course(code: str):
    """Return a single course by code (e.g. COP%203503)."""
    code = _normalize_code(code)
    course = COURSE_BY_CODE.get(code)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return {
        **course,
        "description": COURSE_DESCRIPTIONS.get(code, ""),
        "sections": SECTIONS.get(code, []),
        "unlocks": UNLOCKS.get(code, []),
    }


@app.get("/api/semesters")
def get_semesters():
    """Return the full list of semesters."""
    return {"semesters": all_semesters()}


@app.get("/api/prereqs/{code}")
def get_prereqs(code: str):
    """Return prereq chain and unlock list for a course."""
    code = _normalize_code(code)
    course = COURSE_BY_CODE.get(code)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return {
        "code": code,
        "prereqs": course["prereqs"],
        "unlocks": UNLOCKS.get(code, []),
    }


@app.post("/api/recommend-plan")
def recommend_plan(req: RecommendPlanRequest):
    """
    Suggest top class plans for a term.
    Honors:
      - completed/in-progress history
      - prerequisites and term offerings
      - blocked days/hours and enrolled-block conflicts
      - max credits / max classes
    """
    completed = {_normalize_code(c) for c in req.completed_codes}
    completed.add("COP 2220")  # keep existing app baseline behavior
    in_progress_codes = {_normalize_code(c.code) for c in req.in_progress}
    blocked_days = set(req.blocked_days)
    blocked_hours = set(req.blocked_hours)

    occupied: list[dict] = []
    for c in req.in_progress:
        for b in c.blocks:
            occupied.append({"day": b.day, "startQ": b.startQ, "endQ": b.endQ})

    # Build eligible candidate courses with base scores and compatible section pools.
    candidates: list[dict] = []
    skipped: list[dict] = []
    for course in COURSES:
        code = course["code"]
        if code in completed or code in in_progress_codes:
            continue
        if not _offered_in_term(course, req.term):
            skipped.append({"code": code, "reason": f"Not offered in {req.term}"})
            continue
        if not all(pr in completed for pr in course["prereqs"]):
            skipped.append({"code": code, "reason": "Prerequisites not satisfied"})
            continue

        sections = _compatible_sections(
            code=code,
            blocked_days=blocked_days,
            blocked_hours=blocked_hours,
            include_online=req.include_online,
        )
        if not sections:
            skipped.append({"code": code, "reason": "No compatible sections for blocked times"})
            continue

        base_score, reasons = _course_score(course, req)
        # Slight bonus for classes with fewer sections (take constrained offerings earlier).
        scarcity_bonus = max(0.0, 1.5 - 0.3 * len(sections))
        candidates.append(
            {
                "course": course,
                "sections": sections,
                "base_score": base_score + scarcity_bonus,
                "reasons": reasons,
            }
        )

    # Highest-impact classes first.
    candidates.sort(key=lambda x: x["base_score"], reverse=True)

    # Beam search over feasible schedules.
    beam_width = 60
    states = [
        {
            "selected": [],  # list[dict(course, section, reasons, score)]
            "credits": 0,
            "score": 0.0,
            "occupied": list(occupied),
        }
    ]

    for cand in candidates:
        nxt_states = list(states)  # skip branch
        c = cand["course"]
        c_credits = int(c.get("credits", 0))

        for st in states:
            if len(st["selected"]) >= req.max_courses:
                continue
            if st["credits"] + c_credits > req.max_credits:
                continue

            for sec in cand["sections"]:
                sec_blocks = sec["blocks"]
                if _conflicts_with_occupied(sec_blocks, st["occupied"]):
                    continue

                sec_bonus = 0.2 if not sec["isOnline"] else -0.2
                chosen = {
                    "course": c,
                    "section": sec,
                    "reasons": cand["reasons"],
                    "score": cand["base_score"] + sec_bonus,
                }
                nxt_states.append(
                    {
                        "selected": st["selected"] + [chosen],
                        "credits": st["credits"] + c_credits,
                        "score": st["score"] + cand["base_score"] + sec_bonus,
                        "occupied": st["occupied"] + sec_blocks,
                    }
                )

        nxt_states.sort(key=lambda s: (s["score"], s["credits"], len(s["selected"])), reverse=True)
        states = nxt_states[:beam_width]

    # Unique, meaningful plans sorted by quality.
    states.sort(key=lambda s: (s["score"], s["credits"], len(s["selected"])), reverse=True)
    seen_signatures: set[tuple[str, ...]] = set()
    plans: list[dict] = []
    for st in states:
        if not st["selected"]:
            continue
        sig = tuple(sorted(item["course"]["code"] for item in st["selected"]))
        if sig in seen_signatures:
            continue
        seen_signatures.add(sig)

        selected_courses = []
        for item in st["selected"]:
            c = item["course"]
            sec = item["section"]
            selected_courses.append(
                {
                    "code": c["code"],
                    "name": c["name"],
                    "credits": c["credits"],
                    "category": c["category"],
                    "score": round(item["score"], 2),
                    "reasons": item["reasons"],
                    "chosen_section": {
                        "crn": sec.get("crn", ""),
                        "days": sec.get("days", []),
                        "startTime": sec.get("startTime", ""),
                        "endTime": sec.get("endTime", ""),
                        "format": sec.get("format", ""),
                    },
                }
            )
        plans.append(
            {
                "total_credits": st["credits"],
                "course_count": len(st["selected"]),
                "plan_score": round(st["score"], 2),
                "courses": selected_courses,
            }
        )
        if len(plans) >= req.top_n:
            break

    return {
        "term": req.term,
        "constraints": {
            "max_credits": req.max_credits,
            "max_courses": req.max_courses,
            "include_online": req.include_online,
            "blocked_days": sorted(blocked_days),
            "blocked_hours": sorted(blocked_hours),
        },
        "candidate_count": len(candidates),
        "skipped_count": len(skipped),
        "skipped_preview": skipped[:20],
        "plans": plans,
    }
