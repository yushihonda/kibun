export function hasSupabaseAuthCookie(
  cookies: readonly { name: string }[],
): boolean {
  return cookies.some(
    ({ name }) => name.startsWith("sb-") && name.includes("-auth-token"),
  );
}
