"use client";

import {
  EyeOff,
  Flag,
  Heart,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CommentSort, CommunityComment } from "@/lib/community/comments";

type Target =
  | { movieId: string; board?: never; rootId?: never }
  | { board: string; movieId?: never; rootId?: never }
  | { rootId: string; movieId?: never; board?: never };

const REPORT_REASONS = [
  { value: "spoiler", label: "ネタバレ表示がない" },
  { value: "harassment", label: "誹謗中傷・嫌がらせ" },
  { value: "spam", label: "スパム・宣伝" },
  { value: "inappropriate", label: "不適切な内容" },
  { value: "other", label: "その他" },
] as const;

const relativeTime = new Intl.RelativeTimeFormat("ja-JP", { numeric: "auto" });

export function formatRelative(iso: string) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return relativeTime.format(Math.round(seconds / size), unit);
    }
  }
  return "たった今";
}

async function send(
  url: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; loginUrl?: string }> {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as {
    loginUrl?: string;
  };
  return { ok: response.ok, loginUrl: data.loginUrl };
}

export function SpoilerBody({
  body,
  isSpoiler,
}: {
  body: string;
  isSpoiler: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  if (isSpoiler && !revealed) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="mt-2 flex w-full items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2.5 text-left text-xs font-bold text-amber-200"
      >
        <EyeOff size={14} />
        ネタバレを含みます。タップして表示
      </button>
    );
  }
  return (
    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-white/90">
      {body}
    </p>
  );
}

function Composer({
  placeholder,
  submitLabel,
  withTitle = false,
  initialBody = "",
  initialSpoiler = false,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  withTitle?: boolean;
  initialBody?: string;
  initialSpoiler?: boolean;
  autoFocus?: boolean;
  onSubmit: (value: {
    title?: string;
    body: string;
    isSpoiler: boolean;
  }) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(initialBody);
  const [isSpoiler, setIsSpoiler] = useState(initialSpoiler);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim() || (withTitle && !title.trim())) return;
    setBusy(true);
    const ok = await onSubmit({
      title: withTitle ? title.trim() : undefined,
      body: body.trim(),
      isSpoiler,
    });
    setBusy(false);
    if (ok) {
      setTitle("");
      setBody("");
      setIsSpoiler(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      {withTitle && (
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          required
          placeholder="タイトル"
          aria-label="タイトル"
          className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-bold text-white outline-none placeholder:text-white/45 focus:ring-2 focus:ring-lime-300"
        />
      )}
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={2000}
        required
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-h-20 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-white/45 focus:ring-2 focus:ring-lime-300"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs font-bold text-white/80">
          <input
            type="checkbox"
            checked={isSpoiler}
            onChange={(event) => setIsSpoiler(event.target.checked)}
            className="size-4 accent-amber-300"
          />
          ネタバレを含む
        </label>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-4 py-2 text-xs font-bold text-white/75 hover:bg-white/5"
            >
              キャンセル
            </button>
          )}
          <button
            disabled={busy || !body.trim() || (withTitle && !title.trim())}
            className="flex items-center gap-1.5 rounded-full bg-lime-300 px-4 py-2 text-xs font-black text-zinc-950 disabled:opacity-40"
          >
            {busy && <LoaderCircle size={14} className="animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  canReply,
  onChanged,
  onLogin,
  onReply,
}: {
  comment: CommunityComment;
  canReply: boolean;
  onChanged: () => void;
  onLogin: (loginUrl?: string) => void;
  onReply?: () => void;
}) {
  const [liked, setLiked] = useState(comment.likedByMe);
  const [likeCount, setLikeCount] = useState(comment.likeCount);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState("");

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((count) => count + (next ? 1 : -1));
    const result = await send(
      `/api/comments/${comment.id}/like`,
      next ? "PUT" : "DELETE",
    );
    if (!result.ok) {
      setLiked(!next);
      setLikeCount((count) => count + (next ? -1 : 1));
      if (result.loginUrl) onLogin(result.loginUrl);
    }
  };

  const remove = async () => {
    if (!window.confirm("このコメントを削除しますか？")) return;
    const result = await send(`/api/comments/${comment.id}`, "DELETE");
    if (result.ok) onChanged();
  };

  const report = async (reason: string) => {
    const result = await send(`/api/comments/${comment.id}/report`, "POST", {
      reason,
    });
    setReporting(false);
    if (result.loginUrl) return onLogin(result.loginUrl);
    setNotice(
      result.ok ? "通報しました。確認します。" : "通報できませんでした。",
    );
  };

  if (comment.deleted) {
    return (
      <p className="py-2 text-xs italic text-white/55">
        このコメントは削除されました
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        <Link
          href={`/u/${comment.author.id}`}
          className="font-bold text-white hover:underline"
        >
          {comment.author.displayName}
        </Link>
        <span className="text-white/55">
          {formatRelative(comment.createdAt)}
          {comment.edited ? "（編集済み）" : ""}
        </span>
        {comment.hidden && (
          <span className="rounded-full bg-rose-400/20 px-2 py-0.5 text-[10px] font-bold text-rose-200">
            非表示中
          </span>
        )}
      </div>
      {editing ? (
        <div className="mt-2">
          <Composer
            placeholder="コメントを編集"
            submitLabel="保存"
            initialBody={comment.body}
            initialSpoiler={comment.isSpoiler}
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={async (value) => {
              const result = await send(
                `/api/comments/${comment.id}`,
                "PATCH",
                {
                  body: value.body,
                  isSpoiler: value.isSpoiler,
                },
              );
              if (result.ok) {
                setEditing(false);
                onChanged();
              }
              return result.ok;
            }}
          />
        </div>
      ) : (
        <SpoilerBody body={comment.body} isSpoiler={comment.isSpoiler} />
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-white/70">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={liked}
          className={`flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/5 ${liked ? "text-rose-300" : ""}`}
        >
          <Heart size={14} className={liked ? "fill-current" : undefined} />
          {likeCount > 0 ? likeCount : "いいね"}
        </button>
        {canReply && onReply && (
          <button
            type="button"
            onClick={onReply}
            className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/5"
          >
            <MessageCircle size={14} />
            返信
          </button>
        )}
        {comment.isMine ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/5"
            >
              <Pencil size={13} />
              編集
            </button>
            <button
              type="button"
              onClick={remove}
              className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/5"
            >
              <Trash2 size={13} />
              削除
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setReporting((value) => !value)}
            className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/5"
            aria-expanded={reporting}
          >
            <Flag size={13} />
            通報
          </button>
        )}
      </div>
      {reporting && (
        <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="w-full text-xs font-bold text-white/80">通報の理由</p>
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              onClick={() => report(reason.value)}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/85 hover:bg-white/5"
            >
              {reason.label}
            </button>
          ))}
        </div>
      )}
      {notice && <p className="mt-1 text-xs text-white/70">{notice}</p>}
    </div>
  );
}

export function CommentThread({
  comment,
  onChanged,
  onLogin,
  showReplies = true,
}: {
  comment: CommunityComment;
  onChanged: () => void;
  onLogin: (loginUrl?: string) => void;
  showReplies?: boolean;
}) {
  const [replying, setReplying] = useState(false);

  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <CommentItem
        comment={comment}
        canReply={showReplies}
        onChanged={onChanged}
        onLogin={onLogin}
        onReply={() => setReplying((value) => !value)}
      />
      {showReplies && (comment.replies.length > 0 || replying) && (
        <ul className="mt-3 space-y-3 border-l-2 border-white/10 pl-4">
          {comment.replies.map((reply) => (
            <li key={reply.id}>
              <CommentItem
                comment={reply}
                canReply={false}
                onChanged={onChanged}
                onLogin={onLogin}
              />
            </li>
          ))}
          {replying && (
            <li>
              <Composer
                placeholder={`${comment.author.displayName}さんに返信`}
                submitLabel="返信する"
                autoFocus
                onCancel={() => setReplying(false)}
                onSubmit={async (value) => {
                  const result = await send("/api/comments", "POST", {
                    parentId: comment.id,
                    body: value.body,
                    isSpoiler: value.isSpoiler,
                  });
                  if (result.loginUrl) onLogin(result.loginUrl);
                  if (result.ok) {
                    setReplying(false);
                    onChanged();
                  }
                  return result.ok;
                }}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export function CommentSection({
  target,
  title = "みんなのコメント",
  initialComments,
}: {
  target: Target;
  title?: string;
  initialComments?: CommunityComment[];
}) {
  const router = useRouter();
  const [sort, setSort] = useState<CommentSort>("new");
  const [comments, setComments] = useState<CommunityComment[] | null>(
    initialComments ?? null,
  );
  const [error, setError] = useState("");
  const query = new URLSearchParams({
    ...(target.movieId ? { movieId: target.movieId } : {}),
    ...(target.board ? { board: target.board } : {}),
    ...(target.rootId ? { rootId: target.rootId } : {}),
    sort,
  }).toString();

  const reload = useCallback(async () => {
    try {
      const response = await fetch(`/api/comments?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as {
        comments: CommunityComment[];
      };
      setComments(data.comments);
      setError("");
    } catch {
      setError("コメントを読み込めませんでした。");
      setComments((current) => current ?? []);
    }
  }, [query]);

  useEffect(() => {
    // Initial server data is reused until the viewer changes the sort.
    if (initialComments && sort === "new") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [initialComments, reload, sort]);

  const onLogin = (loginUrl?: string) => {
    if (loginUrl) router.push(loginUrl);
  };

  const isThread = Boolean(target.rootId);

  return (
    <section aria-label={title}>
      {!isThread && (
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black">{title}</h3>
          <div className="flex rounded-full bg-white/5 p-1 text-xs font-bold">
            {(
              [
                ["new", "新着"],
                ["top", "人気"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSort(value)}
                aria-pressed={sort === value}
                className={`rounded-full px-3 py-1 ${sort === value ? "bg-white text-zinc-950" : "text-white/75"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!target.board && !isThread && (
        <div className="mt-3">
          <Composer
            placeholder="この作品についてコメントする"
            submitLabel="投稿"
            onSubmit={async (value) => {
              const result = await send("/api/comments", "POST", {
                movieId: target.movieId,
                body: value.body,
                isSpoiler: value.isSpoiler,
              });
              if (result.loginUrl) onLogin(result.loginUrl);
              if (result.ok) await reload();
              else if (!result.loginUrl) setError("投稿できませんでした。");
              return result.ok;
            }}
          />
        </div>
      )}

      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      {comments === null ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-white/70">
          <LoaderCircle size={14} className="animate-spin" />
          読み込み中
        </p>
      ) : comments.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-white/70">
          まだコメントはありません。最初のひとことをどうぞ。
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              onChanged={() => {
                void reload();
                if (isThread) router.refresh();
              }}
              onLogin={onLogin}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function NewThreadForm({ board }: { board: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div>
      <Composer
        withTitle
        placeholder="本文"
        submitLabel="スレッドを立てる"
        onSubmit={async (value) => {
          const response = await fetch("/api/comments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ board, ...value }),
          });
          const data = (await response.json().catch(() => ({}))) as {
            id?: string;
            loginUrl?: string;
          };
          if (data.loginUrl) {
            router.push(data.loginUrl);
            return false;
          }
          if (!response.ok || !data.id) {
            setError("スレッドを作成できませんでした。");
            return false;
          }
          router.push(`/community/${board}/${data.id}`);
          return true;
        }}
      />
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </div>
  );
}
