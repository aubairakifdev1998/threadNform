export type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: 'OWNER' | 'ADMIN' | 'STAFF';
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
};

export const ADMIN_USER_REPOSITORY = Symbol('ADMIN_USER_REPOSITORY');

export interface AdminUserRepository {
  findById(id: string): Promise<AdminUser | null>;
  findByEmail(email: string): Promise<AdminUser | null>;
  upsert(input: {
    id: string;
    email: string;
    fullName?: string | null;
    role: AdminUser['role'];
  }): Promise<AdminUser>;
}
