/* eslint-disable react-doctor/nextjs-no-client-side-redirect */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/react-compiler-destructure-method */
"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { ReactNode, useEffect } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

function SessionSync() {
  const { data: session, update } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!session?.user?.email) return;

    // Fetch the DB-resolved role and update the client session
    fetch("/api/auth/session-sync")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          const needsUpdate =
            data.user.role !== session.user.role ||
            JSON.stringify(data.user.allowedSections ?? []) !==
              JSON.stringify(session.user.allowedSections ?? []) ||
            data.user.clientIdCode !== session.user.clientIdCode;
          if (needsUpdate) {
            update({
              role: data.user.role,
              allowedSections: data.user.allowedSections ?? [],
              clientIdCode: data.user.clientIdCode ?? null,
            });
          }
          // Redirect pending users to registration page
          if (data.user.role === "pending" && !pathname.startsWith("/auth/register")) {
            router.replace("/auth/register");
          }
          // Redirect client users to portal if they landed on an internal page
          if (data.user.role === "client" && !pathname.startsWith("/portal")) {
            router.replace("/portal");
          }
        }
      })
      .catch(() => {});
  }, [session?.user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <SessionSync />
      {children}
    </NextAuthSessionProvider>
  );
}
