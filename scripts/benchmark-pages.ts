import { chromium } from "@playwright/test";

const baseUrl = (process.env.PERF_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/u,
  "",
);
const defaultRoutes = [
  "/",
  "/search",
  "/login",
  "/me",
  "/admin/operations",
  "/credits",
  "/privacy",
  "/support",
  "/terms",
];
const routes =
  process.env.PERF_ROUTES?.split(",")
    .map((route) => route.trim())
    .filter(Boolean) ?? defaultRoutes;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const results = [];

  try {
    for (const route of routes) {
      const page = await context.newPage();
      await page.goto(`${baseUrl}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForTimeout(2_500);
      results.push(
        await page.evaluate((path) => {
          const navigation = performance.getEntriesByType("navigation")[0] as
            PerformanceNavigationTiming | undefined;
          const firstPaint = performance
            .getEntriesByType("paint")
            .find((entry) => entry.name === "first-contentful-paint");
          const resources = performance.getEntriesByType(
            "resource",
          ) as PerformanceResourceTiming[];
          return {
            route: path,
            ttfbMs: Math.round(navigation?.responseStart ?? 0),
            domContentLoadedMs: Math.round(
              navigation?.domContentLoadedEventEnd ?? 0,
            ),
            firstContentfulPaintMs: Math.round(firstPaint?.startTime ?? 0),
            transferKb: Math.round(
              resources.reduce((total, item) => total + item.transferSize, 0) /
                1024,
            ),
            resources: resources.length,
            domNodes: document.querySelectorAll("*").length,
            feedItems: document.querySelectorAll(
              '[data-testid="movie-feed-item"]',
            ).length,
            movieCards: document.querySelectorAll("[data-movie-id]").length,
          };
        }, route),
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ baseUrl, results }, null, 2));
}

void main();
