import { Seller } from '../../core/types';

export interface ProductListing {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  seller: Seller;
  isSubscription: boolean;
  subscriptionDetails?: string;
  marketPriceEstimate?: number;
  inventoryCount: number;
  imageUrl?: string;
}

export interface ProductSearchParams {
  query: string;
  category?: string;
  maxPrice?: number;
  limit?: number;
}

export interface ProductSearchProvider {
  name: string;
  search(params: ProductSearchParams): Promise<ProductListing[]>;
  getById(id: string): Promise<ProductListing | null>;
  getAll(): Promise<ProductListing[]>;
}
