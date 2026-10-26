import type { Metadata } from "next";
import { Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentPreviewList } from "@/features/community/comment-preview-list";
import { CommunityShell } from "@/features/community/community-shell";
import { ProfileActions } from "@/features/community/profile-actions";
import { MyShelf } from "@/features/me/my-shelf";
import { ANONYMOUS_NAME, loadComments } from "@/lib/community/comments";
import { loadCommentMovies } from "@/lib/community/movies";
import { loadShelfItems } from "@/lib/movies/shelf";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PublicProfile = {
  id: string;
  display_name: string | null;
  bio: string | null;
  shelf_public: boolean;
};

async function loadProfile(userId: string) {
  const supabase = await createClient();
  if (!supabase || !UUID.test(userId)) return null;
  const { data } = await supabase
    .from("public_profiles")
    .select("id,display_name,bio,shelf_public")
    .eq("id", userId)
    .maybeSingle();
  return data ? { supabase, profile: data as PublicProfile } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;
  const loaded = await loadProfile(userId);
  return {
    title: `${loaded?.profile.display_name?.trim() || ANONYMOUS_NAME}さん`,
  };
}

export default async function UserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const loaded = await loadProfile(userId);
  if (!loaded) notFound();
  const { supabase, profile } = loaded;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;
  const isSelf = viewerId === profile.id;
  const canSeeShelf = profile.shelf_public || isSelf;

  const [
    followers,
    followingCount,
    viewerFollow,
    viewerBlock,
    comments,
    shelf,
  ] = await Promise.all([
    supabase
      .from("user_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("followee_id", profile.id),
    supabase
      .from("user_follows")
      .select("followee_id", { count: "exact", head: true })
      .eq("follower_id", profile.id),
    viewerId && !isSelf
      ? supabase
          .from("user_follows")
          .select("followee_id")
          .eq("follower_id", viewerId)
          .eq("followee_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    viewerId && !isSelf
      ? supabase
          .from("user_blocks")
          .select("blocked_id")
          .eq("blocker_id", viewerId)
          .eq("blocked_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    loadComments(supabase, {
      userIds: [profile.id],
      limit: 30,
      viewerId,
    }).catch(() => []),
    canSeeShelf ? loadShelfItems(supabase, profile.id) : Promise.resolve([]),
  ]);
  const movies = await loadCommentMovies(supabase, comments);
  const name = profile.display_name?.trim() || ANONYMOUS_NAME;
  const blocked = Boolean(viewerBlock.data);

  return (
    <CommunityShell back={{ href: "/community", label: "コミュニティ" }}>
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-800 to-zinc-900 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">{name}さん</h1>
            <p className="mt-2 text-xs text-white/70">
              フォロワー {followers.count ?? 0} ・ フォロー中{" "}
              {followingCount.count ?? 0}
            </p>
          </div>
          {isSelf ? (
            <Link
              href="/me"
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold hover:bg-white/5"
            >
              プロフィールを編集
            </Link>
          ) : (
            <ProfileActions
              userId={profile.id}
              initialFollowing={Boolean(viewerFollow.data)}
              initialBlocked={blocked}
            />
          )}
        </div>
        {profile.bio && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-white/85">
            {profile.bio}
          </p>
        )}
      </section>

      {blocked ? (
        <p className="mt-8 rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-white/70">
          この人をブロックしています。
        </p>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-xl font-black">作品棚</h2>
            {canSeeShelf ? (
              <MyShelf items={shelf} recommendations={[]} loggedIn />
            ) : (
              <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 p-6 text-sm text-white/70">
                <Lock size={15} />
                作品棚は非公開です
              </p>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-black">最近の投稿</h2>
            <div className="mt-4">
              <CommentPreviewList
                comments={comments}
                movies={movies}
                empty="まだ投稿はありません。"
              />
            </div>
          </section>
        </>
      )}
    </CommunityShell>
  );
}
