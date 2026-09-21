import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Permission } from '../../domain/auth/permissions.js';
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from '../../domain/repositories/catalog.repository.js';
import {
  CUSTOMER_ADDRESS_REPOSITORY,
  type CustomerAddressRepository,
} from '../../domain/repositories/customer-address.repository.js';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../../domain/repositories/customer.repository.js';
import { assertUkShippingAddress } from '../../domain/shared/uk-address.js';
import { ValidationException } from '../../domain/exceptions/domain.exception.js';
import type { User } from '../../domain/entities/user.entity.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';

class AddressBodyDto {
  @IsString() fullName!: string;
  @IsString() line1!: string;
  @IsOptional() @IsString() line2?: string;
  @IsString() city!: string;
  @IsOptional() @IsString() county?: string;
  @IsString() postcode!: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isDefaultShipping?: boolean;
}

class CreateAttributeDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() inputType?: string;
}

class CreateAttributeOptionDto {
  @IsString() value!: string;
  @IsString() label!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

class AssignProductAttributeDto {
  @IsUUID() attributeId!: string;
  @IsIn(['VARIANT_DEFINING', 'INFORMATIONAL'])
  role!: 'VARIANT_DEFINING' | 'INFORMATIONAL';
}

class CreateSizeSystemDto {
  @IsString() code!: string;
  @IsString() name!: string;
}

class CreateSizeValueDto {
  @IsString() code!: string;
  @IsString() label!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

class CreateSizeChartDto {
  @IsString() name!: string;
  @IsIn(['PRODUCT', 'CATEGORY']) scopeType!: 'PRODUCT' | 'CATEGORY';
  @IsUUID() scopeId!: string;
  @IsOptional() @IsUUID() sizeSystemId?: string;
}

class SizeChartRowDto {
  @IsString() sizeLabel!: string;
  @IsObject() measurements!: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;
}

@ApiTags('customers', 'catalog-admin')
@Controller()
export class CatalogExtrasController {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(CUSTOMER_ADDRESS_REPOSITORY)
    private readonly addresses: CustomerAddressRepository,
  ) {}

  // —— Customer profile ——
  @Get('customers/me')
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  async getMe(@CurrentUser() user: User) {
    return this.customers.ensureFromAuth({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
  }

  @Patch('customers/me')
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    await this.customers.ensureFromAuth({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
    return this.customers.updateProfile(user.id, {
      fullName: dto.fullName,
      phone: dto.phone,
    });
  }

  // —— Customer addresses ——
  @Get('customers/me/addresses')
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  async listAddresses(@CurrentUser() user: User) {
    await this.customers.ensureFromAuth({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
    return this.addresses.listByCustomer(user.id);
  }

  @Post('customers/me/addresses')
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  async createAddress(@CurrentUser() user: User, @Body() dto: AddressBodyDto) {
    await this.customers.ensureFromAuth({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
    const addr = assertUkShippingAddress(dto);
    return this.addresses.create({
      customerId: user.id,
      ...addr,
      isDefaultShipping: dto.isDefaultShipping ?? false,
    });
  }

  @Patch('customers/me/addresses/:id')
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  async updateAddress(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: AddressBodyDto,
  ) {
    const existing = await this.addresses.findById(id);
    if (!existing || existing.customerId !== user.id) {
      throw new ValidationException('Address not found', 'NOT_FOUND');
    }
    const addr = assertUkShippingAddress(dto);
    return this.addresses.update(id, user.id, {
      ...addr,
      isDefaultShipping: dto.isDefaultShipping,
    });
  }

  @Delete('customers/me/addresses/:id')
  @ApiBearerAuth()
  @UseGuards(SupabaseAuthGuard)
  async deleteAddress(@CurrentUser() user: User, @Param('id') id: string) {
    await this.addresses.delete(id, user.id);
    return { deleted: true };
  }

  // —— Attributes ——
  @Get('attributes')
  listAttributes() {
    return this.catalog.listAttributes();
  }

  @Post('admin/attributes')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createAttribute(@Body() dto: CreateAttributeDto) {
    return this.catalog.createAttribute(dto);
  }

  @Get('attributes/:id/options')
  listAttributeOptions(@Param('id') id: string) {
    return this.catalog.listAttributeOptions(id);
  }

  @Post('admin/attributes/:id/options')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createAttributeOption(
    @Param('id') id: string,
    @Body() dto: CreateAttributeOptionDto,
  ) {
    return this.catalog.createAttributeOption({
      attributeId: id,
      ...dto,
    });
  }

  @Post('admin/products/:productId/attributes')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async assignProductAttribute(
    @Param('productId') productId: string,
    @Body() dto: AssignProductAttributeDto,
  ) {
    await this.catalog.assignProductAttribute({
      productId,
      attributeId: dto.attributeId,
      role: dto.role,
    });
    return { assigned: true };
  }

  // —— Size systems / charts ——
  @Get('size-systems')
  listSizeSystems() {
    return this.catalog.listSizeSystems();
  }

  @Get('size-systems/:id/values')
  listSizeValues(@Param('id') id: string) {
    return this.catalog.listSizeSystemValues(id);
  }

  @Post('admin/size-systems')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createSizeSystem(@Body() dto: CreateSizeSystemDto) {
    return this.catalog.createSizeSystem(dto);
  }

  @Post('admin/size-systems/:id/values')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createSizeValue(@Param('id') id: string, @Body() dto: CreateSizeValueDto) {
    return this.catalog.createSizeSystemValue({
      sizeSystemId: id,
      ...dto,
    });
  }

  @Get('size-charts')
  listSizeCharts(
    @Query('scopeType') scopeType?: string,
    @Query('scopeId') scopeId?: string,
  ) {
    return this.catalog.listSizeCharts(scopeType, scopeId);
  }

  @Post('admin/size-charts')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createSizeChart(@Body() dto: CreateSizeChartDto) {
    return this.catalog.createSizeChart(dto);
  }

  @Get('size-charts/:id/rows')
  listSizeChartRows(@Param('id') id: string) {
    return this.catalog.listSizeChartRows(id);
  }

  @Post('admin/size-charts/:id/rows')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  addSizeChartRow(@Param('id') id: string, @Body() dto: SizeChartRowDto) {
    return this.catalog.upsertSizeChartRow({
      sizeChartId: id,
      ...dto,
    });
  }
}
