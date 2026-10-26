"use client";

import { Ban, UserCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileActions({
  userId,
  initialFollowing,
  initialBlocked,
}: {
  userId: string;
  initialFollowing: boolean;
  initialBlocked: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);

  const call = async (path: "follow" | "block", enable: boolean) => {
    setBusy(true);
    const response = await fetch(`/api/users/${userId}/${path}`, {
      method: enable ? "PUT" : "DELETE",
    });
    const data = (await response.json().catch(() => ({}))) as {
      loginUrl?: string;
    };
    setBusy(false);
    if (data.loginUrl) {
      router.push(data.loginUrl);
      return false;
    }
    if (response.ok) router.refresh();
    return response.ok;
  };

  return (
    <div className="flex flex-wrap gap-2">
      {!blocked && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (await call("follow", !following)) setFollowing(!following);
          }}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black disabled:opacity-50 ${
            following
              ? "border border-white/20 text-white"
              : "bg-lime-300 text-zinc-950"
          }`}
        >
          {following ? <UserCheck size={15} /> : <UserPlus size={15} />}
          {following ? "フォロー中" : "フォローする"}
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (
            !blocked &&
            !window.confirm(
              "ブロックすると、この人の投稿があなたに表示されなくなります。よろしいですか？",
            )
          )
            return;
          if (await call("block", !blocked)) {
            setBlocked(!blocked);
            if (!blocked) setFollowing(false);
          }
        }}
        className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-white/80 hover:bg-white/5 disabled:opacity-50"
      >
        <Ban size={15} />
        {blocked ? "ブロック解除" : "ブロック"}
      </button>
    </div>
  );
}
