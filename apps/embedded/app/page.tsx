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

  return <HomeGate forceShopify={forceShopify} />;
}
