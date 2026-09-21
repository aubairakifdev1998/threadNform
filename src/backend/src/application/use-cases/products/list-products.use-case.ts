import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../../domain/repositories/product.repository.js';

@Injectable()
export class ListProductsUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: ProductRepository,
  ) {}

  execute() {
    return this.productRepository.findAll();
  }
}
