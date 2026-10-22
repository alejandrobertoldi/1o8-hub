import ListingImagesClientPage from "./page.client";

export default function Page({
  params,
}: {
  params: Promise<{ clientIdCode: string }>;
}) {
  return <ListingImagesClientPage params={params} />;
}
