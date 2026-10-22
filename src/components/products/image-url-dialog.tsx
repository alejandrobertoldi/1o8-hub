"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ImageOff,
} from "lucide-react";

type PreviewState = "idle" | "loading" | "valid" | "invalid";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slotLabel: string;
  currentUrl: string;
  onSave: (url: string) => Promise<void>;
};

export function ImageUrlDialog({
  open,
  onOpenChange,
  slotLabel,
  currentUrl,
  onSave,
}: Props) {
  const [url, setUrl] = useState(currentUrl);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setUrl(currentUrl);
      setPreviewState(currentUrl ? "loading" : "idle");
      setSaving(false);
    }
  }, [open, currentUrl]);

  // Debounced URL validation via image load test
  const validateUrl = useCallback((testUrl: string) => {
    if (!testUrl.trim()) {
      setPreviewState("idle");
      return;
    }
    setPreviewState("loading");
    const img = new Image();
    img.onload = () => setPreviewState("valid");
    img.onerror = () => setPreviewState("invalid");
    img.src = testUrl;
  }, []);

  const handleUrlChange = useCallback(
    (newUrl: string) => {
      setUrl(newUrl);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => validateUrl(newUrl), 500);
    },
    [validateUrl]
  );

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(url);
    } finally {
      setSaving(false);
    }
  }, [url, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !saving) {
        e.preventDefault();
        handleSave();
      }
    },
    [saving, handleSave]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {slotLabel} URL</DialogTitle>
          <DialogDescription>
            Enter an image URL. A live preview will confirm the image loads
            correctly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* URL input */}
          <div className="space-y-1.5">
            <Label htmlFor="image-url" className="text-xs text-muted-foreground">
              Image URL
            </Label>
            <div className="relative">
              <Input
                id="image-url"
                type="url"
                placeholder="https://images-na.ssl-images-amazon.com/..."
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pr-8"
                autoFocus
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                {previewState === "loading" && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/70" />
                )}
                {previewState === "valid" && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                )}
                {previewState === "invalid" && (
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                )}
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-border bg-muted/50 flex items-center justify-center min-h-[200px] overflow-hidden">
            {previewState === "valid" && url ? (
              <img
                src={url}
                alt="Preview"
                className="max-h-[200px] max-w-full object-contain"
              />
            ) : previewState === "loading" ? (
              <div className="text-center text-muted-foreground/70">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-1" />
                <p className="text-xs">Loading preview...</p>
              </div>
            ) : previewState === "invalid" ? (
              <div className="text-center text-red-400">
                <ImageOff className="h-6 w-6 mx-auto mb-1" />
                <p className="text-xs">Failed to load image</p>
              </div>
            ) : (
              <div className="text-center text-muted-foreground/80">
                <ImageOff className="h-6 w-6 mx-auto mb-1" />
                <p className="text-xs">Enter a URL to preview</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-solid text-white hover:bg-brand-solid-hover"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
