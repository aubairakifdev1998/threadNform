import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type {
  CustomerAddress,
  CustomerAddressRepository,
} from '../../../domain/repositories/customer-address.repository.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import { customerAddresses } from '../../drizzle/schema/index.js';

@Injectable()
export class SupabaseCustomerAddressRepository
  implements CustomerAddressRepository
{
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async listByCustomer(customerId: string): Promise<CustomerAddress[]> {
    const rows = await this.db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, customerId))
      .orderBy(desc(customerAddresses.createdAt));
    return rows.map((row) => this.map(row));
  }

  async findById(id: string): Promise<CustomerAddress | null> {
    const [row] = await this.db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.id, id))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async create(
    input: Omit<CustomerAddress, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CustomerAddress> {
    if (input.isDefaultShipping) {
      await this.clearDefaultShipping(input.customerId);
    }
    const [row] = await this.db
      .insert(customerAddresses)
      .values({
        customerId: input.customerId,
        fullName: input.fullName,
        line1: input.line1,
        line2: input.line2,
        city: input.city,
        county: input.county,
        postcode: input.postcode,
        postcodeNormalized: input.postcodeNormalized,
        country: input.country,
        phone: input.phone,
        isDefaultShipping: input.isDefaultShipping,
      })
      .returning();
    return this.map(row);
  }

  async update(
    id: string,
    customerId: string,
    input: Partial<
      Omit<CustomerAddress, 'id' | 'customerId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<CustomerAddress> {
    if (input.isDefaultShipping) {
      await this.clearDefaultShipping(customerId);
    }
    const [row] = await this.db
      .update(customerAddresses)
      .set({
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.line1 !== undefined ? { line1: input.line1 } : {}),
        ...(input.line2 !== undefined ? { line2: input.line2 } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.county !== undefined ? { county: input.county } : {}),
        ...(input.postcode !== undefined ? { postcode: input.postcode } : {}),
        ...(input.postcodeNormalized !== undefined
          ? { postcodeNormalized: input.postcodeNormalized }
          : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.isDefaultShipping !== undefined
          ? { isDefaultShipping: input.isDefaultShipping }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(customerAddresses.id, id),
          eq(customerAddresses.customerId, customerId),
        ),
      )
      .returning();
    return this.map(row);
  }

  async delete(id: string, customerId: string): Promise<void> {
    await this.db
      .delete(customerAddresses)
      .where(
        and(
          eq(customerAddresses.id, id),
          eq(customerAddresses.customerId, customerId),
        ),
      );
  }

  async clearDefaultShipping(customerId: string): Promise<void> {
    await this.db
      .update(customerAddresses)
      .set({ isDefaultShipping: false })
      .where(
        and(
          eq(customerAddresses.customerId, customerId),
          eq(customerAddresses.isDefaultShipping, true),
        ),
      );
  }

  private map(row: typeof customerAddresses.$inferSelect): CustomerAddress {
    return {
      id: row.id,
      customerId: row.customerId,
      fullName: row.fullName,
      line1: row.line1,
      line2: row.line2 ?? null,
      city: row.city,
      county: row.county ?? null,
      postcode: row.postcode,
      postcodeNormalized: row.postcodeNormalized,
      country: row.country,
      phone: row.phone ?? null,
      isDefaultShipping: row.isDefaultShipping,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
