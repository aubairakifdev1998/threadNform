export type CustomerAddress = {
  id: string;
  customerId: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  county: string | null;
  postcode: string;
  postcodeNormalized: string;
  country: string;
  phone: string | null;
  isDefaultShipping: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const CUSTOMER_ADDRESS_REPOSITORY = Symbol('CUSTOMER_ADDRESS_REPOSITORY');

export interface CustomerAddressRepository {
  listByCustomer(customerId: string): Promise<CustomerAddress[]>;
  findById(id: string): Promise<CustomerAddress | null>;
  create(input: Omit<CustomerAddress, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomerAddress>;
  update(
    id: string,
    customerId: string,
    input: Partial<Omit<CustomerAddress, 'id' | 'customerId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CustomerAddress>;
  delete(id: string, customerId: string): Promise<void>;
  clearDefaultShipping(customerId: string): Promise<void>;
}
