import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client with cookie-based auth sessions.
 * Use in client components ("use client").
 */
export function createAuthBrowserClient() {
  return createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
