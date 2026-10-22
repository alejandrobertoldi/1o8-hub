import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { users, aac } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { resolveClientAllowedSections } from "@/lib/auth-helpers";
import { resolveSignInImage } from "@/lib/avatars/url";

// Local draft only: passwordless sign-in as DEV_LOGIN_EMAIL. Registered
// solely on the dev server (`next dev`), never in a production build.
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
            credentials: {},
            // No name: the DB row keeps the real one (getAuthSession only overwrites on a new value).
            authorize: () => ({ email: process.env.DEV_LOGIN_EMAIL! }),
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, account, profile, user, trigger, session: updateData }) {
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
      // When client calls update() with new role/sections, persist in the token
      if (trigger === "update" && updateData?.role) {
        token.role = updateData.role;
      }
      if (trigger === "update" && updateData?.allowedSections) {
        token.allowedSections = updateData.allowedSections;
      }
      if (trigger === "update" && updateData?.clientIdCode !== undefined) {
        token.clientIdCode = updateData.clientIdCode;
      }
      if (trigger === "update" && updateData?.isSuperAdmin !== undefined) {
        token.isSuperAdmin = updateData.isSuperAdmin;
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
