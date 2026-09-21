import type {
  CreateProductProps,
  Product,
  UpdateProductProps,
} from '../entities/product.entity.js';

export interface ProductRepository {
  create(props: CreateProductProps): Promise<Product>;
  findById(id: string): Promise<Product | null>;
  findAll(): Promise<Product[]>;
  update(id: string, props: UpdateProductProps): Promise<Product>;
  delete(id: string): Promise<void>;
}

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');
