"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Trash2, Upload } from "lucide-react";

type Props = {
  images: { url: string; label: string; fileId?: string }[];
  initialIndex: number;
  onClose: () => void;
  onDelete?: (fileId: string) => void;
  onReplace?: (fileId: string) => void;
};

export function ImageLightbox({ images, initialIndex, onClose, onDelete, onReplace }: Props) {
  const [currentIdx, setCurrentIdx] = useState(initialIndex);
  const [showControls, setShowControls] = useState(false);

  const goNext = useCallback(() => {
    setCurrentIdx((i) => (i + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIdx((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowRight":
          goNext();
          break;
        case "ArrowLeft":
          goPrev();
          break;
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, goNext, goPrev]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const current = images[currentIdx];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={onClose}
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className={`absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-opacity ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Top bar: counter + actions */}
      <div
        className={`absolute top-4 left-4 z-10 flex items-center gap-3 transition-opacity ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="text-white/70 text-sm">
          {currentIdx + 1} / {images.length}
          <span className="ml-2 text-white/50">{current.label}</span>
        </span>
        {current.fileId && (
          <div className="flex items-center gap-2">
            {onReplace && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReplace(current.fileId!);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 text-white text-xs font-bold hover:bg-white/20 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Replace
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this image?")) onDelete(current.fileId!);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/20 text-red-300 text-xs font-bold hover:bg-red-500/40 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Previous button */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-opacity ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Main image */}
      <img
        src={current.url}
        alt={current.label}
        className="max-h-[90vh] max-w-[90vw] object-contain select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* Next button */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className={`absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-opacity ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 transition-opacity ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIdx(idx);
              }}
              className={`h-12 w-12 rounded border-2 overflow-hidden transition-all ${
                idx === currentIdx
                  ? "border-white scale-110"
                  : "border-white/30 opacity-60 hover:opacity-100"
              }`}
            >
              <img
                src={img.url}
                alt={img.label}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
