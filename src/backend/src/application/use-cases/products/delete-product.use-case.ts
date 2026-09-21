import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../../domain/repositories/product.repository.js';
import { NotFoundException } from '../../../domain/exceptions/domain.exception.js';

@Injectable()
export class DeleteProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: ProductRepository,
  ) {}

  async execute(id: string) {
    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Product', id);
    }
    await this.productRepository.delete(id);
  }
}
