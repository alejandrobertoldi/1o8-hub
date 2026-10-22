/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/nextjs-missing-metadata */
"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Clock, LogOut } from "lucide-react";
import { BrandWatermark } from "@/components/auth/brand-watermark";

export default function RegisterPage() {
  const { data: session } = useSession();
  const [fullName, setFullName] = useState(session?.user?.name ?? "");
  const [clientName, setClientName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Check if user already submitted (has clientIdCode set)
  const { data: syncData } = useQuery({
    queryKey: ["register-check"],
    queryFn: async () => {
      const res = await fetch("/api/auth/session-sync");
      return res.json();
    },
  });

  const alreadySubmitted =
    submitted ||
    (syncData?.user?.role === "pending" && syncData?.user?.clientIdCode);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, clientName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Registration failed");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadySubmitted) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/40">
        <BrandWatermark />
        <Card className="relative z-10 w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-amber-500/15">
              <Clock className="size-6 text-amber-500" />
            </div>
            <CardTitle className="text-xl">Pending Approval</CardTitle>
            <CardDescription>
              Your registration has been submitted. An admin will review and
              approve your access shortly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            >
              <LogOut className="mr-2 size-4" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/40">
      <BrandWatermark />
      <Card className="relative z-10 w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">1o8 Hub</CardTitle>
          <CardDescription>
            Complete your registration to request access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                value={session?.user?.email ?? ""}
                disabled
                className="bg-muted text-foreground"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Client / Company</label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Your client or company name"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !fullName.trim() || !clientName.trim()}
            >
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Request Access
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            >
              <LogOut className="mr-2 size-4" />
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
