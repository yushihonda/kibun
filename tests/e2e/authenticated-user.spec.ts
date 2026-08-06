import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const configuredTestUserEmail = process.env.E2E_TEST_USER_EMAIL?.trim();

function projectEmail(projectName: string) {
  const base = configuredTestUserEmail ?? "kibun-e2e-test@example.com";
  const separator = base.lastIndexOf("@");
  if (separator < 1) return base;
  return `${base.slice(0, separator)}+${projectName}${base.slice(separator)}`;
}

async function generateMagicLink(admin: SupabaseClient, email: string) {
  let latestError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: "http://localhost:3000/auth/callback?next=/me",
      },
    });
    if (!result.error) return result.data;
    latestError = result.error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw latestError;
}

async function waitForInteraction(page: Page, movieId: string) {
  await expect
    .poll(async () => {
      const response = await page.request.get(
        `/api/movies/${movieId}/interaction`,
      );
      const body = (await response.json()) as {
        interaction?: { is_favorite?: boolean } | null;
      };
      return body.interaction?.is_favorite;
    })
    .toBe(true);
}

test("preferences, recommendations and cross-device shelf sync", async ({
  page,
}, testInfo) => {
  test.slow();
  test.skip(
    !supabaseUrl || !serviceRoleKey,
    "SupabaseのE2E用環境変数が設定されていません",
  );

  const admin = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const testUserEmail = projectEmail(testInfo.project.name);
  const data = await generateMagicLink(admin, testUserEmail);
  expect(data.properties?.hashed_token).toBeTruthy();

  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(data.properties!.hashed_token)}&type=email&next=/me`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();

  const { data: movies, error: movieError } = await admin
    .from("movies")
    .select("id")
    .order("popularity", { ascending: false })
    .limit(6);
  expect(movieError).toBeNull();
  expect(movies?.length).toBeGreaterThanOrEqual(4);

  const preferenceResponse = await page.request.put("/api/preferences", {
    data: {
      personalizationEnabled: true,
      preferredGenres: ["ドラマ"],
      preferredEmotions: ["泣ける"],
      favoriteMovieIds: movies!.slice(0, 3).map((movie) => movie.id),
      onboardingCompleted: true,
    },
  });
  expect(preferenceResponse.ok()).toBe(true);

  const shelfResponse = await page.request.put(
    `/api/movies/${movies![0].id}/interaction`,
    { data: { status: "WATCHLIST", isFavorite: true, rating: 5 } },
  );
  expect(shelfResponse.ok()).toBe(true);
  const recommendations = await page.request.get(
    "/api/recommendations?limit=8",
  );
  expect(recommendations.ok()).toBe(true);
  const recommendationBody = (await recommendations.json()) as {
    personalized: boolean;
    movies: Array<{ id: string; recommendationReason?: string }>;
  };
  expect(recommendationBody.personalized).toBe(true);
  expect(recommendationBody.movies.length).toBeGreaterThan(0);
  expect(recommendationBody.movies[0].recommendationReason).toBeTruthy();
  expect(
    recommendationBody.movies.some((movie) =>
      movies!.slice(0, 3).some((favorite) => favorite.id === movie.id),
    ),
  ).toBe(false);

  await page.evaluate(
    ({ movieId }) => {
      localStorage.setItem(
        "kibun:pending-interactions",
        JSON.stringify([
          {
            movieId,
            payload: { isFavorite: true },
            createdAt: new Date().toISOString(),
          },
        ]),
      );
    },
    { movieId: movies![3].id },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForInteraction(page, movies![3].id);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: /見たい/ })).toContainText("1");
  await expect(page.getByRole("button", { name: /お気に入り/ })).toContainText(
    "4",
  );

  const browser = page.context().browser();
  expect(browser).not.toBeNull();
  const secondDevice = await browser!.newContext({
    storageState: await page.context().storageState(),
  });
  const secondPage = await secondDevice.newPage();
  await secondPage.goto("/me", { waitUntil: "domcontentloaded" });
  await expect(
    secondPage.getByRole("button", { name: /お気に入り/ }),
  ).toContainText("4");
  await secondDevice.close();
});
