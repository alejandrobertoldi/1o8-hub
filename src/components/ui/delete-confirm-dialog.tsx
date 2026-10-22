/* eslint-disable jsx-a11y/no-autofocus */
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description: ReactNode;
  confirmWord?: string;
  confirmLabel?: string;
  pending?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Confirm deletion",
  description,
  confirmWord = "delete",
  confirmLabel = "Delete",
  pending = false,
}: DeleteConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === confirmWord.toLowerCase();

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-500">{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">{description}</div>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label className="text-sm text-muted-foreground">
            Type <strong className="text-foreground">{confirmWord}</strong> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && matches && !pending) onConfirm(); }}
            placeholder={confirmWord}
            disabled={pending}
            className="w-full h-9 px-3 text-sm bg-background border border-border rounded-md outline-none focus:border-red-500 transition-colors disabled:opacity-50"
            autoFocus
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!matches || pending}
            onClick={onConfirm}
          >
            {pending ? (
              <><Loader2 className="size-3 mr-1 animate-spin" /> Deleting…</>
            ) : (
              <><Trash2 className="size-3 mr-1" /> {confirmLabel}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
