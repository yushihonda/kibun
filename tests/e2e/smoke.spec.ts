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
  expect(await movies.count()).toBeLessThanOrEqual(12);
  await expect(movies.first()).toHaveAttribute(
    "data-movie-id",
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
  );
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const playTrailer = page.getByRole("button", { name: "予告編を再生" });
  await expect(playTrailer).toBeVisible();
  await expect(page.getByTestId("feed-video-surface")).toHaveCount(0);
  await playTrailer.click();
  const videoSurface = page.getByTestId("feed-video-surface").first();
  await expect(videoSurface).toBeAttached();
  const videoBox = await videoSurface.boundingBox();
  expect(videoBox?.width).toBeGreaterThanOrEqual(viewport!.width - 1);
  expect(videoBox?.height).toBeGreaterThanOrEqual(viewport!.height - 1);

  const overviewDisplay = await movies
    .first()
    .getByTestId("feed-overview")
    .evaluate((element) => getComputedStyle(element).display);
  if (viewport!.width < 768) {
    expect(overviewDisplay).toBe("none");
    await expect(
      movies.first().getByTestId("feed-emotional-tags"),
    ).toBeHidden();
    expect(
      await movies
        .first()
        .getByTestId("feed-movie-title")
        .evaluate((element) => getComputedStyle(element).webkitLineClamp),
    ).toBe("1");
    const summaryBox = await movies
      .first()
      .getByTestId("feed-summary")
      .boundingBox();
    expect(summaryBox?.height).toBeLessThan(180);
  } else {
    expect(overviewDisplay).not.toBe("none");
  }

  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByPlaceholder("例：金曜の夜、何も考えずスカッとしたい"),
  ).toBeVisible();
  await expect(page.getByText("今の気分に刺さる映画")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "今週の話題映画", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "今週の話題ドラマ", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "邦画ピックアップ", exact: true }),
  ).toBeVisible();

  const searchInput = page.getByPlaceholder(
    "例：金曜の夜、何も考えずスカッとしたい",
  );
  await searchInput.fill("泣ける");
  await expect(searchInput).toHaveValue("泣ける");

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
    dialog.getByRole("button", { name: "見た", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const safeQuery = "疲れたから癒やされたい。怖くないもの";
  await searchInput.fill(safeQuery);
  await expect(
    page.getByRole("heading", {
      name: `「${safeQuery}」に近い作品`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator("main").getByRole("region").first(),
  ).toHaveAccessibleName(/この気分に近い/);

  const safeResponse = await page.request.get(
    `/api/search?q=${encodeURIComponent(safeQuery)}&limit=48`,
  );
  expect(safeResponse.ok()).toBe(true);
  const safeBody = (await safeResponse.json()) as {
    hits: Array<{ genres: string[]; emotionalTags: string[] }>;
    movies?: unknown;
    rails?: unknown;
  };
  expect(safeBody.hits.length).toBeGreaterThan(0);
  expect(safeBody.movies).toBeUndefined();
  expect(safeBody.rails).toBeUndefined();
  expect(
    safeBody.hits.some(
      (movie) =>
        movie.genres.some((genre) => ["ホラー", "スリラー"].includes(genre)) ||
        movie.emotionalTags.some((tag) =>
          ["怖い", "不穏", "ゾッとする", "残酷", "グロい"].some((avoided) =>
            tag.includes(avoided),
          ),
        ),
    ),
  ).toBe(false);

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

test("film and TV drama filters return the requested media type", async ({
  page,
}) => {
  await page.goto("/search", { waitUntil: "load" });

  const dramaFilter = page.getByRole("button", { name: "ドラマ", exact: true });
  await dramaFilter.click();

  await expect(dramaFilter).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^\d+件$/).first()).toBeVisible();
  const dramaCards = page
    .getByRole("region", { name: "ドラマ", exact: true })
    .locator("[data-movie-id]");
  await expect(dramaCards.first()).toBeVisible();
  expect(await dramaCards.count()).toBeGreaterThan(0);
  for (const card of await dramaCards.all()) {
    await expect(card).toHaveAttribute("data-media-type", "tv");
  }
  await expect(
    page.getByRole("button", {
      name: "「デューン 砂の惑星 PART2」の詳細を見る",
      exact: true,
    }),
  ).toHaveCount(0);

  const movieFilter = page.getByRole("button", { name: "映画", exact: true });
  await movieFilter.click();
  await expect(movieFilter).toHaveAttribute("aria-pressed", "true");
  await expect(dramaFilter).toHaveAttribute("aria-pressed", "false");
  await expect(
    page
      .getByRole("region", { name: "映画", exact: true })
      .locator("[data-movie-id]")
      .first(),
  ).toBeVisible();
  const movieCards = page
    .getByRole("region", { name: "映画", exact: true })
    .locator("[data-movie-id]");
  for (const card of await movieCards.all()) {
    await expect(card).toHaveAttribute("data-media-type", "movie");
  }
});
