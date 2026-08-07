import "./load-env";
import { createClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const displayName = process.argv[3]?.trim() || "映画大好き管理者";
  if (!email || !/^\S+@\S+\.\S+$/u.test(email)) {
    throw new Error(
      "Usage: npm run admin:promote -- user@example.com [display name]",
    );
  }

  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let matchedUser: { id: string; email?: string } | undefined;
  for (let page = 1; !matchedUser; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    matchedUser = data.users.find(
      (user) => user.email?.trim().toLowerCase() === email,
    );
    if (data.users.length < 1000) break;
  }
  if (!matchedUser) throw new Error(`User not found: ${email}`);

  const { data: currentProfile, error: profileReadError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", matchedUser.id)
    .maybeSingle();
  if (profileReadError) throw profileReadError;

  const write = currentProfile
    ? supabase
        .from("profiles")
        .update({ role: "admin", display_name: displayName })
        .eq("id", matchedUser.id)
    : supabase.from("profiles").insert({
        id: matchedUser.id,
        role: "admin",
        display_name: displayName,
      });
  const { error: writeError } = await write;
  if (writeError) throw writeError;

  const { data: verified, error: verifyError } = await supabase
    .from("profiles")
    .select("id,display_name,role")
    .eq("id", matchedUser.id)
    .single();
  if (verifyError) throw verifyError;
  if (verified.role !== "admin" || verified.display_name !== displayName) {
    throw new Error("Administrator promotion verification failed");
  }

  console.log(
    JSON.stringify(
      {
        email,
        displayName: verified.display_name,
        role: verified.role,
        verified: true,
      },
      null,
      2,
    ),
  );
}

void main();
