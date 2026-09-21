import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateProductUseCase } from '../../application/use-cases/products/create-product.use-case.js';
import { DeleteProductUseCase } from '../../application/use-cases/products/delete-product.use-case.js';
import { GetProductUseCase } from '../../application/use-cases/products/get-product.use-case.js';
import { ListProductsUseCase } from '../../application/use-cases/products/list-products.use-case.js';
import { UpdateProductUseCase } from '../../application/use-cases/products/update-product.use-case.js';
import type { User } from '../../domain/entities/user.entity.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly createProduct: CreateProductUseCase,
    private readonly listProducts: ListProductsUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly deleteProduct: DeleteProductUseCase,
  ) {}

  @Get()
  findAll() {
    return this.listProducts.execute();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.getProduct.execute(id);
  }

  @Post()
  @UseGuards(SupabaseAuthGuard)
  create(@Body() dto: CreateProductDto, @CurrentUser() user: User) {
    return this.createProduct.execute({
      name: dto.name,
      description: dto.description,
      price: dto.price,
      imageUrl: dto.imageUrl,
      stock: dto.stock,
      createdBy: user.id,
    });
  }

  @Patch(':id')
  @UseGuards(SupabaseAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.updateProduct.execute(id, {
      name: dto.name,
      description: dto.description,
      price: dto.price,
      imageUrl: dto.imageUrl,
      stock: dto.stock,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SupabaseAuthGuard)
  async remove(@Param('id') id: string) {
    await this.deleteProduct.execute(id);
  }
}
