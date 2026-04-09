(function () {
  const API = "http://localhost:8000";
  const START_HOUR = 6;
  const MAX_COURSES_PER_SEMESTER = 6;
  const codeParam = new URLSearchParams(location.search).get("code");
  const CODE = (window.COURSE_CODE || codeParam || "").trim().toUpperCase().replace(/-/g, " ");
  if (!CODE) {
    location.href = "catalog.html";
    return;
  }

  function slug(code) { return code.toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
  function courseHref(code) { return `courses/course-${slug(code)}.html`; }
  function semKey(semIdx, key) { return `cal_${semIdx}_${key}`; }
  function getSemIdx() { return parseInt(localStorage.getItem("cal_semIdx") || "0"); }
  function getEnrolled(semIdx) { return JSON.parse(localStorage.getItem(semKey(semIdx, "courses")) || "[]"); }
  function setEnrolled(semIdx, courses) { localStorage.setItem(semKey(semIdx, "courses"), JSON.stringify(courses)); }
  function getCompletedCodes(semIdx) {
    const s = new Set(["COP 2220"]);
    for (let i = 0; i < semIdx; i++) getEnrolled(i).forEach(c => s.add(c.code));
    return s;
  }
  function getInProgressCodes(semIdx) { return new Set(getEnrolled(semIdx).map(c => c.code)); }
  function tQ(t) {
    const m = String(t || "").match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return null;
    let h = +m[1], min = +m[2], p = m[3].toUpperCase();
    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;
    return (h - START_HOUR) * 4 + Math.floor(min / 15);
  }
  function tQEnd(t) {
    const m = String(t || "").match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return null;
    let h = +m[1], min = +m[2] - 1, p = m[3].toUpperCase();
    if (p === "PM" && h !== 12) h += 12;
    if (p === "AM" && h === 12) h = 0;
    if (min < 0) { min = 59; h -= 1; }
    return (h - START_HOUR) * 4 + Math.floor(min / 15);
  }
  function dayLabel(days) {
    const D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return (days && days.length) ? days.map(d => D[d]).join("/") : "Online";
  }
  function overlaps(aStart, aEnd, bStart, bEnd) { return aStart <= bEnd && bStart <= aEnd; }

  // Returns true if a section belongs to the given semester.
  // Matches by checking whether the section's start-date month falls in the
  // expected range for Spring (Jan–Apr), Summer (May–Jul), or Fall (Aug–Dec).
  const SPRING_MONTHS = new Set(["January","February","March","April"]);
  const SUMMER_MONTHS = new Set(["May","June","July"]);
  const FALL_MONTHS   = new Set(["August","September","October","November","December"]);
  function sectionMatchesSem(section, semName, semYear) {
    const dates = (section.dates || "").trim();
    if (!dates) return true; // no date info — include in all semesters
    const m = dates.match(/^(\w+)\s+\d+,\s+(\d{4})/);
    if (!m) return true;
    if (parseInt(m[2]) !== semYear) return false;
    if (semName === "Spring") return SPRING_MONTHS.has(m[1]);
    if (semName === "Summer") return SUMMER_MONTHS.has(m[1]);
    if (semName === "Fall")   return FALL_MONTHS.has(m[1]);
    return true;
  }

  const semIdx = getSemIdx();
  const SEMS = [];
  for (let y = 2024; y <= 2030; y++) { SEMS.push({ name: "Spring", year: y }); SEMS.push({ name: "Summer", year: y }); SEMS.push({ name: "Fall", year: y }); }
  const sem = SEMS[semIdx] || SEMS[0];
  const semStr = `${sem.name} ${sem.year}`;
  document.getElementById("sem-disp").textContent = semStr;

  const actionBtn = document.getElementById("action-btn");
  const sectionsEl = document.getElementById("sections-list");
  let selectedCrn = null;
  let sections = [];
  let current = null;

  function getEnrolledRecord() { return getEnrolled(semIdx).find(c => c.code === CODE) || null; }
  function completedPreviously() { return getCompletedCodes(semIdx).has(CODE); }
  function prereqsSatisfied() {
    if (!current || !Array.isArray(current.prereqs) || !current.prereqs.length) return true;
    const completed = getCompletedCodes(semIdx);
    return current.prereqs.every(p => completed.has(p));
  }
  function hasCompatibleSectionCards() {
    const cards = [...document.querySelectorAll(".section-card")];
    if (!cards.length) return false;
    return cards.some(c => !c.classList.contains("conflicted"));
  }

  function buildChart(prereqs, unlocks) {
    const ct = document.getElementById("prereq-chart");
    const prereqRows = Math.max(prereqs.length, 1);
    const unlockRows = Math.max(unlocks.length, 1);
    const NH = 26, NW = 250, XL = 8, CH = NH + 7;
    const y0 = 0, y1 = y0 + prereqRows * CH + 8, y2 = y1 + NH + 18;
    const TH = y2 + unlockRows * CH + 8, TW = NW + XL + 10, XM = XL + NW / 2;
    ct.style.cssText = `position:relative;width:${TW}px;height:${TH}px;`;
    ct.innerHTML = "";

    const completed = getCompletedCodes(semIdx);
    const ip = getInProgressCodes(semIdx);
    function state(code) {
      if (completed.has(code)) return "completed";
      if (ip.has(code)) return "inprogress";
      return "none";
    }
    function box(y, label, st, isCurrent) {
      const el = document.createElement("div");
      el.style.cssText = `position:absolute;left:${XL}px;top:${y}px;width:${NW}px;height:${NH}px;font-size:11px;font-weight:700;font-family:var(--font);display:flex;align-items:center;padding:0 10px;overflow:hidden;box-sizing:border-box;border:1px solid var(--border);background:var(--white);color:var(--text);`;
      if (isCurrent) {
        el.style.borderColor = "var(--navy)";
        el.style.background = "#eef3fb";
        el.style.color = "var(--navy)";
      } else if (st === "completed") {
        el.style.borderColor = "var(--green)";
        el.style.background = "var(--green-light)";
        el.style.color = "var(--green)";
        label = "✓ " + label;
      } else if (st === "inprogress") {
        el.style.borderColor = "var(--gold)";
        el.style.background = "var(--gold-light)";
      } else {
        el.style.borderColor = "#ddd";
        el.style.background = "#fafafa";
        el.style.color = "var(--text-light)";
      }
      el.textContent = label;
      ct.appendChild(el);
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", TW);
    svg.setAttribute("height", TH);
    svg.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;";
    ct.appendChild(svg);
    function line(x1, y1, x2, y2, dash) {
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      l.setAttribute("stroke", "#c0cad6"); l.setAttribute("stroke-width", "1.5");
      if (dash) l.setAttribute("stroke-dasharray", "4,3");
      svg.appendChild(l);
    }

    const pre = prereqs.length ? prereqs : ["No prerequisites"];
    pre.forEach((p, i) => {
      const y = y0 + i * CH;
      const st = prereqs.length ? state(p) : "none";
      box(y, p, st, false);
      line(XM, y + NH, XM, y1, false);
    });
    box(y1, CODE, state(CODE), true);

    const un = unlocks.length ? unlocks : ["No direct unlocks listed"];
    un.forEach((u, i) => {
      const y = y2 + i * CH;
      box(y, u, state(u), false);
      line(XM, y1 + NH, XM, y + NH / 2, true);
      line(XM, y + NH / 2, XL + 2, y + NH / 2, true);
    });
  }

  function renderSections() {
    sectionsEl.innerHTML = "";
    if (!sections.length) {
      sectionsEl.innerHTML = '<div class="empty-note">No section meeting times are currently available for this course in local data.</div>';
      selectedCrn = null;
      updateAction();
      return;
    }
    const gc = new Set(JSON.parse(localStorage.getItem(semKey(semIdx, "greyedCols")) || "[]"));
    const gr = new Set(JSON.parse(localStorage.getItem(semKey(semIdx, "greyedRows")) || "[]"));
    const enrolled = getEnrolledRecord();
    const enrolledBlocks = getEnrolled(semIdx)
      .filter(c => c.code !== CODE)
      .flatMap(c => Array.isArray(c.blocks) ? c.blocks : [])
      .filter(b => Number.isInteger(b.day) && Number.isInteger(b.startQ) && Number.isInteger(b.endQ));

    sections.forEach(s => {
      const btn = document.createElement("button");
      btn.className = "section-card";
      btn.dataset.crn = s.crn || "";
      btn.dataset.days = (s.days || []).join(",");
      btn.dataset.st = s.startTime || "";
      btn.dataset.et = s.endTime || "";

      if ((s.days || []).length && s.startTime && !enrolled) {
        const sq = tQ(s.startTime), eq = tQEnd(s.endTime);
        const conflictedDay = (s.days || []).some(d => gc.has(d));
        let conflictedRow = false;
        let conflictedClass = false;
        if (sq !== null && eq !== null) {
          for (let h = Math.floor(sq / 4); h <= Math.floor(eq / 4); h++) {
            if (gr.has(h)) { conflictedRow = true; break; }
          }
          for (const d of (s.days || [])) {
            for (const b of enrolledBlocks) {
              if (b.day === d && overlaps(sq, eq, b.startQ, b.endQ)) {
                conflictedClass = true;
                break;
              }
            }
            if (conflictedClass) break;
          }
        }
        if (conflictedDay || conflictedRow || conflictedClass) btn.classList.add("conflicted");
      }

      const timeLabel = (s.days || []).length ? `${s.startTime} - ${s.endTime}` : "Online - Asynchronous";
      const creditsLabel = current && current.credits ? `${current.credits} cr` : "";
      btn.innerHTML = `<div class="section-details">
        <div class="s-code">${CODE} <span style="font-weight:400;font-size:11px;color:var(--text-muted);">CRN: ${s.crn || "N/A"}</span></div>
        <div><strong>${dayLabel(s.days || [])}</strong> ${timeLabel}</div>
        <div style="color:var(--text-muted)">${s.dates || ""}</div>
        <div>${s.room || ""} ${s.professor ? ` · ${s.professor}` : ""}</div>
      </div><div class="course-credits">${creditsLabel}.</div>`;
      btn.onclick = () => {
        if (getEnrolledRecord()) return;
        selectedCrn = (selectedCrn === btn.dataset.crn) ? null : btn.dataset.crn;
        document.querySelectorAll(".section-card").forEach(c => {
          c.classList.remove("selected", "dimmed");
          if (selectedCrn && c.dataset.crn !== selectedCrn) c.classList.add("dimmed");
          if (c.dataset.crn === selectedCrn) c.classList.add("selected");
        });
        updateAction();
      };
      sectionsEl.appendChild(btn);
    });
    if (!enrolled && sections.length && !hasCompatibleSectionCards()) {
      const note = document.createElement("div");
      note.className = "empty-note";
      note.style.color = "var(--red)";
      note.style.background = "#fdeaea";
      note.style.border = "1px solid #efb9b9";
      note.style.borderLeft = "4px solid var(--red)";
      note.style.marginBottom = "8px";
      note.style.padding = "10px";
      note.textContent = "No compatible sections available with your current blocked days/times this semester.";
      sectionsEl.prepend(note);
      selectedCrn = null;
    }
    updateAction();
  }

  function updateAction() {
    if (completedPreviously()) {
      actionBtn.textContent = "Already Completed";
      actionBtn.className = "btn-danger";
      actionBtn.disabled = true;
      return;
    }
    if (!prereqsSatisfied()) {
      actionBtn.textContent = "Prereqs Not Met";
      actionBtn.className = "btn-danger";
      actionBtn.disabled = true;
      return;
    }
    const enrolled = getEnrolledRecord();
    if (enrolled) {
      actionBtn.textContent = "Drop Course";
      actionBtn.className = "btn-danger";
      actionBtn.disabled = false;
      document.querySelectorAll(".section-card").forEach(c => {
        c.classList.toggle("selected", c.dataset.crn === (enrolled.crn || ""));
        c.classList.toggle("dimmed", c.dataset.crn !== (enrolled.crn || ""));
      });
      return;
    }
    if (getEnrolled(semIdx).length >= MAX_COURSES_PER_SEMESTER) {
      actionBtn.textContent = `Semester Full (${MAX_COURSES_PER_SEMESTER} Max)`;
      actionBtn.className = "btn-danger";
      actionBtn.disabled = true;
      return;
    }
    if (!sections.length) {
      actionBtn.textContent = "No Sections Listed";
      actionBtn.className = "btn-primary";
      actionBtn.disabled = true;
      return;
    }
    if (!hasCompatibleSectionCards()) {
      actionBtn.textContent = "No Compatible Slots";
      actionBtn.className = "btn-danger";
      actionBtn.disabled = true;
      return;
    }
    actionBtn.textContent = selectedCrn ? "Add Course" : "Select a Section";
    actionBtn.className = "btn-primary";
    actionBtn.disabled = !selectedCrn;
  }

  actionBtn.onclick = function () {
    const enrolled = getEnrolledRecord();
    if (enrolled) {
      setEnrolled(semIdx, getEnrolled(semIdx).filter(c => c.code !== CODE));
      location.href = "calendar.html";
      return;
    }
    if (!prereqsSatisfied()) {
      actionBtn.textContent = "Prereqs Not Met";
      actionBtn.className = "btn-danger";
      actionBtn.disabled = true;
      return;
    }
    if (!selectedCrn) return;
    if (getEnrolled(semIdx).length >= MAX_COURSES_PER_SEMESTER) {
      actionBtn.textContent = `Semester Full (${MAX_COURSES_PER_SEMESTER} Max)`;
      actionBtn.className = "btn-danger";
      actionBtn.disabled = true;
      return;
    }
    const section = sections.find(s => String(s.crn || "") === String(selectedCrn));
    if (!section) return;
    const days = section.days || [];
    const blocks = [];
    if (days.length && section.startTime) {
      const sQ = tQ(section.startTime), eQ = tQEnd(section.endTime);
      if (sQ !== null && eQ !== null) days.forEach(d => blocks.push({ day: d, startQ: sQ, endQ: eQ }));
    }
    const now = getEnrolled(semIdx).filter(c => c.code !== CODE);
    const label = days.length ? `${CODE} (${section.startTime}-${section.endTime})` : `${CODE} (Online)`;
    now.push({ code: CODE, crn: section.crn || "", label, href: courseHref(CODE), blocks });
    setEnrolled(semIdx, now);
    location.href = "calendar.html";
  };

  (async function init() {
    try {
      const [courseRes, allRes] = await Promise.all([
        fetch(`${API}/api/courses/${CODE.replace(/\s+/g, "-")}`),
        fetch(`${API}/api/courses`),
      ]);
      if (!courseRes.ok) throw new Error("Course not found");
      const detail = await courseRes.json();
      const all = allRes.ok ? (await allRes.json()).courses || [] : [];
      current = detail;

      document.title = `${detail.code} ${detail.name} - UNF`;
      document.getElementById("course-title").textContent = `${detail.code} - ${detail.name}`;
      document.getElementById("course-sub").textContent = `${detail.credits} Credit Hours · ${detail.category} · ${semStr}`;
      document.getElementById("info-sub").textContent = `${detail.code} · ${detail.credits} Credit Hours`;
      document.getElementById("info-title").textContent = detail.name;
      document.getElementById("course-desc").textContent = detail.description || `${detail.name} is part of the ${detail.category} requirements. Offered: ${detail.offered}.`;

      const unlocks = (detail.unlocks && detail.unlocks.length)
        ? detail.unlocks
        : all.filter(c => (c.prereqs || []).includes(CODE)).map(c => c.code);

      buildChart(detail.prereqs || [], unlocks);
      sections = (detail.sections || []).filter(s => sectionMatchesSem(s, sem.name, sem.year));
      renderSections();
    } catch (err) {
      document.getElementById("course-title").textContent = CODE;
      document.getElementById("course-sub").textContent = `Course detail unavailable for ${CODE}`;
      document.getElementById("info-sub").textContent = CODE;
      document.getElementById("info-title").textContent = "Unavailable";
      document.getElementById("course-desc").textContent = "Unable to load this course from the local API.";
      sections = [];
      buildChart([], []);
      renderSections();
    }
  })();
})();
