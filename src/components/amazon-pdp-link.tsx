import { computeAmazonPdpUrl } from "@/lib/computed-fields";
import { cn } from "@/lib/utils";

const SMILE_CLASS = "size-3.5 object-contain";

function AmazonSmileMark({ variant }: { variant: "on-dark" | "on-light" | "auto" }) {
  if (variant === "on-dark") {
    return <img src="/amazon-smile-white.png" alt="" width={14} height={14} className={SMILE_CLASS} />;
  }
  if (variant === "on-light") {
    return <img src="/amazon-smile-black.png" alt="" width={14} height={14} className={SMILE_CLASS} />;
  }
  return (
    <>
      <img src="/amazon-smile-black.png" alt="" width={14} height={14} className={`${SMILE_CLASS} dark:hidden`} />
      <img src="/amazon-smile-white.png" alt="" width={14} height={14} className={`${SMILE_CLASS} hidden dark:block`} />
    </>
  );
}

/** Amazon smile linking to AmazonPDPURL (`https://www.amazon.com/dp/{ASIN}`). */
export function AmazonPdpLink({
  asin,
  href,
  className,
  variant = "auto",
}: {
  asin: string | null | undefined;
  href?: string | null;
  className?: string;
  /** White on dark surfaces, black on light. `auto` follows the app theme. */
  variant?: "on-dark" | "on-light" | "auto";
}) {
  const pdpUrl = href?.trim() || computeAmazonPdpUrl(asin ?? null);
  if (!pdpUrl) return null;

  return (
    <a
      href={pdpUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex shrink-0 opacity-90 hover:opacity-100 transition-opacity", className)}
      title="Open Amazon product page"
      aria-label="Open Amazon product page"
    >
      <AmazonSmileMark variant={variant} />
    </a>
  );
}
