"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, MessageSquareDashed, Trash2 } from "lucide-react";
import { isSupabaseConfigured, supabase, type Post } from "@/lib/supabase";

const MAX_POSTS = 50;

export type ConnectionState = "connecting" | "live" | "offline";

function sortPosts(posts: Post[]): Post[] {
  return [...posts]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, MAX_POSTS);
}

/**
 * Loads the wall and keeps it in sync with Supabase Realtime. Used by the page
 * so the header, profile stats and feed all share one source of truth.
 */
export function useWallFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [totalPosts, setTotalPosts] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [status, setStatus] = useState<ConnectionState>(
    isSupabaseConfigured ? "connecting" : "offline",
  );
  const [error, setError] = useState<string | null>(
    isSupabaseConfigured
      ? null
      : "The wall is offline — add your Supabase URL and anon key to .env.",
  );
  const seenIds = useRef<Set<string>>(new Set());

  const addIncoming = useCallback((incoming: Post) => {
    if (!incoming?.id || !incoming.created_at) return;
    if (seenIds.current.has(incoming.id)) return;

    seenIds.current.add(incoming.id);
    setPosts((current) => sortPosts([incoming, ...current]));
    setTotalPosts((current) => (current === null ? null : current + 1));
  }, []);

  const removeIncoming = useCallback((id: string) => {
    if (!id || !seenIds.current.delete(id)) return;

    setPosts((current) => current.filter((post) => post.id !== id));
    setTotalPosts((current) => (current === null ? null : Math.max(0, current - 1)));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let cancelled = false;

    async function loadPosts() {
      const { data, error: fetchError } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(MAX_POSTS);

      if (cancelled) return;

      if (fetchError) {
        setError("Couldn't load the wall. Check your connection and try again.");
      } else {
        const loaded = (data ?? []) as Post[];
        for (const post of loaded) seenIds.current.add(post.id);
        setPosts((current) => {
          const merged = new Map<string, Post>();
          for (const post of [...current, ...loaded]) merged.set(post.id, post);
          return sortPosts([...merged.values()]);
        });
        setError(null);
      }
      setIsLoading(false);
    }

    async function loadCount() {
      const { count } = await supabase
        .from("posts")
        .select("*", { count: "exact", head: true });

      if (!cancelled && typeof count === "number") setTotalPosts(count);
    }

    void loadPosts();
    void loadCount();

    const channel = supabase
      .channel("wall:public:posts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          addIncoming(payload.new as Post);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "posts" },
        (payload) => {
          removeIncoming((payload.old as Partial<Post>).id ?? "");
        },
      )
      .subscribe((subscriptionStatus) => {
        if (cancelled) return;

        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus("live");
        } else if (
          subscriptionStatus === "CHANNEL_ERROR" ||
          subscriptionStatus === "TIMED_OUT" ||
          subscriptionStatus === "CLOSED"
        ) {
          setStatus("offline");
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [addIncoming, removeIncoming]);

  const addPost = useCallback(
    (post: Post) => {
      setError(null);
      addIncoming(post);
    },
    [addIncoming],
  );

  const deletePost = useCallback(
    async (id: string): Promise<string | null> => {
      const { data, error: deleteError } = await supabase
        .from("posts")
        .delete()
        .eq("id", id)
        .select("id");

      if (deleteError) return deleteError.message;
      if (!data?.length) {
        return "The database blocked the delete. Add the delete policy from the README.";
      }

      removeIncoming(id);
      return null;
    },
    [removeIncoming],
  );

  return { posts, totalPosts, isLoading, status, error, addPost, deletePost };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface PostCardProps {
  post: Post;
  onDelete: (id: string) => Promise<string | null>;
}

function PostCard({ post, onDelete }: PostCardProps) {
  const createdAt = new Date(post.created_at);
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setDeleteError(null);

    const failure = await onDelete(post.id);

    setIsDeleting(false);
    if (failure) {
      setDeleteError(failure);
      return;
    }
    setConfirming(false);
  }

  return (
    <article className="border border-[#d3d6db] bg-white">
      <div className="flex gap-3 p-4 sm:p-5">
        <div
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[2px] bg-[#eef1f6] text-[10px] font-semibold tracking-wide text-[#3b5998]"
        >
          {initials(post.author_name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 break-words text-[13px] font-semibold leading-snug text-[#3b5998]">
              {post.author_name}
            </h3>
            <div className="flex shrink-0 items-center gap-2">
              <time
                dateTime={post.created_at}
                title={format(createdAt, "PPpp")}
                className="text-[11px] text-[#8a8f98]"
              >
                {formatDistanceToNow(createdAt, { addSuffix: true })}
              </time>
              <button
                type="button"
                onClick={() => {
                  setConfirming(true);
                  setDeleteError(null);
                }}
                aria-label={`Delete post by ${post.author_name}`}
                title="Delete post"
                className="text-[#c3c7cd] transition-colors hover:text-[#b91c1c] focus:outline-none focus-visible:text-[#b91c1c]"
              >
                <Trash2 size={12} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[#1d2129]">
            {post.message}
          </p>

          {post.image_url ? (
            <div className="mt-3 border border-[#e2e8f0]">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied storage URL */}
              <img
                src={post.image_url}
                alt={`Photo shared by ${post.author_name}`}
                loading="lazy"
                className="block max-h-[440px] w-full object-cover"
              />
            </div>
          ) : null}

          {confirming ? (
            <div className="mt-3 border-t border-[#e2e8f0] pt-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-[#6b7280]">
                  Delete this post? This can&apos;t be undone.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={isDeleting}
                    className="border border-[#d3d6db] px-2.5 py-1 text-[11px] text-[#4b5563] transition-colors hover:bg-[#f4f5f7] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-1.5 bg-[#b91c1c] px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[#991b1b] disabled:cursor-not-allowed disabled:bg-[#d9a3a3]"
                  >
                    <Trash2 size={11} strokeWidth={2} />
                    {isDeleting ? "Deleting" : "Delete"}
                  </button>
                </div>
              </div>
              {deleteError ? (
                <p role="alert" className="mt-2 text-[11px] text-[#a12a2a]">
                  {deleteError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse border border-[#d3d6db] bg-white p-4 sm:p-5">
      <div className="flex gap-3">
        <div className="h-9 w-9 shrink-0 rounded-[2px] bg-[#e8eaee]" />
        <div className="flex-1 space-y-2.5 pt-0.5">
          <div className="flex items-center justify-between gap-4">
            <div className="h-2.5 w-28 bg-[#e8eaee]" />
            <div className="h-2 w-16 bg-[#eef0f3]" />
          </div>
          <div className="h-2.5 w-full bg-[#eef0f3]" />
          <div className="h-2.5 w-3/4 bg-[#eef0f3]" />
        </div>
      </div>
    </div>
  );
}

interface WallFeedProps {
  posts: Post[];
  isLoading: boolean;
  error: string | null;
  onDelete: (id: string) => Promise<string | null>;
}

export default function WallFeed({ posts, isLoading, error, onDelete }: WallFeedProps) {
  return (
    <section aria-labelledby="wall-heading" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2
          id="wall-heading"
          className="text-[13px] font-semibold tracking-[-0.01em] text-[#1d2129]"
        >
          The wall
        </h2>
        <p className="text-[11px] tabular-nums text-[#8a8f98]">
          {isLoading ? "—" : posts.length} {posts.length === 1 ? "post" : "posts"}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3" aria-hidden="true">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <div className="border border-[#d3d6db] bg-white px-6 py-10 text-center">
          <AlertTriangle
            size={18}
            strokeWidth={1.5}
            className="mx-auto text-[#b45309]"
            aria-hidden="true"
          />
          <p className="mt-3 text-[13px] font-medium text-[#1d2129]">The wall is offline</p>
          <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-[#6b7280]">
            {error}
          </p>
        </div>
      ) : posts.length === 0 ? (
        <div className="border border-[#d3d6db] bg-white px-6 py-12 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-[2px] border border-[#d3d6db] text-[#9aa0a8]">
            <MessageSquareDashed size={18} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <p className="mt-3 text-[13px] font-medium text-[#1d2129]">The wall is quiet.</p>
          <p className="mt-1 text-[12px] text-[#6b7280]">Write the first thing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}
