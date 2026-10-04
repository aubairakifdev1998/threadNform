import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Permission, hasPermission } from '../../domain/auth/permissions.js';
import {
  CATALOG_REPOSITORY,
  type CatalogRepository,
} from '../../domain/repositories/catalog.repository.js';
import {
  COMMERCE_REPOSITORY,
  type CommerceRepository,
} from '../../domain/repositories/commerce.repository.js';
import {
  INVENTORY_REPOSITORY,
  type InventoryRepository,
} from '../../domain/repositories/inventory.repository.js';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../../domain/repositories/unit-of-work.js';
import {
  normalizePagination,
  paginated,
} from '../../domain/shared/pagination.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import type { AdminAuthenticatedRequest } from '../common/guards/admin-auth.guard.js';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '../../domain/exceptions/domain.exception.js';
import {
  CreateProductDto,
  CreateVariantDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './commerce.dto.js';

@Controller()
export class AdminCatalogController {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(COMMERCE_REPOSITORY) private readonly commerce: CommerceRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventory: InventoryRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  // —— Admin catalog ——
  @Post('admin/products')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminCreateProduct(@Body() dto: CreateProductDto) {
    const sizeIds = dto.sizeValueIds ?? [];
    const colorIds = dto.colorIds ?? [];
    const hasOptions = sizeIds.length > 0 || colorIds.length > 0;
    const productType = hasOptions ? 'VARIABLE' : dto.productType;

    let departmentId = dto.departmentId ?? null;
    if (dto.categoryId) {
      const categories = await this.catalog.listCategories();
      const category = categories.find((c) => c.id === dto.categoryId);
      if (!category) {
        throw new NotFoundException('Category');
      }
      if (!category.isActive) {
        throw new ValidationException('Category is inactive');
      }
      departmentId = departmentId ?? category.departmentId;
    }

    return this.uow.run(async () => {
      const product = await this.catalog.createProduct({
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        productType,
        departmentId,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        status: 'DRAFT',
      });

      const vat = await this.catalog.getDefaultVatRate();
      if (!vat) throw new ValidationException('Default VAT rate missing');

      const warehouse = await this.inventory.getDefaultWarehouse();
      const initialStock = dto.initialStock ?? 0;
      const slugPart = dto.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-');

      const sizes =
        sizeIds.length > 0
          ? (await this.catalog.listAllSizeValues()).filter((s) =>
              sizeIds.includes(s.id),
            )
          : [];
      const colors =
        colorIds.length > 0
          ? (await this.catalog.listColors()).filter((c) =>
              colorIds.includes(c.id),
            )
          : [];

      type Combo = {
        size?: { id: string; code: string };
        color?: { id: string; name: string };
      };
      const combos: Combo[] = [];
      if (hasOptions) {
        const sizeList = sizes.length > 0 ? sizes : [undefined];
        const colorList = colors.length > 0 ? colors : [undefined];
        for (const size of sizeList) {
          for (const color of colorList) {
            combos.push({
              size: size ? { id: size.id, code: size.code } : undefined,
              color: color ? { id: color.id, name: color.name } : undefined,
            });
          }
        }
      } else {
        combos.push({});
      }

      let isFirst = true;
      for (const combo of combos) {
        const skuParts = [slugPart];
        if (combo.size) skuParts.push(combo.size.code.toUpperCase());
        if (combo.color) {
          skuParts.push(
            combo.color.name
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, '')
              .slice(0, 12),
          );
        }
        if (!combo.size && !combo.color) {
          skuParts.push(dto.sku?.trim().toUpperCase() || 'DEFAULT');
        }
        const sku = skuParts.join('-');
        const fingerprint = [
          combo.size?.id ?? 'nosize',
          combo.color?.id ?? 'nocolor',
        ].join(':');

        const variant = await this.catalog.createVariant({
          productId: product.id,
          sku,
          optionFingerprint: hasOptions ? fingerprint : 'default',
          isDefault: isFirst,
        });
        isFirst = false;

        if (combo.size || combo.color) {
          await this.catalog.attachVariantOptions({
            variantId: variant.id,
            sizeValueId: combo.size?.id ?? null,
            colorId: combo.color?.id ?? null,
          });
        }

        if (dto.basePricePence != null) {
          await this.catalog.upsertPrice({
            productId: product.id,
            variantId: variant.id,
            basePricePence: dto.basePricePence,
            vatRateId: vat.id,
          });
        }

        if (warehouse && initialStock > 0) {
          await this.inventory.adjust({
            warehouseId: warehouse.id,
            variantId: variant.id,
            onHandDelta: initialStock,
            movementType: 'MANUAL_ADJUSTMENT',
            actorType: 'ADMIN',
            reason: 'Initial stock on product create',
          });
        }
      }

      return this.catalog.updateProduct(product.id, { status: 'ACTIVE' });
    });
  }

  @Post('admin/products/:productId/variants')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminCreateVariant(
    @Param('productId') productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    const product = await this.catalog.getProductById(productId);
    if (!product || product.status === 'ARCHIVED') {
      throw new NotFoundException('Product');
    }

    const sku = dto.sku.trim().toUpperCase();
    if (!sku) {
      throw new ValidationException('SKU is required');
    }

    return this.uow.run(async () => {
      const existingSku = await this.catalog.getVariantBySku(sku);
      if (existingSku) {
        throw new ValidationException(
          `SKU "${sku}" already exists`,
          'DUPLICATE_SKU',
        );
      }

      const hasOptions = Boolean(dto.sizeValueId || dto.colorId);
      const fingerprint =
        dto.optionFingerprint?.trim() ||
        (hasOptions
          ? `${dto.sizeValueId ?? 'nosize'}:${dto.colorId ?? 'nocolor'}`
          : `sku:${sku}`);

      const existingVariants = await this.catalog.listVariants(productId);
      const duplicateOption = existingVariants.find(
        (v) => v.status !== 'ARCHIVED' && v.optionFingerprint === fingerprint,
      );
      if (duplicateOption) {
        throw new ValidationException(
          `A variant with this size/color already exists (${duplicateOption.sku})`,
          'DUPLICATE_OPTION',
        );
      }

      if (hasOptions && product.productType !== 'VARIABLE') {
        await this.catalog.updateProduct(productId, {
          productType: 'VARIABLE',
        });
      }

      // Unique violations (concurrent create) surface as 409 DUPLICATE.
      const variant = await this.catalog.createVariant({
        productId,
        sku,
        optionFingerprint: fingerprint,
        isDefault:
          existingVariants.filter((v) => v.status !== 'ARCHIVED').length === 0,
      });

      if (hasOptions) {
        await this.catalog.attachVariantOptions({
          variantId: variant.id,
          sizeValueId: dto.sizeValueId ?? null,
          colorId: dto.colorId ?? null,
        });
      }

      if (dto.basePricePence != null) {
        const vat = await this.catalog.getDefaultVatRate();
        if (!vat) throw new ValidationException('Default VAT rate missing');
        await this.catalog.upsertPrice({
          productId,
          variantId: variant.id,
          basePricePence: dto.basePricePence,
          vatRateId: vat.id,
        });
      }

      const warehouse = await this.inventory.getDefaultWarehouse();
      const initialStock = dto.initialStock ?? 0;
      if (warehouse && initialStock > 0) {
        await this.inventory.adjust({
          warehouseId: warehouse.id,
          variantId: variant.id,
          onHandDelta: initialStock,
          movementType: 'MANUAL_ADJUSTMENT',
          actorType: 'ADMIN',
          reason: 'Initial stock on variant create',
        });
      }

      return {
        ...variant,
        onHand: initialStock,
        available: initialStock,
        reserved: 0,
      };
    });
  }

  @Get('admin/products/:productId/variants')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_READ)
  async adminListVariants(@Param('productId') productId: string) {
    const product = await this.catalog.getProductById(productId);
    if (!product) throw new NotFoundException('Product');
    const variants = await this.catalog.listVariants(productId);
    const warehouse = await this.inventory.getDefaultWarehouse();
    return Promise.all(
      variants.map(async (v) => {
        const stock = warehouse
          ? await this.inventory.getItem(warehouse.id, v.id)
          : null;
        return {
          id: v.id,
          sku: v.sku,
          status: v.status,
          isDefault: v.isDefault,
          productId: v.productId,
          onHand: stock?.onHand ?? 0,
          reserved: stock?.reserved ?? 0,
          available: stock?.available ?? 0,
        };
      }),
    );
  }

  @Get('admin/products')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_READ)
  async adminListProducts(
    @Query() query: PaginationQueryDto & { q?: string; status?: string },
  ) {
    const page = normalizePagination(query.page, query.pageSize);
    const result = await this.catalog.listProducts({
      ...page,
      q: query.q,
      status: query.status,
    });
    const items = await this.catalog.enrichProductSummaries(result.items);
    return paginated(items, result.total, page);
  }

  @Get('admin/products/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_READ)
  async adminGetProduct(@Param('id') id: string) {
    const product = await this.catalog.getProductById(id);
    if (!product) throw new NotFoundException('Product');
    const variants = await this.catalog.listVariants(id);
    const warehouse = await this.inventory.getDefaultWarehouse();
    const productPrice = await this.catalog.getPriceForProduct(id);
    const enrichedVariants = await Promise.all(
      variants.map(async (v) => {
        const stock = warehouse
          ? await this.inventory.getItem(warehouse.id, v.id)
          : null;
        const variantPrice = await this.catalog.getPriceForVariant(v.id);
        return {
          id: v.id,
          sku: v.sku,
          status: v.status,
          isDefault: v.isDefault,
          productId: v.productId,
          onHand: stock?.onHand ?? 0,
          reserved: stock?.reserved ?? 0,
          available: stock?.available ?? 0,
          basePricePence:
            variantPrice?.basePricePence ??
            productPrice?.basePricePence ??
            null,
        };
      }),
    );
    return {
      ...product,
      basePricePence: productPrice?.basePricePence ?? null,
      warehouseId: warehouse?.id ?? null,
      variants: enrichedVariants,
      totalOnHand: enrichedVariants.reduce((sum, v) => sum + v.onHand, 0),
      totalAvailable: enrichedVariants.reduce((sum, v) => sum + v.available, 0),
    };
  }

  @Patch('admin/products/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminUpdateProduct(
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    const before = await this.catalog.getProductById(id);
    if (!before) throw new NotFoundException('Product');

    let departmentId = body.departmentId;
    if (body.categoryId) {
      const categories = await this.catalog.listCategories();
      const category = categories.find((c) => c.id === body.categoryId);
      if (!category) {
        throw new NotFoundException('Category');
      }
      if (departmentId === undefined) {
        departmentId = category.departmentId;
      }
    } else if (body.categoryId === null) {
      departmentId = body.departmentId === undefined ? null : body.departmentId;
    }

    const updated = await this.catalog.updateProduct(id, {
      name: body.name,
      slug: body.slug,
      description: body.description,
      shortDescription: body.shortDescription,
      status: body.status,
      categoryId: body.categoryId,
      departmentId,
    });
    await this.commerce.writeAudit({
      actorType: 'ADMIN',
      actorId: req.adminUser?.id,
      action: 'PRODUCT_UPDATED',
      entityType: 'product',
      entityId: id,
      before,
      after: updated,
    });
    return updated;
  }

  @Delete('admin/products/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminDeleteProduct(
    @Param('id') id: string,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    const before = await this.catalog.getProductById(id);
    if (!before) throw new NotFoundException('Product');
    const variants = await this.catalog.listVariants(id);
    await this.assertNoReservedStock(variants.map((v) => v.id));
    return this.uow.run(async () => {
      let stockRowsRemoved = 0;
      for (const variant of variants) {
        const purged = await this.inventory.purgeVariantStock({
          variantId: variant.id,
          actorType: 'ADMIN',
          actorId: req.adminUser?.id,
          reason: `Product deleted (${before.name}) — clear linked stock`,
        });
        stockRowsRemoved += purged.removed;
        if (variant.status !== 'ARCHIVED') {
          await this.catalog.updateVariant(variant.id, { status: 'ARCHIVED' });
        }
      }
      const updated = await this.catalog.updateProduct(id, {
        status: 'ARCHIVED',
      });
      await this.commerce.writeAudit({
        actorType: 'ADMIN',
        actorId: req.adminUser?.id,
        action: 'PRODUCT_DELETED',
        entityType: 'product',
        entityId: id,
        before,
        after: { ...updated, stockRowsRemoved },
      });
      return { id, status: 'ARCHIVED', stockRowsRemoved };
    });
  }

  /**
   * Archiving drops stock rows; refuse while carts/orders hold units, or the
   * open orders could never be shipped.
   */
  private async assertNoReservedStock(variantIds: string[]) {
    const warehouse = await this.inventory.getDefaultWarehouse();
    if (!warehouse) return;
    for (const variantId of variantIds) {
      const stock = await this.inventory.getItem(warehouse.id, variantId);
      if (stock && stock.reserved > 0) {
        throw new ConflictException(
          `${stock.reserved} unit(s) are reserved by open carts or orders. Fulfil or cancel those orders first, or set the product to INACTIVE to stop new sales.`,
          'STOCK_RESERVED',
          { variantId, reserved: stock.reserved },
        );
      }
    }
  }

  @Patch('admin/products/:productId/variants/:variantId')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminUpdateVariant(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    const variant = await this.catalog.getVariantById(variantId);
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException('Variant');
    }
    const sku =
      dto.sku === undefined ? undefined : dto.sku.trim().toUpperCase();
    if (sku === '') throw new ValidationException('SKU is required');
    if (sku && sku !== variant.sku) {
      const clash = await this.catalog.getVariantBySku(sku);
      if (clash) {
        throw new ValidationException(
          `SKU "${sku}" already exists`,
          'DUPLICATE_SKU',
        );
      }
    }
    const updated = await this.catalog.updateVariant(variantId, {
      sku,
      status: dto.status,
      isDefault: dto.isDefault,
    });
    if (dto.basePricePence != null) {
      if (!hasPermission(req.adminUser!.role, Permission.PRICE_EDIT)) {
        throw new ForbiddenException('Insufficient permissions');
      }
      const vat = await this.catalog.getDefaultVatRate();
      if (!vat) throw new ValidationException('Default VAT rate missing');
      await this.catalog.upsertPrice({
        productId,
        variantId,
        basePricePence: dto.basePricePence,
        vatRateId: vat.id,
      });
    }
    return updated;
  }

  @Delete('admin/products/:productId/variants/:variantId')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async adminDeleteVariant(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Req() req: AdminAuthenticatedRequest,
  ) {
    const variant = await this.catalog.getVariantById(variantId);
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException('Variant');
    }
    await this.assertNoReservedStock([variantId]);
    return this.uow.run(async () => {
      await this.inventory.purgeVariantStock({
        variantId,
        actorType: 'ADMIN',
        actorId: req.adminUser?.id,
        reason: `Variant deleted (${variant.sku}) — clear linked stock`,
      });
      return this.catalog.updateVariant(variantId, { status: 'ARCHIVED' });
    });
  }
  @Post('admin/departments')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createDepartment(
    @Body()
    body: {
      name: string;
      slug: string;
      sortOrder?: number;
      imageUrl?: string | null;
    },
  ) {
    return this.catalog.createDepartment(body);
  }

  @Patch('admin/departments/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateDepartment(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      slug: string;
      sortOrder: number;
      imageUrl: string | null;
      isActive: boolean;
    }>,
  ) {
    return this.catalog.updateDepartment(id, body);
  }

  @Delete('admin/departments/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async deleteDepartment(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.uow.run(() => this.catalog.deleteDepartment(id));
    return { deleted: true };
  }

  @Post('admin/categories')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createCategory(
    @Body()
    body: {
      departmentId: string;
      parentId?: string;
      name: string;
      slug: string;
      sortOrder?: number;
      imageUrl?: string | null;
    },
  ) {
    return this.catalog.createCategory(body);
  }

  @Patch('admin/categories/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateCategory(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      slug: string;
      departmentId: string;
      sortOrder: number;
      imageUrl: string | null;
    }>,
  ) {
    return this.catalog.updateCategory(id, body);
  }

  @Delete('admin/categories/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async deleteCategory(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.uow.run(() => this.catalog.deleteCategory(id));
    return { deleted: true };
  }

  @Get('colors')
  listColors() {
    return this.catalog.listColors();
  }

  @Post('admin/colors')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createColor(@Body() body: { name: string; hex?: string }) {
    return this.catalog.createColor(body);
  }

  @Patch('admin/colors/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateColor(
    @Param('id') id: string,
    @Body() body: Partial<{ name: string; hex: string | null }>,
  ) {
    return this.catalog.updateColor(id, body);
  }

  @Delete('admin/colors/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async deleteColor(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.uow.run(() => this.catalog.deleteColor(id));
    return { deleted: true };
  }

  @Get('sizes')
  listSizes() {
    return this.catalog.listAllSizeValues();
  }

  @Post('admin/sizes')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async createSize(
    @Body() body: { code: string; label: string; sizeSystemId?: string },
  ) {
    let systemId = body.sizeSystemId;
    if (!systemId) {
      const systems = await this.catalog.listSizeSystems();
      const clothing =
        systems.find((s) => s.code === 'CLOTHING_ALPHA') ?? systems[0];
      if (!clothing) {
        throw new ValidationException('No size system configured');
      }
      systemId = clothing.id;
    }
    return this.catalog.createSizeSystemValue({
      sizeSystemId: systemId,
      code: body.code,
      label: body.label,
    });
  }

  @Patch('admin/sizes/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateSize(
    @Param('id') id: string,
    @Body() body: Partial<{ code: string; label: string; sortOrder: number }>,
  ) {
    return this.catalog.updateSizeSystemValue(id, body);
  }

  @Delete('admin/sizes/:id')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  async deleteSize(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.uow.run(() => this.catalog.deleteSizeSystemValue(id));
    return { deleted: true };
  }

  @Post('admin/brands')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createBrand(
    @Body() body: { name: string; slug: string; description?: string },
  ) {
    return this.catalog.createBrand(body);
  }

  @Post('admin/collections')
  @UseGuards(AdminAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CATALOG_WRITE)
  createCollection(
    @Body() body: { name: string; slug: string; description?: string },
  ) {
    return this.catalog.createCollection(body);
  }
}
