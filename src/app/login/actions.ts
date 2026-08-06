"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

async function callbackUrl(next: string) {
  const headerStore = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    headerStore.get("origin") ||
    "http://localhost:3000";
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", safeNextPath(next));
  return url.toString();
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? "/"));
  const supabase = await createClient();
  if (!supabase)
    redirect(`/login?next=${encodeURIComponent(next)}&error=config`);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(next) },
  });

  if (error || !data.url) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=oauth`);
  }
  redirect(data.url);
}

export async function signInWithMagicLink(formData: FormData) {
  const next = safeNextPath(String(formData.get("next") ?? "/"));
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const supabase = await createClient();

  if (!supabase)
    redirect(`/login?next=${encodeURIComponent(next)}&error=config`);
  if (!email || email.length > 254) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=email`);
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: await callbackUrl(next),
      shouldCreateUser: true,
    },
  });

  const status = error ? "magic" : "sent";
  redirect(
    `/login?next=${encodeURIComponent(next)}&${error ? "error" : "status"}=${status}`,
  );
}

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
