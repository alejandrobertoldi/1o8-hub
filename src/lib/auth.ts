import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { users, aac } from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { resolveClientAllowedSections } from "@/lib/auth-helpers";
import { resolveSignInImage } from "@/lib/avatars/url";

// Local draft only: passwordless sign-in as DEV_LOGIN_EMAIL, or as any user
// picked on the sign-in page ("Sign in as", to see the hub with their role).
// Registered solely on the dev server (`next dev`), never in a production build.
export const DEV_LOGIN_ENABLED =
  process.env.NODE_ENV === "development" && !!process.env.DEV_LOGIN_EMAIL;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    ...(DEV_LOGIN_ENABLED
      ? [
          Credentials({
            id: "dev-login",
            name: "Local dev login",
            credentials: { email: {} },
            // No name: the DB row keeps the real one (getAuthSession only overwrites on a new value).
            authorize: (credentials) => {
              const picked = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
              return { email: picked || process.env.DEV_LOGIN_EMAIL! };
            },
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    // Deactivated people (Admin → Users → Deactivated) can't sign in; anyone
    // without a row still can (they become a pending sign-up).
    async signIn({ user, profile }) {
      const email = (profile?.email ?? user?.email ?? "").toLowerCase();
      if (!email) return true;
      const [row] = await db
        .select({ status: users.employmentStatus })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      return !row || row.status === "active" ? true : "/auth/signin?error=Deactivated";
    },
    async jwt({ token, account, profile, user, trigger }) {
      // The dev-login provider has no OAuth profile; synthesize one from `user`.
      if (account?.provider === "dev-login" && user?.email) {
        profile = { email: user.email, name: user.name ?? null };
      }
      // On initial sign-in, store basic info and resolve DB role immediately
      if (account && profile?.email) {
        token.email = profile.email;
        token.name = profile.name;
        token.picture = profile.picture;

        // Resolve role from DB at sign-in time so middleware has correct role
        const dbUser = await db
          .select({
            id: users.id,
            role: users.role,
            isSuperAdmin: users.isSuperAdmin,
            clientIdCode: users.clientIdCode,
            allowedSections: users.allowedSections,
            image: users.image,
          })
          .from(users)
          .where(eq(users.email, profile.email))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        if (dbUser) {
          token.dbId = dbUser.id;
          token.role = dbUser.role;
          // Super Admin is a real role; keep JWT flag in sync for nav that
          // still reads session.user.isSuperAdmin before getAuthSession runs.
          token.isSuperAdmin =
            dbUser.role === "owner" ||
            dbUser.role === "super_admin" ||
            dbUser.isSuperAdmin;
          token.clientIdCode = dbUser.clientIdCode;
          token.allowedSections = dbUser.allowedSections;

          // Persist Google's picture onto users.image so /team and directory
          // cards can show it for everyone — unless we already captured the
          // user's avatar into our own storage, which always wins. The token
          // carries the stored avatar (or the DB image when Google sends none)
          // so the client-side user menu / portal shell show it too.
          const picture =
            typeof profile.picture === "string" ? profile.picture : null;
          const img = resolveSignInImage({ dbImage: dbUser.image, profilePicture: picture });
          if (img.write) {
            await db
              .update(users)
              .set({ image: img.write })
              .where(eq(users.id, dbUser.id));
          }
          token.picture = img.tokenPicture;
        } else {
          token.role = "pending";
          token.isSuperAdmin = false;
        }
      }
      // A session update() comes from the browser, so its payload is never
      // trusted (it used to be copied into the token, letting anyone set their
      // own role to "owner"). On update we re-read role/sections from the DB
      // and ignore whatever the client sent.
      if (trigger === "update" && token.email) {
        const [fresh] = await db
          .select({
            id: users.id,
            role: users.role,
            isSuperAdmin: users.isSuperAdmin,
            clientIdCode: users.clientIdCode,
            allowedSections: users.allowedSections,
          })
          .from(users)
          .where(eq(users.email, token.email))
          .limit(1);
        if (fresh) {
          token.dbId = fresh.id;
          token.role = fresh.role;
          token.isSuperAdmin = fresh.role === "owner" || fresh.role === "super_admin" || fresh.isSuperAdmin;
          token.clientIdCode = fresh.clientIdCode;
          token.allowedSections = fresh.allowedSections;
        } else {
          token.role = "pending";
          token.isSuperAdmin = false;
          token.clientIdCode = null;
          token.allowedSections = [];
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.email) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      const role = (token.role as string | undefined) ?? "viewer";
      session.user.role = role as typeof session.user.role;
      if (role === "client" || role === "prospect") {
        session.user.allowedSections = await resolveClientAllowedSections(
          (token.clientIdCode as string | null) ?? null,
          async (codes) => {
            const rows = await db
              .select({ allowedSections: aac.allowedSections })
              .from(aac)
              .where(inArray(aac.clientIdCode, codes));
            return rows;
          },
        );
      } else {
        // staff / pending — keep existing per-user array
        session.user.allowedSections = (token.allowedSections as string[]) ?? [];
      }
      session.user.clientIdCode = (token.clientIdCode as string | null) ?? null;
      session.user.isSuperAdmin =
        role === "owner" ||
        role === "super_admin" ||
        ((token.isSuperAdmin as boolean) ?? false);
      // Demo/showcase: clients labelled "Prospect" in aac.client_status see sample data.
      session.user.clientStatus = null;
      if ((role === "client" || role === "prospect") && token.clientIdCode) {
        const firstCode = (token.clientIdCode as string).split(",")[0].trim();
        const [statusRow] = await db
          .select({ status: aac.clientStatus })
          .from(aac)
          .where(eq(aac.clientIdCode, firstCode))
          .limit(1);
        session.user.clientStatus = statusRow?.status ?? null;
      }
      if (token.dbId) {
        session.user.id = token.dbId as string;
      }
      return session;
    },
  },
});
