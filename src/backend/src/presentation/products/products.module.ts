import { Module } from '@nestjs/common';
import { CreateProductUseCase } from '../../application/use-cases/products/create-product.use-case.js';
import { DeleteProductUseCase } from '../../application/use-cases/products/delete-product.use-case.js';
import { GetProductUseCase } from '../../application/use-cases/products/get-product.use-case.js';
import { ListProductsUseCase } from '../../application/use-cases/products/list-products.use-case.js';
import { UpdateProductUseCase } from '../../application/use-cases/products/update-product.use-case.js';
import { SupabaseModule } from '../../infrastructure/supabase/supabase.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProductsController } from './products.controller.js';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [ProductsController],
  providers: [
    CreateProductUseCase,
    ListProductsUseCase,
    GetProductUseCase,
    UpdateProductUseCase,
    DeleteProductUseCase,
  ],
})
export class ProductsModule {}
