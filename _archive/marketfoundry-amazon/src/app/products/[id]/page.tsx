import { ProductDetailForm } from "@/components/products/product-detail-form";
import { ProductDetailMeta } from "./page-meta";

export const metadata = { title: "Product | 1o8 Hub" };

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; marketplace?: string; set?: string; variation?: string }>;
}) {
  const { id } = await params;
  const { from, marketplace, set, variation } = await searchParams;

  return (
    <>
      <ProductDetailMeta />
      <ProductDetailForm
        productId={id}
        from={from}
        fromMarketplace={marketplace}
        fromSet={set}
        fromVariationId={variation}
      />
    </>
  );
}
