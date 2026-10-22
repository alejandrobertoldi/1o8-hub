"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, Check } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { type CalendarEvent, type EventType, EVENT_STYLES } from "./types";

function buildGCalUrl(data: {
  title: string;
  startDate: string;
  endDate: string;
  description: string | null;
}): string {
  const start = data.startDate.replace(/-/g, "");
  const endD = new Date(
    Number(data.endDate.slice(0, 4)),
    Number(data.endDate.slice(5, 7)) - 1,
    Number(data.endDate.slice(8, 10)) + 1,
  );
  const end = `${endD.getFullYear()}${String(endD.getMonth() + 1).padStart(2, "0")}${String(endD.getDate()).padStart(2, "0")}`;
  const params = new URLSearchParams({ text: data.title, dates: `${start}/${end}` });
  if (data.description) params.set("details", data.description);
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}

interface EventPopoverFormProps {
  initial: CalendarEvent | { startDate: string; endDate?: string }; // partial = create mode
  onSave: (data: {
    title: string;
    startDate: string;
    endDate: string;
    type: EventType;
    memberName: string | null;
    description: string | null;
  }) => Promise<void> | void;
  onCancel: () => void;
  onDelete?: () => Promise<void> | void;
  saving?: boolean;
  deleting?: boolean;
}

function isFullEvent(v: EventPopoverFormProps["initial"]): v is CalendarEvent {
  return "id" in v && typeof v.id === "string";
}

export function EventPopoverForm({
  initial,
  onSave,
  onCancel,
  onDelete,
  saving,
  deleting,
}: EventPopoverFormProps) {
  const editMode = isFullEvent(initial);

  const [title, setTitle] = useState(editMode ? initial.title : "");
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(
    editMode ? initial.endDate : (initial.endDate ?? initial.startDate)
  );
  const [type, setType] = useState<EventType>(editMode ? initial.type : "deadline");
  const [memberName, setMemberName] = useState(
    editMode ? (initial.memberName ?? "") : ""
  );
  const [description, setDescription] = useState(
    editMode ? (initial.description ?? "") : ""
  );
  const [addToGcal, setAddToGcal] = useState(false);

  // Keep endDate >= startDate
  useEffect(() => {
    if (endDate < startDate) setEndDate(startDate);
  }, [startDate, endDate]);

  const canSave = title.trim().length > 0 && startDate && endDate && endDate >= startDate;

  const handleSubmit = async () => {
    if (!canSave) return;
    const saveData = {
      title: title.trim(),
      startDate,
      endDate,
      type,
      memberName: type === "pto" ? (memberName.trim() || null) : null,
      description: description.trim() || null,
    };
    await onSave(saveData);
    if (addToGcal) {
      window.open(buildGCalUrl(saveData), "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="space-y-3 w-[320px]">
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
          Title
        </label>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Spring Campaign Launch"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          className="h-9 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
            Start
          </label>
          <DatePicker
            value={startDate}
            onChange={setStartDate}
            className="h-9 w-full text-xs"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
            End
          </label>
          <DatePicker
            value={endDate}
            onChange={setEndDate}
            className="h-9 w-full text-xs"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
          Type
        </label>
        <Select value={type} onValueChange={(v) => setType(v as EventType)}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(EVENT_STYLES) as EventType[]).map((t) => {
              const s = EVENT_STYLES[t];
              const Icon = s.icon;
              return (
                <SelectItem key={t} value={t}>
                  <span className="inline-flex items-center gap-2">
                    <Icon className={`size-3.5 ${s.text}`} />
                    {s.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {type === "pto" && (
        <div>
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
            Team Member
          </label>
          <Input
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            placeholder="e.g. Maria, John…"
            className="h-9 text-sm"
          />
        </div>
      )}

      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
          Description
        </label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional notes…"
          rows={2}
          className="text-xs resize-none"
        />
      </div>

      <div className="flex items-center gap-2 pt-1 pb-0.5">
        <Switch
          id="gcal-sync"
          checked={addToGcal}
          onCheckedChange={setAddToGcal}
          className="scale-90"
        />
        <label htmlFor="gcal-sync" className="text-[11px] text-muted-foreground cursor-pointer select-none">
          Add to Google Calendar
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {editMode && onDelete ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-2"
                disabled={deleting || saving}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                <AlertDialogDescription>
                  &quot;{title}&quot; will be removed from the calendar. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSave || saving}
            onClick={handleSubmit}
            className="h-8 text-xs bg-brand-solid text-white hover:bg-brand-solid-hover"
          >
            <Check className="size-3.5 mr-1" />
            {saving ? "Saving…" : editMode ? "Save" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}
