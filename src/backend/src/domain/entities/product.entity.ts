export class Product {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string | null,
    public readonly price: number,
    public readonly imageUrl: string | null,
    public readonly stock: number,
    public readonly createdBy: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}

export type CreateProductProps = {
  name: string;
  description?: string | null;
  price: number;
  imageUrl?: string | null;
  stock: number;
  createdBy: string;
};

export type UpdateProductProps = {
  name?: string;
  description?: string | null;
  price?: number;
  imageUrl?: string | null;
  stock?: number;
};
