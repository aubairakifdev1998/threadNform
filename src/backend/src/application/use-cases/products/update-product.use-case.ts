import { Inject, Injectable } from '@nestjs/common';
import type { UpdateProductProps } from '../../../domain/entities/product.entity.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../../domain/repositories/product.repository.js';
import {
  NotFoundException,
  ValidationException,
} from '../../../domain/exceptions/domain.exception.js';

@Injectable()
export class UpdateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: ProductRepository,
  ) {}

  async execute(id: string, props: UpdateProductProps) {
    if (props.price !== undefined && props.price < 0) {
      throw new ValidationException('Price cannot be negative');
    }
    if (props.stock !== undefined && props.stock < 0) {
      throw new ValidationException('Stock cannot be negative');
    }

    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Product', id);
    }

    return this.productRepository.update(id, props);
  }
}
