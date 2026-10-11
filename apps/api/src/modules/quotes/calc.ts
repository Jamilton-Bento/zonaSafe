export interface OfferLike {
  id?: string;
  supplierName: string;
  unitPriceCents: number;
  quantity: number;
  shippingCents: number;
  meetsSpecs: boolean;
}

export const offerTotal = (unitPriceCents: number, quantity: number, shippingCents: number) =>
  unitPriceCents * quantity + shippingCents;

export const MIN_VALID_OFFERS = 3;

export interface Analysis {
  validCount: number;
  distinctSuppliers: number;
  complete: boolean;
  message: string;
  lowestValidId: string | null;   // menor custo total entre as ofertas que atendem às especificações
  recommendedId: string | null;   // só existe se a pesquisa estiver completa
}

/**
 * Oferta válida: atende às especificações, preço > 0 e quantidade > 0.
 * Pesquisa completa: ao menos 3 ofertas válidas de fornecedores distintos.
 * Nunca recomenda oferta que não atenda às especificações.
 */
export function analyzeOffers(offers: (OfferLike & { id: string; totalCents: number })[]): Analysis {
  const valid = offers.filter((o) => o.meetsSpecs && o.unitPriceCents > 0 && o.quantity > 0);
  const suppliers = new Set(valid.map((o) => o.supplierName.trim().toLowerCase()));
  const lowest = valid.reduce<typeof valid[number] | null>((m, o) => (!m || o.totalCents < m.totalCents ? o : m), null);
  const complete = valid.length >= MIN_VALID_OFFERS && suppliers.size >= MIN_VALID_OFFERS;
  return {
    validCount: valid.length,
    distinctSuppliers: suppliers.size,
    complete,
    lowestValidId: lowest?.id ?? null,
    recommendedId: complete ? lowest?.id ?? null : null,
    message: complete
      ? 'Pesquisa completa: ao menos três ofertas válidas de fornecedores distintos.'
      : `Pesquisa INCOMPLETA: ${suppliers.size} fornecedor(es) com oferta válida; são necessárias ao menos ${MIN_VALID_OFFERS}. Nenhuma recomendação foi emitida.`,
  };
}
