export type Customer = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'BLOCKED';
  createdAt: Date;
  updatedAt: Date;
};

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  ensureFromAuth(input: {
    id: string;
    email: string;
    fullName?: string | null;
    phone?: string | null;
  }): Promise<Customer>;
  updateProfile(
    id: string,
    input: { fullName?: string | null; phone?: string | null },
  ): Promise<Customer>;
  list(params: {
    page: number;
    pageSize: number;
    q?: string;
  }): Promise<{ items: Customer[]; total: number }>;
  setStatus(id: string, status: Customer['status']): Promise<Customer>;
}
