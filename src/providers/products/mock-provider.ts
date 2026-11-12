import { ProductListing, ProductSearchParams, ProductSearchProvider } from './types';
import { SEED_PRODUCTS } from './seed-data';

export class MockProductProvider implements ProductSearchProvider {
  public readonly name = 'Mock Product Search Provider';
  private products: ProductListing[];

  constructor(initialProducts: ProductListing[] = SEED_PRODUCTS) {
    this.products = [...initialProducts];
  }

  public async search(params: ProductSearchParams): Promise<ProductListing[]> {
    const query = params.query.toLowerCase().trim();
    const queryTokens = query.split(/\s+/).filter(Boolean);

    let results = this.products.filter((p) => {
      // Category filter
      if (params.category && p.category.toLowerCase() !== params.category.toLowerCase()) {
        return false;
      }
      // Max price filter
      if (params.maxPrice !== undefined && p.price > params.maxPrice) {
        return false;
      }

      if (queryTokens.length === 0) return true;

      const searchableText = `${p.title} ${p.description} ${p.category} ${p.seller.name}`.toLowerCase();
      // Match if any query token is found in the item
      return queryTokens.some((tok) => searchableText.includes(tok));
    });

    // Score results by relevance: title matches rank higher
    results.sort((a, b) => {
      const aTitleMatch = queryTokens.filter((tok) => a.title.toLowerCase().includes(tok)).length;
      const bTitleMatch = queryTokens.filter((tok) => b.title.toLowerCase().includes(tok)).length;
      return bTitleMatch - aTitleMatch;
    });

    if (params.limit && params.limit > 0) {
      results = results.slice(0, params.limit);
    }

    return results;
  }

  public async getById(id: string): Promise<ProductListing | null> {
    const item = this.products.find((p) => p.id === id);
    return item ? { ...item } : null;
  }

  public async getAll(): Promise<ProductListing[]> {
    return [...this.products];
  }
}

export const mockProductProvider = new MockProductProvider();

