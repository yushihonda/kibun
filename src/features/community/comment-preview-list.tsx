"use client";

import { Heart, MessageCircle } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { ResilientImage as Image } from "@/components/resilient-image";
import {
  formatRelative,
  SpoilerBody,
} from "@/features/community/comment-section";
import type { CommunityComment } from "@/lib/community/comments";
import type { Movie } from "@/types/movie";

const MovieDetails = dynamic(() =>
  import("@/features/feed/movie-feed").then((module) => module.MovieDetails),
);

export function CommentPreviewList({
  comments,
  movies = {},
  boardNames = {},
  empty,
}: {
  comments: CommunityComment[];
  movies?: Record<string, Movie>;
  boardNames?: Record<string, string>;
  empty: string;
}) {
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  if (!comments.length) {
    return (
      <p className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-sm text-white/70">
        {empty}
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {comments.map((comment) => {
          const movie = comment.movie ? movies[comment.movie.id] : undefined;
          const threadHref =
            comment.board && !comment.parentId
              ? `/community/${comment.board}/${comment.id}`
              : comment.board && comment.parentId
                ? `/community/${comment.board}/${comment.parentId}`
                : null;
          return (
            <li
              key={comment.id}
              className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              {comment.movie && (
                <button
                  type="button"
                  disabled={!movie}
                  onClick={() => movie && setSelectedMovie(movie)}
                  className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-lg bg-white/5"
                  aria-label={`${comment.movie.title}の詳細を開く`}
                >
                  {comment.movie.posterUrl && (
                    <Image
                      src={comment.movie.posterUrl}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  )}
                </button>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold text-lime-300">
                  {comment.movie ? (
                    <button
                      type="button"
                      disabled={!movie}
                      onClick={() => movie && setSelectedMovie(movie)}
                      className="hover:underline"
                    >
                      {comment.movie.title}
                    </button>
                  ) : comment.board ? (
                    <Link
                      href={`/community/${comment.board}`}
                      className="hover:underline"
                    >
                      {boardNames[comment.board] ?? comment.board}
                    </Link>
                  ) : null}
                </p>
                {comment.title &&
                  (threadHref ? (
                    <Link
                      href={threadHref}
                      className="mt-0.5 block text-base font-black text-white hover:underline"
                    >
                      {comment.title}
                    </Link>
                  ) : (
                    <p className="mt-0.5 text-base font-black">
                      {comment.title}
                    </p>
                  ))}
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <Link
                    href={`/u/${comment.author.id}`}
                    className="font-bold text-white hover:underline"
                  >
                    {comment.author.displayName}
                  </Link>
                  <span className="text-white/55">
                    {formatRelative(comment.createdAt)}
                    {comment.parentId ? " ・ 返信" : ""}
                  </span>
                </div>
                <div className="line-clamp-4">
                  <SpoilerBody
                    body={comment.body}
                    isSpoiler={comment.isSpoiler}
                  />
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-white/65">
                  <span className="flex items-center gap-1">
                    <Heart size={13} />
                    {comment.likeCount}
                  </span>
                  {threadHref ? (
                    <Link
                      href={threadHref}
                      className="flex items-center gap-1 hover:text-white"
                    >
                      <MessageCircle size={13} />
                      {comment.replyCount}件の返信
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={!movie}
                      onClick={() => movie && setSelectedMovie(movie)}
                      className="flex items-center gap-1 hover:text-white"
                    >
                      <MessageCircle size={13} />
                      {comment.parentId
                        ? "スレッドを見る"
                        : `${comment.replyCount}件の返信`}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {selectedMovie && (
        <MovieDetails
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
          onSelectMovie={setSelectedMovie}
        />
      )}
    </>
  );
}
