import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import {
  Product,
  type CreateProductProps,
  type UpdateProductProps,
} from '../../../domain/entities/product.entity.js';
import { DomainException } from '../../../domain/exceptions/domain.exception.js';
import type { ProductRepository } from '../../../domain/repositories/product.repository.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import { products } from '../../drizzle/schema/index.js';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || `product-${Date.now()}`
  );
}

@Injectable()
export class SupabaseProductRepository implements ProductRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(props: CreateProductProps): Promise<Product> {
    try {
      const [row] = await this.db
        .insert(products)
        .values({
          name: props.name,
          slug: slugify(props.name),
          description: props.description ?? null,
          status: 'DRAFT',
        })
        .returning();
      return this.toEntity(row, props.price, props.stock, props.imageUrl, props.createdBy);
    } catch (error) {
      throw new DomainException(
        error instanceof Error ? error.message : 'Failed to create product',
        'DATABASE_ERROR',
      );
    }
  }

  async findById(id: string): Promise<Product | null> {
    const [row] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findAll(): Promise<Product[]> {
    const rows = await this.db
      .select()
      .from(products)
      .orderBy(desc(products.createdAt));
    return rows.map((row) => this.toEntity(row));
  }

  async update(id: string, props: UpdateProductProps): Promise<Product> {
    try {
      const [row] = await this.db
        .update(products)
        .set({
          ...(props.name !== undefined ? { name: props.name } : {}),
          ...(props.description !== undefined
            ? { description: props.description }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();
      if (!row) {
        throw new DomainException('Product not found', 'DATABASE_ERROR');
      }
      return this.toEntity(row, props.price, props.stock, props.imageUrl);
    } catch (error) {
      if (error instanceof DomainException) throw error;
      throw new DomainException(
        error instanceof Error ? error.message : 'Failed to update product',
        'DATABASE_ERROR',
      );
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db
        .update(products)
        .set({ status: 'ARCHIVED', archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(products.id, id));
    } catch (error) {
      throw new DomainException(
        error instanceof Error ? error.message : 'Failed to delete product',
        'DATABASE_ERROR',
      );
    }
  }

  private toEntity(
    row: typeof products.$inferSelect,
    price = 0,
    stock = 0,
    imageUrl: string | null = null,
    createdBy = '',
  ): Product {
    return new Product(
      row.id,
      row.name,
      row.description,
      price,
      imageUrl,
      stock,
      createdBy,
      row.createdAt,
      row.updatedAt,
    );
  }
}
