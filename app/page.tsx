"use client";

import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { MapPin } from "lucide-react";
import WallComposer from "@/components/WallComposer";
import WallFeed, { useWallFeed, type ConnectionState } from "@/components/WallFeed";

const STATUS: Record<ConnectionState, { label: string; dot: string; text: string }> = {
  live: { label: "Live", dot: "bg-[#9ae6b4]", text: "text-white/90" },
  connecting: { label: "Connecting", dot: "animate-pulse bg-[#f6c177]", text: "text-white/80" },
  offline: { label: "Offline", dot: "bg-[#f28b82]", text: "text-white/70" },
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[16px] font-semibold tabular-nums leading-none text-[#1d2129]">
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#8a8f98]">{label}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-[12px] text-[#6b7280]">{label}</dt>
      <dd className="text-[11px] text-[#4b5563]">{value}</dd>
    </div>
  );
}

export default function Home() {
  const { posts, totalPosts, isLoading, error, status, addPost } = useWallFeed();
  const connection = STATUS[status];

  const voices = useMemo(
    () =>
      new Set(
        posts.map((post) => post.author_name.trim().toLowerCase()).filter((name) => name.length),
      ).size,
    [posts],
  );
  const photos = useMemo(() => posts.filter((post) => post.image_url).length, [posts]);
  const latest = posts[0]?.created_at;
  const latestPhoto = useMemo(
    () => posts.find((post) => post.image_url)?.created_at,
    [posts],
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7] text-[#1d2129]">
      <header className="sticky top-0 z-30 bg-[#3b5998]">
        <div className="mx-auto flex h-12 max-w-4xl items-center justify-between px-4">
          <div className="flex items-baseline gap-3">
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-white">
              the WALL
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/60">
              2026
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 ${connection.dot}`} />
            <span className={`text-[11px] ${connection.text}`}>{connection.label}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-12 md:gap-6">
          <aside className="md:col-span-4">
            <div className="space-y-4 md:sticky md:top-[68px]">
              <section className="border border-[#d3d6db] bg-white p-5">
                <div className="flex items-center gap-3.5">
                  <div
                    aria-hidden="true"
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-[2px] bg-[#3b5998] text-[15px] font-semibold text-white"
                  >
                    RD
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-[#1d2129]">
                      Ruselle Daanoy
                    </h1>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-[#6b7280]">
                      <MapPin size={11} strokeWidth={1.75} aria-hidden="true" />
                      Quezon City, Philippines
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-[12.5px] leading-relaxed text-[#4b5563]">
                  A quiet, chronological wall for people you actually know.
                </p>

                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#e2e8f0] pt-4">
                  <Stat
                    label="Posts"
                    value={isLoading ? "—" : String(totalPosts ?? posts.length)}
                    hint="Every post on the wall"
                  />
                  <Stat
                    label="Voices"
                    value={isLoading ? "—" : String(voices)}
                    hint="Distinct authors in the latest 50 posts"
                  />
                  <Stat
                    label="Photos"
                    value={isLoading ? "—" : String(photos)}
                    hint="Photos in the latest 50 posts"
                  />
                </div>
              </section>

              <section className="border border-[#d3d6db] bg-white">
                <dl className="divide-y divide-[#e2e8f0]">
                  <Detail
                    label="Latest post"
                    value={
                      latest
                        ? formatDistanceToNow(new Date(latest), { addSuffix: true })
                        : "—"
                    }
                  />
                  <Detail
                    label="Latest photo"
                    value={
                      latestPhoto
                        ? formatDistanceToNow(new Date(latestPhoto), { addSuffix: true })
                        : "None yet"
                    }
                  />
                  <Detail
                    label="Connection"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 ${connection.dot}`}
                        />
                        {connection.label}
                      </span>
                    }
                  />
                </dl>
                <p className="border-t border-[#e2e8f0] px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#9aa0a8]">
                  Quezon City · Est. 2026
                </p>
              </section>
            </div>
          </aside>

          <div className="space-y-5 md:col-span-8">
            <WallComposer onPosted={addPost} />
            <WallFeed posts={posts} isLoading={isLoading} error={error} />
          </div>
        </div>
      </main>

      <footer className="border-t border-[#e2e8f0]">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-1 px-4 py-5 text-[10px] text-[#9aa0a8] sm:flex-row sm:items-center sm:justify-between">
          <span>the wall — no algorithm, no ranking</span>
          <span>Supabase Realtime · Est. 2026</span>
        </div>
      </footer>
    </div>
  );
}
