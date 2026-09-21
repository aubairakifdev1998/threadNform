import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type {
  AdminUser,
  AdminUserRepository,
} from '../../../domain/repositories/admin-user.repository.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import { adminUsers } from '../../drizzle/schema/index.js';

@Injectable()
export class SupabaseAdminUserRepository implements AdminUserRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDB,
  ) {}

  async findById(id: string): Promise<AdminUser | null> {
    const [row] = await this.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, id))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async findByEmail(email: string): Promise<AdminUser | null> {
    const [row] = await this.db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase()))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async upsert(input: {
    id: string;
    email: string;
    fullName?: string | null;
    role: AdminUser['role'];
  }): Promise<AdminUser> {
    const [row] = await this.db
      .insert(adminUsers)
      .values({
        id: input.id,
        email: input.email.toLowerCase(),
        fullName: input.fullName ?? null,
        role: input.role,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: adminUsers.id,
        set: {
          email: input.email.toLowerCase(),
          fullName: input.fullName ?? null,
          role: input.role,
          updatedAt: new Date(),
        },
      })
      .returning();
    return this.map(row);
  }

  private map(row: typeof adminUsers.$inferSelect): AdminUser {
    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName ?? null,
      role: row.role as AdminUser['role'],
      status: row.status as AdminUser['status'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
