// banner.ts — renders the nav banner on every page
// Usage: import { renderBanner } from "../components/banner.js";
//        renderBanner("Degree Planner", { subtitle: "Spring 2026" });

import { PAGES } from "../scripts/api.js";

interface BannerOptions {
  subtitle?: string;
}

export function renderBanner(title: string, opts: BannerOptions = {}): void {
  const banner = document.getElementById("banner");
  if (!banner) return;

  banner.innerHTML = `
    <div class="banner__title">
      <h1>${title}</h1>
      ${opts.subtitle ? `<div class="subtitle">${opts.subtitle}</div>` : ""}
    </div>
    <nav class="banner__nav">
      <button class="btn btn--sm" data-nav="landing">Landing Page</button>
      <button class="btn btn--sm" data-nav="calendar">Calendar</button>
      <button class="btn btn--sm" data-nav="planner">Degree Planner</button>
      <button class="btn btn--sm" data-nav="catalog">Course Catalog</button>
    </nav>
  `;

  banner.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.nav as keyof typeof PAGES;
      window.location.href = PAGES[key];
    });
  });
}
