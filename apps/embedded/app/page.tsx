import { HomeGate } from "./components/HomeGate";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const shop = typeof params.shop === "string" ? params.shop : "";
  const host = typeof params.host === "string" ? params.host : "";
  const embedded = params.embedded === "1" || params.embedded === "true";
  const forceShopify = Boolean(shop || host || embedded);
  const apiKey =
    process.env.SHOPIFY_API_KEY ?? process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "";

  return <HomeGate forceShopify={forceShopify} apiKey={apiKey} />;
}
