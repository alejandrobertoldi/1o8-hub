import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { categoryDefinitions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isEditorOrAbove } from "@/lib/roles";
import { getAttributesForCategory } from "@/lib/category-meta-queries";
import { categoryDefinitionColumns } from "@/lib/category-definitions/columns";
import {
  buildClientProductImportWorkbook,
  marketplaceFromId,
} from "@/lib/product-excel-import";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEditorOrAbove(session.user.role)) {
    return NextResponse.json(
      { error: "Forbidden: viewers cannot create products" },
      { status: 403 }
    );
  }

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode")?.trim() ?? "";
  if (!clientIdCode) {
    return NextResponse.json(
      { error: "Select a client before downloading the template" },
      { status: 400 }
    );
  }

  const defs = await db
    .select(categoryDefinitionColumns)
    .from(categoryDefinitions)
    .where(eq(categoryDefinitions.clientIdCode, clientIdCode))
    .orderBy(categoryDefinitions.productType);

  if (defs.length === 0) {
    return NextResponse.json(
      {
        error:
          "No Category Listing Report found for this client. Upload a CLR during onboarding first.",
      },
      { status: 400 }
    );
  }

  const sheets = await Promise.all(
    defs.map(async (def) => {
      const attrs = await getAttributesForCategory(
        def.marketplaceId,
        def.productType
      );
      return {
        productType: def.productType,
        marketplace: marketplaceFromId(def.marketplaceId),
        attributes: attrs.map((a) => ({
          generalLabel: a.generalLabel,
          referenceGroup: a.groupName || a.referenceGroup,
          groupName: a.groupName || a.referenceGroup,
          requirement: a.requirement,
          isKey: a.isKey,
          sortOrder: a.sortOrder ?? null,
        })),
      };
    })
  );

  const bytes = buildClientProductImportWorkbook({ clientIdCode, sheets });
  const filename = `product-import-${clientIdCode.toLowerCase()}.xlsx`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
