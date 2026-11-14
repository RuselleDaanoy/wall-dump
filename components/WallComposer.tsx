"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, ImagePlus, Loader2, X } from "lucide-react";
import { isSupabaseConfigured, supabase, type Post } from "@/lib/supabase";

const MAX_CHARS = 280;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.85;
const DEFAULT_AUTHOR = "Ruselle Daanoy";
const BUCKET = "wall-photos";

function extensionFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

/**
 * Shrinks large photos to a sensible size before upload. Animated GIFs and
 * images that are already small are sent untouched, and any canvas/decoder
 * failure falls back to the original file.
 */
async function prepareImage(file: File): Promise<File> {
  if (file.type === "image/gif" || file.size <= 600 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const largestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / largestSide);

    if (scale === 1 && file.size <= MAX_UPLOAD_BYTES) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY);
    });

    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

interface WallComposerProps {
  onPosted?: (post: Post) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function WallComposer({ onPosted }: WallComposerProps) {
  const [author, setAuthor] = useState(DEFAULT_AUTHOR);
  const [message, setMessage] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remaining = MAX_CHARS - message.length;
  const canShare = message.trim().length > 0 && !isPosting;

  function clearImage() {
    setImage(null);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setNotice(null);

    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image. Choose a JPG, PNG, GIF or WebP.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_SOURCE_BYTES) {
      setError("That image is larger than 25 MB. Try a smaller one.");
      event.target.value = "";
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  async function uploadImage(
    file: File,
  ): Promise<{ url: string | null; error: string | null }> {
    try {
      const extension = extensionFor(file.type);
      const date = new Date().toISOString().slice(0, 10);
      const path = `${date}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "image/jpeg",
        });

      if (uploadError) return { url: null, error: uploadError.message };

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (!data.publicUrl) return { url: null, error: "No public URL was returned" };
      return { url: data.publicUrl, error: null };
    } catch (error) {
      // Storage may not be configured; the post should still go through.
      return {
        url: null,
        error: error instanceof Error ? error.message : "Storage request failed",
      };
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canShare) return;

    setError(null);
    setNotice(null);

    if (!isSupabaseConfigured) {
      setError("The wall isn't connected. Add your Supabase URL and anon key to .env.");
      return;
    }

    setIsPosting(true);

    try {
      let imageUrl: string | null = null;
      let uploadError: string | null = null;

      if (image) {
        const prepared = await prepareImage(image);

        if (prepared.size > MAX_UPLOAD_BYTES) {
          uploadError = "the photo is still larger than 5 MB after optimizing";
        } else {
          const upload = await uploadImage(prepared);
          imageUrl = upload.url;
          uploadError = upload.error;
        }
      }

      const { data, error: insertError } = await supabase
        .from("posts")
        .insert({
          author_name: author.trim() || "Anonymous",
          message: message.trim(),
          image_url: imageUrl,
        })
        .select("*")
        .single();

      if (insertError) {
        setError(insertError.message || "Couldn't share your post. Please try again.");
        return;
      }

      onPosted?.(data as Post);
      setMessage("");
      clearImage();

      if (uploadError) {
        setNotice(
          `Your photo couldn't be uploaded (${uploadError}), so the post was shared without it.`,
        );
      }
    } catch {
      setError("Couldn't reach the wall. Check your connection and try again.");
    } finally {
      setIsPosting(false);
    }
  }

  return (
    <section className="border border-[#d3d6db] bg-white">
      <form onSubmit={handleSubmit} className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[2px] bg-[#eef1f6] text-[10px] font-semibold tracking-wide text-[#3b5998]"
          >
            {initials(author)}
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="author-name" className="sr-only">
              Your name
            </label>
            <input
              id="author-name"
              name="author"
              type="text"
              autoComplete="name"
              maxLength={60}
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Your name"
              className="w-full border-0 bg-transparent p-0 text-[13px] font-semibold text-[#1d2129] outline-none placeholder:font-normal placeholder:text-[#9aa0a8]"
            />
            <p className="text-[11px] text-[#8a8f98]">Posting to the wall</p>
          </div>
        </div>

        <label htmlFor="wall-message" className="sr-only">
          Message
        </label>
        <textarea
          id="wall-message"
          name="message"
          rows={3}
          maxLength={MAX_CHARS}
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, MAX_CHARS))}
          placeholder="What's on your mind?"
          className="mt-3 block w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-relaxed text-[#1d2129] outline-none placeholder:text-[#9aa0a8]"
        />

        {preview ? (
          <div className="mt-3 flex items-start gap-3 border-t border-[#e2e8f0] pt-3">
            <div className="relative border border-[#e2e8f0] p-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img
                src={preview}
                alt="Selected photo preview"
                className="block h-20 w-20 object-cover"
              />
              <button
                type="button"
                onClick={clearImage}
                aria-label="Remove photo"
                className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-[2px] border border-[#d3d6db] bg-white text-[#6b7280] transition-colors hover:border-[#b91c1c] hover:text-[#b91c1c]"
              >
                <X size={12} />
              </button>
            </div>
            <p className="pt-1 text-[11px] leading-relaxed text-[#6b7280]">
              Photo attached.
              <br />
              <span className="text-[#9aa0a8]">Large photos are resized automatically.</span>
            </p>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 border border-[#f0c2c2] bg-[#fdf3f3] px-3 py-2 text-[12px] leading-relaxed text-[#a12a2a]"
          >
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}

        {notice ? (
          <p className="mt-3 border border-[#e8ddc4] bg-[#fbf7ee] px-3 py-2 text-[12px] leading-relaxed text-[#8a6a1f]">
            {notice}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#e2e8f0] pt-3">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              id="wall-photo"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="sr-only"
            />
            <label
              htmlFor="wall-photo"
              className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-[#6b7280] transition-colors hover:text-[#3b5998]"
            >
              <ImagePlus size={15} strokeWidth={1.75} />
              Photo
            </label>
            <span
              aria-live="polite"
              className={`text-[11px] tabular-nums ${
                remaining === 0
                  ? "text-[#b91c1c]"
                  : remaining <= 20
                    ? "text-[#b45309]"
                    : "text-[#9aa0a8]"
              }`}
            >
              {remaining} left
            </span>
          </div>

          <button
            type="submit"
            disabled={!canShare}
            className="inline-flex min-w-[92px] items-center justify-center gap-2 rounded-[2px] bg-[#3b5998] px-4 py-1.5 text-[12px] font-semibold tracking-wide text-white transition-colors hover:bg-[#334f88] focus:outline-none focus:ring-2 focus:ring-[#3b5998]/30 disabled:cursor-not-allowed disabled:bg-[#a8b3c9]"
          >
            {isPosting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Sharing
              </>
            ) : (
              "Share"
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
