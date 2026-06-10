export type AtlasDomain = { id: string; name: string; color: string; sortOrder: number };
export type AtlasProduct = { id: string; name: string; slug: string; sortOrder: number };
export type AtlasInitiative = {
  id: string;
  title: string;
  domainId: string;
  productId?: string | null;
  status: string;
  horizon: string;
  priority: string;
};
export type AtlasFeature = { id: string; title: string; initiativeId: string; status: string };
export type AtlasRequirement = { id: string; title: string; featureId: string; status: string };
export type AtlasTopic = { id: string; slug: string; title: string; sortOrder: number };

export type AtlasGraphPayload = {
  domains: AtlasDomain[];
  products: AtlasProduct[];
  initiativeIndex: AtlasInitiative[];
  featureIndex: AtlasFeature[];
  requirementIndex: AtlasRequirement[];
  architectureTopicIndex?: AtlasTopic[];
};

export type GraphNodeKind = "domain" | "product" | "initiative" | "feature" | "requirement" | "topic";

export type GraphSelection = { kind: GraphNodeKind; id: string };

export type RequirementNode = AtlasRequirement;
export type FeatureNode = AtlasFeature & { requirements: RequirementNode[] };
export type InitiativeNode = AtlasInitiative & { features: FeatureNode[] };
export type ProductNode = { id: string; name: string; slug: string; initiatives: InitiativeNode[] };
export type DomainNode = AtlasDomain & { products: ProductNode[] };

export type TopicLink = { initiativeId: string; initiativeTitle: string };

export type TopicGraphInfo = AtlasTopic & { linkedInitiatives: TopicLink[] };

const NO_PRODUCT_ID = "__no_product__";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function initiativeMatchesQuery(init: InitiativeNode, q: string): boolean {
  if (norm(init.title).includes(q)) return true;
  return init.features.some(
    (f) =>
      norm(f.title).includes(q) ||
      f.requirements.some((r) => norm(r.title).includes(q))
  );
}

function productMatchesQuery(product: ProductNode, q: string): boolean {
  if (norm(product.name).includes(q)) return true;
  return product.initiatives.some((i) => initiativeMatchesQuery(i, q));
}

function domainMatchesQuery(domain: DomainNode, q: string): boolean {
  if (norm(domain.name).includes(q)) return true;
  return domain.products.some((p) => productMatchesQuery(p, q));
}

export function filterDomainTree(domains: DomainNode[], query: string): DomainNode[] {
  const q = norm(query);
  if (!q) return domains;

  return domains
    .map((domain) => {
      if (!domainMatchesQuery(domain, q)) return null;
      const products = domain.products
        .map((product) => {
          if (!productMatchesQuery(product, q)) return null;
          const initiatives = product.initiatives
            .map((init) => {
              if (!initiativeMatchesQuery(init, q)) return null;
              const features = init.features
                .map((feat) => {
                  const featHit = norm(feat.title).includes(q);
                  const reqs = feat.requirements.filter((r) => norm(r.title).includes(q));
                  if (featHit) return feat;
                  if (reqs.length > 0) return { ...feat, requirements: reqs };
                  return null;
                })
                .filter((f): f is FeatureNode => f != null);
              if (norm(init.title).includes(q)) return init;
              return features.length > 0 ? { ...init, features } : null;
            })
            .filter((i): i is InitiativeNode => i != null);
          if (norm(product.name).includes(q)) return product;
          return initiatives.length > 0 ? { ...product, initiatives } : null;
        })
        .filter((p): p is ProductNode => p != null);
      if (norm(domain.name).includes(q)) return domain;
      return products.length > 0 ? { ...domain, products } : null;
    })
    .filter((d): d is DomainNode => d != null);
}

export function buildDomainTree(atlas: AtlasGraphPayload): DomainNode[] {
  const domains = [...(atlas.domains ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const products = atlas.products ?? [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const featuresByInitiative = new Map<string, FeatureNode[]>();
  for (const f of atlas.featureIndex) {
    const list = featuresByInitiative.get(f.initiativeId) ?? [];
    list.push({ ...f, requirements: [] });
    featuresByInitiative.set(f.initiativeId, list);
  }
  const reqsByFeature = new Map<string, RequirementNode[]>();
  for (const r of atlas.requirementIndex) {
    const list = reqsByFeature.get(r.featureId) ?? [];
    list.push(r);
    reqsByFeature.set(r.featureId, list);
  }
  for (const [, feats] of featuresByInitiative) {
    for (const f of feats) {
      f.requirements = reqsByFeature.get(f.id) ?? [];
    }
  }

  const initiativesByDomainProduct = new Map<string, Map<string, InitiativeNode[]>>();
  for (const init of atlas.initiativeIndex) {
    const productKey = init.productId ?? NO_PRODUCT_ID;
    let byProduct = initiativesByDomainProduct.get(init.domainId);
    if (!byProduct) {
      byProduct = new Map();
      initiativesByDomainProduct.set(init.domainId, byProduct);
    }
    const list = byProduct.get(productKey) ?? [];
    list.push({ ...init, features: featuresByInitiative.get(init.id) ?? [] });
    byProduct.set(productKey, list);
  }

  return domains.map((domain) => {
    const byProduct = initiativesByDomainProduct.get(domain.id) ?? new Map();
    const productKeys = [...byProduct.keys()].sort((a, b) => {
      if (a === NO_PRODUCT_ID) return 1;
      if (b === NO_PRODUCT_ID) return -1;
      const pa = productById.get(a)?.name ?? a;
      const pb = productById.get(b)?.name ?? b;
      return pa.localeCompare(pb);
    });

    const products: ProductNode[] = productKeys.map((productKey) => {
      const meta = productKey === NO_PRODUCT_ID ? null : productById.get(productKey);
      return {
        id: productKey,
        name: meta?.name ?? "",
        slug: meta?.slug ?? "",
        initiatives: byProduct.get(productKey) ?? []
      };
    });

    return { ...domain, products };
  });
}

export function buildTopicGraph(
  topics: AtlasTopic[],
  initiativeTitleById: Map<string, string>,
  topicEdges: Map<string, string[]>
): TopicGraphInfo[] {
  return [...topics]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map((topic) => {
      const ids = topicEdges.get(topic.id) ?? [];
      const linkedInitiatives = ids.map((initiativeId) => ({
        initiativeId,
        initiativeTitle: initiativeTitleById.get(initiativeId) ?? initiativeId
      }));
      return { ...topic, linkedInitiatives };
    });
}

export function selectionObjectType(kind: GraphNodeKind): string {
  switch (kind) {
    case "topic":
      return "ARCHITECTURE_TOPIC";
    default:
      return kind.toUpperCase();
  }
}

export function findSelectionLabel(atlas: AtlasGraphPayload, selection: GraphSelection): string | null {
  switch (selection.kind) {
    case "domain":
      return atlas.domains.find((d) => d.id === selection.id)?.name ?? null;
    case "product": {
      if (selection.id === NO_PRODUCT_ID) return null;
      return atlas.products.find((p) => p.id === selection.id)?.name ?? null;
    }
    case "initiative":
      return atlas.initiativeIndex.find((i) => i.id === selection.id)?.title ?? null;
    case "feature":
      return atlas.featureIndex.find((f) => f.id === selection.id)?.title ?? null;
    case "requirement":
      return atlas.requirementIndex.find((r) => r.id === selection.id)?.title ?? null;
    case "topic":
      return atlas.architectureTopicIndex?.find((t) => t.id === selection.id)?.title ?? null;
    default:
      return null;
  }
}

export function findSelectionStatus(atlas: AtlasGraphPayload, selection: GraphSelection): string | null {
  switch (selection.kind) {
    case "initiative":
      return atlas.initiativeIndex.find((i) => i.id === selection.id)?.status ?? null;
    case "feature":
      return atlas.featureIndex.find((f) => f.id === selection.id)?.status ?? null;
    case "requirement":
      return atlas.requirementIndex.find((r) => r.id === selection.id)?.status ?? null;
    default:
      return null;
  }
}

export { NO_PRODUCT_ID };
