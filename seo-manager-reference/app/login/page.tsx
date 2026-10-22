/* eslint-disable react-doctor/nextjs-no-img-element */
/* eslint-disable jsx-a11y/no-autofocus */
/* eslint-disable react-doctor/nextjs-missing-metadata */
/* eslint-disable react-doctor/react-compiler-destructure-method */
/* eslint-disable react-doctor/prefer-useReducer */
/* eslint-disable jsx-a11y/label-has-associated-control */
/* eslint-disable react-doctor/design-no-em-dash-in-jsx-text */
/* eslint-disable react-doctor/design-no-bold-heading */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthBrowserClient } from "@/lib/auth-browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createAuthBrowserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo + title */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="1o8 Agency" width={56} height={56} className="rounded-lg mb-4" />
          <h1 className="text-xl font-extrabold tracking-tight text-zinc-100">1o8 SEO Manager</h1>
          <p className="text-xs text-zinc-500 mt-1">Amazon Listing Optimization</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
          <h2 className="text-sm font-bold text-zinc-200">
            {isSignUp ? "Create Account" : "Sign In"}
          </h2>

          {error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-zinc-500 mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-zinc-500 mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500 focus:outline-none"
              placeholder="Min 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {loading ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
          </button>

          <p className="text-center text-xs text-zinc-500">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              className="text-amber-400 hover:text-amber-300 underline"
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </form>

        <p className="text-center text-[10px] text-zinc-700 mt-6">
          1o8 Marketplace SEO — RUFUS + COSMO System
        </p>
      </div>
    </div>
  );
}
