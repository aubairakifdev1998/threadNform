import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type {
  Customer,
  CustomerRepository,
} from '../../../domain/repositories/customer.repository.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import { customers } from '../../drizzle/schema/index.js';

@Injectable()
export class SupabaseCustomerRepository implements CustomerRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDB,
  ) {}

  async findById(id: string): Promise<Customer | null> {
    const [row] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const [row] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.email, email.toLowerCase()))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async ensureFromAuth(input: {
    id: string;
    email: string;
    fullName?: string | null;
    phone?: string | null;
  }): Promise<Customer> {
    const existing = await this.findById(input.id);
    if (existing) return existing;

    const [row] = await this.db
      .insert(customers)
      .values({
        id: input.id,
        email: input.email.toLowerCase(),
        fullName: input.fullName ?? null,
        phone: input.phone ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          email: input.email.toLowerCase(),
          fullName: input.fullName ?? null,
          phone: input.phone ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return this.map(row);
  }

  async updateProfile(
    id: string,
    input: { fullName?: string | null; phone?: string | null },
  ): Promise<Customer> {
    const [row] = await this.db
      .update(customers)
      .set({
        fullName: input.fullName,
        phone: input.phone,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, id))
      .returning();
    return this.map(row);
  }

  async list(params: {
    page: number;
    pageSize: number;
    q?: string;
  }): Promise<{ items: Customer[]; total: number }> {
    const filters: SQL[] = [];
    if (params.q) {
      const pattern = `%${params.q}%`;
      filters.push(
        or(
          ilike(customers.email, pattern),
          ilike(customers.fullName, pattern),
          ilike(customers.phone, pattern),
        )!,
      );
    }
    const where = filters.length ? and(...filters) : undefined;
    const offset = (params.page - 1) * params.pageSize;

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(customers)
        .where(where)
        .orderBy(desc(customers.createdAt))
        .limit(params.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(customers).where(where),
    ]);

    return {
      items: items.map((row) => this.map(row)),
      total: totalRow?.value ?? 0,
    };
  }

  async setStatus(id: string, status: Customer['status']): Promise<Customer> {
    const [row] = await this.db
      .update(customers)
      .set({ status, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return this.map(row);
  }

  private map(row: typeof customers.$inferSelect): Customer {
    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName ?? null,
      phone: row.phone ?? null,
      status: row.status as Customer['status'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
