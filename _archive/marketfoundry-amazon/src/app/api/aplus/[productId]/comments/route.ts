/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aplusComments, master, users } from "@/lib/db/schema";
import { eq, desc, and, sql, isNull, ne, inArray } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { sendEmail, buildAplusCommentEmail } from "@/lib/email";

export const maxDuration = 60;

// GET — fetch all comments for a product
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productId } = await params;

  try {

  const role = session.user.role;
  const userClientIdCode = (session.user as { clientIdCode?: string | null }).clientIdCode ?? null;

  // Client users only see client-audience comments matching their clientIdCode
  const conditions = [eq(aplusComments.productId, productId)];
  if (role === "client") {
    conditions.push(eq(aplusComments.audience, "client"));
    if (userClientIdCode) {
      conditions.push(eq(aplusComments.clientIdCode, userClientIdCode));
    } else {
      // Client with no clientIdCode sees nothing
      return NextResponse.json({ comments: [] });
    }
  }

  const comments = await db
    .select()
    .from(aplusComments)
    .where(and(...conditions))
    .orderBy(desc(aplusComments.createdAt));

  return NextResponse.json({ comments });

  } catch (err) {
    console.error("[aplus comments GET] Error:", err);
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

// POST — create a new comment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessSection(session, "aplus")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { productId } = await params;
  const body = await req.json();

  const { moduleId, parentCommentId, body: commentBody, pinX, pinY, audience: requestAudience } = body;

  if (!commentBody?.trim()) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  // Auto-increment comment number for top-level comments
  let commentNumber: number | null = null;
  if (!parentCommentId) {
    const [maxResult] = await db
      .select({ max: sql<number>`COALESCE(MAX(comment_number), 0)` })
      .from(aplusComments)
      .where(
        and(
          eq(aplusComments.productId, productId),
          sql`parent_comment_id IS NULL`
        )
      );
    commentNumber = (maxResult?.max ?? 0) + 1;
  }

  // Determine audience + clientIdCode
  const postRole = session.user.role;
  const postUserClientIdCode = (session.user as { clientIdCode?: string | null }).clientIdCode ?? null;

  let commentAudience: string;
  let commentClientIdCode: string | null;

  if (postRole === "client") {
    // Client users always post as "client"
    commentAudience = "client";
    commentClientIdCode = postUserClientIdCode;
  } else {
    // Internal users: default "internal", but allow "client" when replying to client threads
    commentAudience = requestAudience === "client" ? "client" : "internal";
    commentClientIdCode = requestAudience === "client" ? (body.clientIdCode ?? null) : null;
  }

  try {
    const [comment] = await db
      .insert(aplusComments)
      .values({
        productId,
        moduleId: moduleId || null,
        parentCommentId: parentCommentId || null,
        authorEmail: session.user.email ?? "",
        authorName: session.user.name ?? null,
        body: commentBody.trim(),
        pinX: pinX != null ? Math.round(pinX) : null,
        pinY: pinY != null ? Math.round(pinY) : null,
        commentNumber,
        audience: commentAudience,
        clientIdCode: commentClientIdCode,
      })
      .returning();

    // Fire-and-forget email notification to admins/editors (don't block response)
    (async () => {
      try {
        const [product] = await db
          .select({ name: master.itemName })
          .from(master)
          .where(eq(master.id, productId))
          .limit(1);

        // Notify admins and editors (except the comment author)
        const recipients = await db
          .select({ email: users.email })
          .from(users)
          .where(
            and(
              inArray(users.role, ["owner", "super_admin", "admin", "editor"]),
              ne(users.email, session.user.email ?? "")
            )
          );

        const emailContent = buildAplusCommentEmail({
          authorName: session.user.name ?? null,
          authorEmail: session.user.email ?? "",
          productName: product?.name ?? "Unknown product",
          productId,
          body: commentBody.trim(),
          audience: commentAudience,
          commentNumber,
        });

        for (const r of recipients) {
          await sendEmail({ to: r.email, ...emailContent });
        }
      } catch (err) {
        console.error("[comments POST] Notification error:", err);
      }
    })();

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[comments POST] Insert error:", msg, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create comment" },
      { status: 500 }
    );
  }
}
