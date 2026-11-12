import type { PublicBranch, PublicClinic, PublicService } from "./public";

/**
 * Structured data (§14.2, §25.1) generated from public DTOs only.
 * Returns null — emits nothing — unless the clinic identity AND branch address
 * are verified. Never placeholder addresses/coordinates, never aggregateRating.
 */
export function siteUrl(path = ""): string {
  return `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function clinicJsonLd(
  clinic: PublicClinic,
  branch: PublicBranch,
  services: PublicService[],
  hours: { weekday: number; opens: string; closes: string }[] = [],
) {
  if (!clinic.identityVerified || !branch.addressVerified || !branch.addressLine || !branch.phone) return null;
  const clinicId = siteUrl("/contact#clinic");
  const catalogId = siteUrl("/services#catalog");
  const clinicNode: Record<string, unknown> = {
    "@type": "MedicalClinic",
    "@id": clinicId,
    name: clinic.tradeName,
    url: siteUrl("/contact"),
    telephone: branch.phone,
    medicalSpecialty: "https://schema.org/Physiotherapy",
    address: {
      "@type": "PostalAddress",
      streetAddress: branch.addressLine,
      addressLocality: branch.city ?? undefined,
      addressRegion: branch.region ?? undefined,
      postalCode: branch.postalCode ?? undefined,
      addressCountry: "IN",
    },
  };
  if (branch.mapUrl) clinicNode.hasMap = branch.mapUrl;
  if (hours.length) {
    clinicNode.openingHoursSpecification = hours.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${DAYS[h.weekday]}`,
      opens: h.opens,
      closes: h.closes,
    }));
  }
  if (branch.latitude && branch.longitude) {
    clinicNode.geo = { "@type": "GeoCoordinates", latitude: Number(branch.latitude), longitude: Number(branch.longitude) };
  }
  if (services.length) clinicNode.hasOfferCatalog = { "@id": catalogId };
  const graph: Record<string, unknown>[] = [clinicNode];
  if (services.length) {
    graph.push({
      "@type": "OfferCatalog",
      "@id": catalogId,
      name: "Physiotherapy services",
      itemListElement: services.map((s) => ({
        "@type": "Offer",
        ...(s.pricePaise ? { price: (Number(BigInt(s.pricePaise)) / 100).toFixed(2), priceCurrency: "INR" } : {}),
        itemOffered: { "@type": "Service", name: s.name, url: siteUrl(`/services/${s.slug}`), provider: { "@id": clinicId } },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/**
 * Relationship markup (relatedLink / isRelatedTo) is optional description, not a
 * ranking lever. RELATIONSHIP_SCHEMA=off removes it site-wide without touching
 * the visible links it describes.
 */
export function relationshipSchemaEnabled(): boolean {
  return process.env.RELATIONSHIP_SCHEMA !== "off";
}

/** `relatedLink` for a WebPage node. Pass only paths the page actually rendered as visible links. */
export function relatedLinkProp(renderedPaths: string[]): { relatedLink?: string[] } {
  const urls = [...new Set(renderedPaths)].map((p) => siteUrl(p));
  return relationshipSchemaEnabled() && urls.length ? { relatedLink: urls } : {};
}

/** `isRelatedTo` for a Service node, pointing at other live Service entities by their existing @id. */
export function isRelatedToProp(services: { slug: string; name: string }[]): { isRelatedTo?: Record<string, string>[] } {
  if (!relationshipSchemaEnabled() || !services.length) return {};
  return {
    isRelatedTo: services.map((s) => ({
      "@type": "Service",
      "@id": siteUrl(`/services/${s.slug}#service`),
      name: s.name,
      url: siteUrl(`/services/${s.slug}`),
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: siteUrl(it.path) })),
  };
}

/** Native JSON-LD script with `<` escaped, per Next.js guidance [N5]. */
export function JsonLd({ data }: { data: unknown }) {
  const safe = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safe }} />;
}
