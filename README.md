# Degree Planner

A degree planning app for BS Computer Science students, built with:
- **Frontend**: HTML + TypeScript + CSS (no framework, no bundler)
- **Backend**: Python + FastAPI

---

## Project Structure

```
planner/
├── backend/
│   ├── main.py            ← FastAPI app with all API endpoints
│   └── requirements.txt
└── frontend/
    ├── pages/
    │   ├── landing-page.html    ← Home / navigation hub
    │   ├── calendar.html        ← Weekly semester calendar
    │   ├── degree-planner.html  ← Visual prereq tree
    │   ├── catalog.html         ← Searchable course catalog
    │   ├── cop3503.html         ← COP 3503 detail / enrollment
    │   ├── unavailable.html     ← "Feature not available" page
    │   └── error.html           ← Error page (URL params: title, message)
    ├── styles/
    │   └── shared.css           ← Design tokens & reusable components
    ├── scripts/
    │   └── api.ts               ← Typed API client + localStorage helpers
    └── components/
        └── banner.ts            ← Nav banner component
```

---

## Running the Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/courses` | List courses; supports `?q=` text search and `?filter=` tag filter |
| GET | `/api/courses/{code}` | Single course detail (description, sections, unlocks) |
| GET | `/api/semesters` | Full list of semesters (Spring/Summer/Fall 2024–2030) |
| GET | `/api/prereqs/{code}` | Prereq chain + unlock list for a course |

---

## Running the Frontend

Serve the `frontend/pages/` directory with any static file server. For example:

```bash
cd frontend/pages
python -m http.server 3000
# then open http://localhost:3000/landing-page.html
```

Or use VS Code Live Server pointed at the `pages/` folder.

> **Note**: The `.ts` files in `scripts/` and `components/` are provided as typed reference.
> The HTML pages use self-contained inline `<script type="module">` blocks so they work
> without a TypeScript compiler or bundler. The `.ts` files serve as the typed source of
> truth for the helpers and types used inline.

---

## State Management

All user state (enrolled courses, greyed-out calendar columns/rows, current semester index)
is stored in `localStorage` using consistent keys:

| Key | Description |
|-----|-------------|
| `cal_semIdx` | Current semester index (0 = Spring 2024) |
| `cal_{idx}_courses` | Enrolled courses array for semester `idx` |
| `cal_{idx}_greyedCols` | Greyed day columns for semester `idx` |
| `cal_{idx}_greyedRows` | Greyed time rows for semester `idx` |

---

## Design System

All pages share `shared.css` which defines:
- CSS custom properties (tokens) for colours, spacing, typography
- `.banner` / `.banner__title` / `.banner__nav` layout
- `.btn`, `.btn--sm`, `.btn--lg` button variants
- `.tag` status chip classes
- `.state-page` for error / unavailable full-page states
