import { jsonRoute } from "@/lib/http";
import { getPublicServices } from "@/modules/content/public";

export const dynamic = "force-dynamic";

/** GET /api/v1/public/services — approved public catalog only (§19.2). */
export async function GET() {
  return jsonRoute(async () => {
    const services = await getPublicServices();
    return services.map((s) => ({
      id: s.id, slug: s.slug, name: s.name, category: s.category, summary: s.summary,
      durationMinutes: s.durationMinutes, billingUnit: s.billingUnit, bookable: s.bookable,
      price: s.pricePaise ? { amountPaise: s.pricePaise, currency: "INR" } : null, feePolicy: s.pricePaise ? null : s.feePolicyText,
    }));
  });
}
