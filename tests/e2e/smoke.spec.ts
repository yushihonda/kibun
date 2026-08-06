import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("feed and search are reachable", async ({ page, request }) => {
  const [ogImage, shareImage] = await Promise.all([
    request.get("/og-image.png"),
    request.get("/api/share?title=KIBUN"),
  ]);
  expect(ogImage.ok()).toBe(true);
  expect(ogImage.headers()["content-type"]).toContain("image/png");
  expect(shareImage.ok()).toBe(true);
  expect(shareImage.headers()["content-type"]).toContain("image/svg+xml");
  expect(await shareImage.text()).toContain("KIBUN");

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBe(true);
  expect(response?.headers()["content-security-policy"]).toContain(
    "object-src 'none'",
  );
  await expect(page.getByRole("link", { name: "KIBUN ホーム" })).toBeVisible();
  const movies = page.getByTestId("movie-feed-item");
  await expect(movies.first()).toBeVisible();
  await expect(movies.first()).toHaveAttribute(
    "data-movie-id",
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
  );
  await expect(movies.first().locator('iframe[title="予告編"]')).toBeAttached();

  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByPlaceholder("例：金曜の夜、何も考えずスカッとしたい"),
  ).toBeVisible();
  await expect(page.getByText("今の気分に刺さる映画")).toBeVisible();

  await page
    .getByPlaceholder("例：金曜の夜、何も考えずスカッとしたい")
    .fill("泣ける");
  await expect(page.getByText("泣ける・感動", { exact: true })).toBeVisible();

  const firstSearchResult = page
    .getByRole("button", { name: /の詳細を見る$/ })
    .first();
  await expect(firstSearchResult).toHaveAttribute(
    "data-movie-id",
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
  );
  await firstSearchResult.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "合っている" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("reduced motion and basic accessible names are applied", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const animated = page.locator(".animate-bounce");
  await expect(animated).toBeVisible();
  expect(
    await animated.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).animationDuration),
    ),
  ).toBeLessThanOrEqual(0.001);
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter(
          (button) =>
            !button.getAttribute("aria-label") && !button.textContent?.trim(),
        )
        .map((button) => button.outerHTML.slice(0, 120)),
    ),
  ).toEqual([]);
  expect(await page.locator("img:not([alt])").count()).toBe(0);
});
