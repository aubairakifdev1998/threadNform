import { Inject, Injectable } from '@nestjs/common';
import type { CreateProductProps } from '../../../domain/entities/product.entity.js';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../../domain/repositories/product.repository.js';
import { ValidationException } from '../../../domain/exceptions/domain.exception.js';

@Injectable()
export class CreateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: ProductRepository,
  ) {}

  execute(props: CreateProductProps) {
    if (props.price < 0) {
      throw new ValidationException('Price cannot be negative');
    }
    if (props.stock < 0) {
      throw new ValidationException('Stock cannot be negative');
    }
    if (!props.name.trim()) {
      throw new ValidationException('Product name is required');
    }

    return this.productRepository.create(props);
  }
}
