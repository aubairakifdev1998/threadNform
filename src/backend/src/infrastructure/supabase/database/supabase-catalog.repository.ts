import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  type SQL,
} from 'drizzle-orm';
import type {
  Attribute,
  AttributeOption,
  Brand,
  CatalogRepository,
  Category,
  Collection,
  CommerceProduct,
  Department,
  ProductPrice,
  ProductVariant,
  SizeChart,
  SizeChartRow,
  SizeSystem,
  SizeSystemValue,
} from '../../../domain/repositories/catalog.repository.js';
import { DRIZZLE, type DrizzleDB } from '../../drizzle/drizzle.tokens.js';
import {
  attributes,
  attributeOptions,
  brands,
  categories,
  collections,
  colors,
  departments,
  inventoryItems,
  productAttributes,
  productCollections,
  productMedia,
  productPrices,
  products,
  productVariantOptions,
  productVariants,
  sizeChartRows,
  sizeCharts,
  sizeSystems,
  sizeSystemValues,
  vatRates,
} from '../../drizzle/schema/index.js';

@Injectable()
export class SupabaseCatalogRepository implements CatalogRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async listDepartments(): Promise<Department[]> {
    const rows = await this.db
      .select()
      .from(departments)
      .orderBy(asc(departments.sortOrder));
    return rows.map(this.mapDepartment);
  }

  async createDepartment(input: {
    name: string;
    slug: string;
    sortOrder?: number;
    imageUrl?: string | null;
  }): Promise<Department> {
    const [row] = await this.db
      .insert(departments)
      .values({
        name: input.name,
        slug: input.slug,
        sortOrder: input.sortOrder ?? 0,
        imageUrl: input.imageUrl ?? null,
      })
      .returning();
    return this.mapDepartment(row);
  }

  async updateDepartment(
    id: string,
    input: Partial<{
      name: string;
      slug: string;
      sortOrder: number;
      imageUrl: string | null;
      isActive: boolean;
    }>,
  ): Promise<Department> {
    const payload: Partial<typeof departments.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) payload.name = input.name;
    if (input.slug !== undefined) payload.slug = input.slug;
    if (input.sortOrder !== undefined) payload.sortOrder = input.sortOrder;
    if (input.imageUrl !== undefined) payload.imageUrl = input.imageUrl;
    if (input.isActive !== undefined) payload.isActive = input.isActive;
    const [row] = await this.db
      .update(departments)
      .set(payload)
      .where(eq(departments.id, id))
      .returning();
    return this.mapDepartment(row);
  }

  async listCategories(departmentId?: string): Promise<Category[]> {
    const rows = departmentId
      ? await this.db
          .select()
          .from(categories)
          .where(eq(categories.departmentId, departmentId))
          .orderBy(asc(categories.sortOrder))
      : await this.db
          .select()
          .from(categories)
          .orderBy(asc(categories.sortOrder));
    return rows.map(this.mapCategory);
  }

  async createCategory(input: {
    departmentId: string;
    parentId?: string | null;
    name: string;
    slug: string;
    sortOrder?: number;
    imageUrl?: string | null;
  }): Promise<Category> {
    const [row] = await this.db
      .insert(categories)
      .values({
        departmentId: input.departmentId,
        parentId: input.parentId ?? null,
        name: input.name,
        slug: input.slug,
        sortOrder: input.sortOrder ?? 0,
        imageUrl: input.imageUrl ?? null,
      })
      .returning();
    return this.mapCategory(row);
  }

  async updateCategory(
    id: string,
    input: Partial<{
      name: string;
      slug: string;
      departmentId: string;
      sortOrder: number;
      imageUrl: string | null;
    }>,
  ): Promise<Category> {
    const payload: Partial<typeof categories.$inferInsert> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.slug !== undefined) payload.slug = input.slug;
    if (input.departmentId !== undefined)
      payload.departmentId = input.departmentId;
    if (input.sortOrder !== undefined) payload.sortOrder = input.sortOrder;
    if (input.imageUrl !== undefined) payload.imageUrl = input.imageUrl;
    payload.updatedAt = new Date();

    const [row] = await this.db
      .update(categories)
      .set(payload)
      .where(eq(categories.id, id))
      .returning();
    return this.mapCategory(row);
  }

  async deleteCategory(id: string): Promise<void> {
    await this.db.delete(categories).where(eq(categories.id, id));
  }

  async listColors(): Promise<
    Array<{ id: string; name: string; hex: string | null }>
  > {
    const rows = await this.db
      .select({
        id: colors.id,
        name: colors.name,
        hex: colors.hex,
      })
      .from(colors)
      .orderBy(asc(colors.name));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      hex: row.hex ?? null,
    }));
  }

  async createColor(input: {
    name: string;
    hex?: string | null;
  }): Promise<{ id: string; name: string; hex: string | null }> {
    const nameNormalized = input.name.trim().toLowerCase();
    const [row] = await this.db
      .insert(colors)
      .values({
        name: input.name.trim(),
        nameNormalized,
        hex: input.hex ?? null,
      })
      .returning({
        id: colors.id,
        name: colors.name,
        hex: colors.hex,
      });
    return {
      id: row.id,
      name: row.name,
      hex: row.hex ?? null,
    };
  }

  async updateColor(
    id: string,
    input: Partial<{ name: string; hex: string | null }>,
  ): Promise<{ id: string; name: string; hex: string | null }> {
    const payload: Partial<typeof colors.$inferInsert> = {};
    if (input.name !== undefined) {
      payload.name = input.name.trim();
      payload.nameNormalized = input.name.trim().toLowerCase();
    }
    if (input.hex !== undefined) payload.hex = input.hex;

    const [row] = await this.db
      .update(colors)
      .set(payload)
      .where(eq(colors.id, id))
      .returning({
        id: colors.id,
        name: colors.name,
        hex: colors.hex,
      });
    return {
      id: row.id,
      name: row.name,
      hex: row.hex ?? null,
    };
  }

  async deleteColor(id: string): Promise<void> {
    await this.db.delete(colors).where(eq(colors.id, id));
  }

  async listBrands(): Promise<Brand[]> {
    const rows = await this.db.select().from(brands).orderBy(asc(brands.name));
    return rows.map(this.mapBrand);
  }

  async createBrand(input: {
    name: string;
    slug: string;
    description?: string | null;
  }): Promise<Brand> {
    const [row] = await this.db
      .insert(brands)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
      })
      .returning();
    return this.mapBrand(row);
  }

  async listCollections(): Promise<Collection[]> {
    const rows = await this.db
      .select()
      .from(collections)
      .orderBy(asc(collections.name));
    return rows.map(this.mapCollection);
  }

  async createCollection(input: {
    name: string;
    slug: string;
    description?: string | null;
  }): Promise<Collection> {
    const [row] = await this.db
      .insert(collections)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
      })
      .returning();
    return this.mapCollection(row);
  }

  async listProducts(params: {
    page: number;
    pageSize: number;
    status?: string;
    q?: string;
    categoryId?: string;
    brandId?: string;
    departmentId?: string;
    collectionId?: string;
    attributeOptionId?: string;
    sizeValueId?: string;
    colorId?: string;
    inStock?: boolean;
    minPricePence?: number;
    maxPricePence?: number;
    publicOnly?: boolean;
  }): Promise<{ items: CommerceProduct[]; total: number }> {
    const idFilters: string[][] = [];

    if (params.collectionId) {
      const rows = await this.db
        .select({ productId: productCollections.productId })
        .from(productCollections)
        .where(eq(productCollections.collectionId, params.collectionId));
      idFilters.push(rows.map((row) => row.productId));
    }

    if (params.attributeOptionId || params.sizeValueId || params.colorId) {
      const optConditions: SQL[] = [];
      if (params.attributeOptionId) {
        optConditions.push(
          eq(productVariantOptions.optionId, params.attributeOptionId),
        );
      }
      if (params.sizeValueId) {
        optConditions.push(
          eq(productVariantOptions.sizeValueId, params.sizeValueId),
        );
      }
      if (params.colorId) {
        optConditions.push(eq(productVariantOptions.colorId, params.colorId));
      }

      const optionRows = await this.db
        .select({ variantId: productVariantOptions.variantId })
        .from(productVariantOptions)
        .where(and(...optConditions));
      const variantIds = optionRows.map((row) => row.variantId);
      if (!variantIds.length) {
        return { items: [], total: 0 };
      }

      const variants = await this.db
        .select({ productId: productVariants.productId })
        .from(productVariants)
        .where(inArray(productVariants.id, variantIds));
      idFilters.push(
        Array.from(new Set(variants.map((row) => row.productId))),
      );
    }

    if (params.inStock === true) {
      const inventory = await this.db
        .select({
          variantId: inventoryItems.variantId,
          onHand: inventoryItems.onHand,
          reserved: inventoryItems.reserved,
        })
        .from(inventoryItems);
      const availableVariantIds = inventory
        .filter((row) => row.onHand - row.reserved > 0)
        .map((row) => row.variantId);
      if (!availableVariantIds.length) {
        return { items: [], total: 0 };
      }
      const variants = await this.db
        .select({ productId: productVariants.productId })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.status, 'ACTIVE'),
            inArray(productVariants.id, availableVariantIds),
          ),
        );
      idFilters.push(
        Array.from(new Set(variants.map((row) => row.productId))),
      );
    }

    if (
      params.minPricePence !== undefined ||
      params.maxPricePence !== undefined
    ) {
      const priceConditions: SQL[] = [];
      if (params.minPricePence !== undefined) {
        priceConditions.push(
          gte(productPrices.basePricePence, params.minPricePence),
        );
      }
      if (params.maxPricePence !== undefined) {
        priceConditions.push(
          lte(productPrices.basePricePence, params.maxPricePence),
        );
      }
      const prices = await this.db
        .select({ productId: productPrices.productId })
        .from(productPrices)
        .where(and(...priceConditions));
      idFilters.push(Array.from(new Set(prices.map((row) => row.productId))));
    }

    let productIds: string[] | undefined;
    if (idFilters.length) {
      productIds = idFilters.reduce<string[]>((acc, ids, index) => {
        if (index === 0) return ids;
        const set = new Set(ids);
        return acc.filter((id) => set.has(id));
      }, []);
      if (!productIds.length) {
        return { items: [], total: 0 };
      }
    }

    const conditions: SQL[] = [];
    if (params.publicOnly) conditions.push(eq(products.status, 'ACTIVE'));
    else if (params.status)
      conditions.push(
        eq(products.status, params.status as CommerceProduct['status']),
      );
    if (params.categoryId)
      conditions.push(eq(products.categoryId, params.categoryId));
    if (params.brandId) conditions.push(eq(products.brandId, params.brandId));
    if (params.departmentId)
      conditions.push(eq(products.departmentId, params.departmentId));
    if (params.q) conditions.push(ilike(products.name, `%${params.q}%`));
    if (productIds) conditions.push(inArray(products.id, productIds));

    const whereClause = conditions.length ? and(...conditions) : undefined;
    const from = (params.page - 1) * params.pageSize;

    const [rows, totalRow] = await Promise.all([
      this.db
        .select()
        .from(products)
        .where(whereClause)
        .orderBy(desc(products.createdAt))
        .limit(params.pageSize)
        .offset(from),
      this.db
        .select({ value: count() })
        .from(products)
        .where(whereClause),
    ]);

    return {
      items: rows.map(this.mapProduct),
      total: Number(totalRow[0]?.value ?? 0),
    };
  }

  async enrichProductSummaries(productsList: CommerceProduct[]) {
    if (!productsList.length) return [];

    const ids = productsList.map((p) => p.id);
    const brandIds = Array.from(
      new Set(productsList.map((p) => p.brandId).filter(Boolean) as string[]),
    );
    const categoryIds = Array.from(
      new Set(
        productsList.map((p) => p.categoryId).filter(Boolean) as string[],
      ),
    );

    const [brandRows, categoryRows, priceRows, mediaRows, variantRows] =
      await Promise.all([
        brandIds.length
          ? this.db
              .select({ id: brands.id, name: brands.name })
              .from(brands)
              .where(inArray(brands.id, brandIds))
          : Promise.resolve([] as Array<{ id: string; name: string }>),
        categoryIds.length
          ? this.db
              .select({ id: categories.id, name: categories.name })
              .from(categories)
              .where(inArray(categories.id, categoryIds))
          : Promise.resolve([] as Array<{ id: string; name: string }>),
        this.db
          .select({
            productId: productPrices.productId,
            basePricePence: productPrices.basePricePence,
            salePricePence: productPrices.salePricePence,
            variantId: productPrices.variantId,
          })
          .from(productPrices)
          .where(inArray(productPrices.productId, ids)),
        this.db
          .select({
            productId: productMedia.productId,
            storagePath: productMedia.storagePath,
            isPrimary: productMedia.isPrimary,
            sortOrder: productMedia.sortOrder,
          })
          .from(productMedia)
          .where(
            and(
              inArray(productMedia.productId, ids),
              eq(productMedia.status, 'ACTIVE'),
            ),
          )
          .orderBy(asc(productMedia.sortOrder)),
        this.db
          .select({
            id: productVariants.id,
            productId: productVariants.productId,
          })
          .from(productVariants)
          .where(
            and(
              inArray(productVariants.productId, ids),
              eq(productVariants.status, 'ACTIVE'),
            ),
          ),
      ]);

    const brandMap = new Map(brandRows.map((row) => [row.id, row.name]));
    const categoryMap = new Map(categoryRows.map((row) => [row.id, row.name]));

    const priceMap = new Map<string, number>();
    const hasProductLevelPrice = new Set<string>();
    for (const row of priceRows) {
      const sale = row.salePricePence == null ? null : Number(row.salePricePence);
      const base = Number(row.basePricePence);
      const amount = sale ?? base;
      const productId = row.productId;
      if (row.variantId == null) {
        priceMap.set(productId, amount);
        hasProductLevelPrice.add(productId);
        continue;
      }
      if (hasProductLevelPrice.has(productId)) continue;
      const existing = priceMap.get(productId);
      if (existing === undefined || amount < existing) {
        priceMap.set(productId, amount);
      }
    }

    const mediaMap = new Map<string, string>();
    for (const row of mediaRows) {
      const productId = row.productId;
      if (mediaMap.has(productId) && !row.isPrimary) continue;
      mediaMap.set(productId, row.storagePath);
    }

    const variantIds = variantRows.map((row) => row.id);
    const variantProductMap = new Map(
      variantRows.map((row) => [row.id, row.productId]),
    );
    const inStockProducts = new Set<string>();
    if (variantIds.length) {
      const inventory = await this.db
        .select({
          variantId: inventoryItems.variantId,
          onHand: inventoryItems.onHand,
          reserved: inventoryItems.reserved,
        })
        .from(inventoryItems)
        .where(inArray(inventoryItems.variantId, variantIds));
      for (const row of inventory) {
        if (row.onHand - row.reserved > 0) {
          const productId = variantProductMap.get(row.variantId);
          if (productId) inStockProducts.add(productId);
        }
      }
    }

    return productsList.map((product) => ({
      ...product,
      brandName: product.brandId
        ? (brandMap.get(product.brandId) ?? null)
        : null,
      categoryName: product.categoryId
        ? (categoryMap.get(product.categoryId) ?? null)
        : null,
      basePricePence: priceMap.get(product.id) ?? null,
      primaryImageUrl: mediaMap.get(product.id) ?? null,
      inStock: inStockProducts.has(product.id),
    }));
  }

  async getStorefrontFilters() {
    const [
      departmentsList,
      categoriesList,
      brandsList,
      collectionsList,
      attributesList,
      sizeSystemsList,
      colorRows,
      priceRows,
    ] = await Promise.all([
      this.listDepartments(),
      this.listCategories(),
      this.listBrands(),
      this.listCollections(),
      this.listAttributes(),
      this.listSizeSystems(),
      this.db
        .select({
          id: colors.id,
          name: colors.name,
          hex: colors.hex,
        })
        .from(colors)
        .orderBy(asc(colors.name)),
      this.db
        .select({
          basePricePence: productPrices.basePricePence,
          salePricePence: productPrices.salePricePence,
        })
        .from(productPrices),
    ]);

    const clothingSystem =
      sizeSystemsList.find((s) => s.code === 'CLOTHING_ALPHA') ??
      sizeSystemsList[0];
    const sizes = clothingSystem
      ? await this.listSizeSystemValues(clothingSystem.id)
      : [];

    const attributesWithOptions = await Promise.all(
      attributesList.map(async (attribute) => ({
        ...attribute,
        options: await this.listAttributeOptions(attribute.id),
      })),
    );

    const amounts = priceRows.map((row) => {
      const sale =
        row.salePricePence == null ? null : Number(row.salePricePence);
      return sale ?? Number(row.basePricePence);
    });

    return {
      departments: departmentsList.filter((d) => d.isActive),
      categories: categoriesList.filter((c) => c.isActive),
      brands: brandsList.filter((b) => b.status === 'ACTIVE'),
      collections: collectionsList.filter((c) => c.status === 'ACTIVE'),
      sizes,
      colors: colorRows.map((row) => ({
        id: row.id,
        name: row.name,
        hex: row.hex ?? null,
      })),
      attributes: attributesWithOptions,
      priceRange: {
        minPence: amounts.length ? Math.min(...amounts) : null,
        maxPence: amounts.length ? Math.max(...amounts) : null,
      },
    };
  }

  async findCategoryBySlug(slug: string): Promise<Category | null> {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);
    return row ? this.mapCategory(row) : null;
  }

  async findCollectionBySlug(slug: string): Promise<Collection | null> {
    const [row] = await this.db
      .select()
      .from(collections)
      .where(eq(collections.slug, slug))
      .limit(1);
    return row ? this.mapCollection(row) : null;
  }

  async findDepartmentBySlug(slug: string): Promise<Department | null> {
    const [row] = await this.db
      .select()
      .from(departments)
      .where(eq(departments.slug, slug))
      .limit(1);
    return row ? this.mapDepartment(row) : null;
  }

  async getProductById(id: string): Promise<CommerceProduct | null> {
    const [row] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);
    return row ? this.mapProduct(row) : null;
  }

  async getProductBySlug(slug: string): Promise<CommerceProduct | null> {
    const [row] = await this.db
      .select()
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    return row ? this.mapProduct(row) : null;
  }

  async createProduct(input: {
    name: string;
    slug: string;
    description?: string | null;
    shortDescription?: string | null;
    productType: 'SIMPLE' | 'VARIABLE';
    departmentId?: string | null;
    categoryId?: string | null;
    subcategoryId?: string | null;
    brandId?: string | null;
    status?: CommerceProduct['status'];
  }): Promise<CommerceProduct> {
    const [row] = await this.db
      .insert(products)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        shortDescription: input.shortDescription ?? null,
        productType: input.productType,
        departmentId: input.departmentId ?? null,
        categoryId: input.categoryId ?? null,
        subcategoryId: input.subcategoryId ?? null,
        brandId: input.brandId ?? null,
        status: input.status ?? 'DRAFT',
      })
      .returning();
    return this.mapProduct(row);
  }

  async updateProduct(
    id: string,
    input: Partial<{
      name: string;
      slug: string;
      description: string | null;
      shortDescription: string | null;
      departmentId: string | null;
      categoryId: string | null;
      subcategoryId: string | null;
      brandId: string | null;
      productType: CommerceProduct['productType'];
      status: CommerceProduct['status'];
      seo: Record<string, unknown>;
    }>,
  ): Promise<CommerceProduct> {
    const payload: Partial<typeof products.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) payload.name = input.name;
    if (input.slug !== undefined) payload.slug = input.slug;
    if (input.description !== undefined) payload.description = input.description;
    if (input.shortDescription !== undefined)
      payload.shortDescription = input.shortDescription;
    if (input.departmentId !== undefined)
      payload.departmentId = input.departmentId;
    if (input.categoryId !== undefined) payload.categoryId = input.categoryId;
    if (input.productType !== undefined) payload.productType = input.productType;
    if (input.subcategoryId !== undefined)
      payload.subcategoryId = input.subcategoryId;
    if (input.brandId !== undefined) payload.brandId = input.brandId;
    if (input.status !== undefined) {
      payload.status = input.status;
      if (input.status === 'ARCHIVED') payload.archivedAt = new Date();
    }
    if (input.seo !== undefined) payload.seo = input.seo;

    const [row] = await this.db
      .update(products)
      .set(payload)
      .where(eq(products.id, id))
      .returning();
    return this.mapProduct(row);
  }

  async listVariants(productId: string): Promise<ProductVariant[]> {
    const rows = await this.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId));
    return rows.map(this.mapVariant);
  }

  async getVariantById(id: string): Promise<ProductVariant | null> {
    const [row] = await this.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, id))
      .limit(1);
    return row ? this.mapVariant(row) : null;
  }

  async getVariantBySku(sku: string): Promise<ProductVariant | null> {
    const [row] = await this.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.sku, sku))
      .limit(1);
    return row ? this.mapVariant(row) : null;
  }

  async updateVariant(
    id: string,
    input: Partial<{
      sku: string;
      status: ProductVariant['status'];
      isDefault: boolean;
    }>,
  ): Promise<ProductVariant> {
    const payload: Partial<typeof productVariants.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.sku !== undefined) payload.sku = input.sku;
    if (input.isDefault !== undefined) payload.isDefault = input.isDefault;
    if (input.status !== undefined) {
      payload.status = input.status;
      if (input.status === 'ARCHIVED') {
        payload.archivedAt = new Date();
      }
    }

    const [row] = await this.db
      .update(productVariants)
      .set(payload)
      .where(eq(productVariants.id, id))
      .returning();
    return this.mapVariant(row);
  }

  async createVariant(input: {
    productId: string;
    sku: string;
    optionFingerprint: string;
    isDefault?: boolean;
    status?: ProductVariant['status'];
  }): Promise<ProductVariant> {
    const [row] = await this.db
      .insert(productVariants)
      .values({
        productId: input.productId,
        sku: input.sku,
        optionFingerprint: input.optionFingerprint,
        isDefault: input.isDefault ?? false,
        status: input.status ?? 'ACTIVE',
      })
      .returning();
    return this.mapVariant(row);
  }

  async findAttributeByCode(code: string): Promise<Attribute | null> {
    const [row] = await this.db
      .select()
      .from(attributes)
      .where(eq(attributes.code, code))
      .limit(1);
    return row
      ? {
          id: row.id,
          code: row.code,
          name: row.name,
          inputType: row.inputType,
        }
      : null;
  }

  async attachVariantOptions(input: {
    variantId: string;
    colorId?: string | null;
    sizeValueId?: string | null;
  }): Promise<void> {
    if (input.colorId) {
      const colorAttr = await this.findAttributeByCode('color');
      if (colorAttr) {
        await this.db
          .insert(productVariantOptions)
          .values({
            variantId: input.variantId,
            attributeId: colorAttr.id,
            colorId: input.colorId,
            sizeValueId: null,
            optionId: null,
          })
          .onConflictDoUpdate({
            target: [
              productVariantOptions.variantId,
              productVariantOptions.attributeId,
            ],
            set: {
              colorId: input.colorId,
              sizeValueId: null,
              optionId: null,
            },
          });
      }
    }
    if (input.sizeValueId) {
      const sizeAttr = await this.findAttributeByCode('size');
      if (sizeAttr) {
        await this.db
          .insert(productVariantOptions)
          .values({
            variantId: input.variantId,
            attributeId: sizeAttr.id,
            sizeValueId: input.sizeValueId,
            colorId: null,
            optionId: null,
          })
          .onConflictDoUpdate({
            target: [
              productVariantOptions.variantId,
              productVariantOptions.attributeId,
            ],
            set: {
              sizeValueId: input.sizeValueId,
              colorId: null,
              optionId: null,
            },
          });
      }
    }
  }

  async getPriceForVariant(variantId: string): Promise<ProductPrice | null> {
    const [row] = await this.db
      .select()
      .from(productPrices)
      .where(eq(productPrices.variantId, variantId))
      .limit(1);
    if (row) return this.mapPrice(row);

    const variant = await this.getVariantById(variantId);
    if (!variant) return null;
    return this.getPriceForProduct(variant.productId);
  }

  async getPriceForProduct(productId: string): Promise<ProductPrice | null> {
    const [row] = await this.db
      .select()
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, productId),
          isNull(productPrices.variantId),
        ),
      )
      .limit(1);
    return row ? this.mapPrice(row) : null;
  }

  async upsertPrice(input: {
    productId: string;
    variantId?: string | null;
    basePricePence: number;
    salePricePence?: number | null;
    compareAtPence?: number | null;
    costPence?: number | null;
    vatRateId: string;
    vatInclusive?: boolean;
  }): Promise<ProductPrice> {
    // Matches prior Supabase behavior (plain insert, not conflict upsert).
    const [row] = await this.db
      .insert(productPrices)
      .values({
        productId: input.productId,
        variantId: input.variantId ?? null,
        basePricePence: input.basePricePence,
        salePricePence: input.salePricePence ?? null,
        compareAtPence: input.compareAtPence ?? null,
        costPence: input.costPence ?? null,
        vatRateId: input.vatRateId,
        vatInclusive: input.vatInclusive ?? true,
      })
      .returning();
    return this.mapPrice(row);
  }

  async getDefaultVatRate(): Promise<{ id: string; rateBps: number } | null> {
    const [row] = await this.db
      .select({ id: vatRates.id, rateBps: vatRates.rateBps })
      .from(vatRates)
      .where(eq(vatRates.isDefault, true))
      .limit(1);
    return row ? { id: row.id, rateBps: row.rateBps } : null;
  }

  async getVatRate(id: string): Promise<{ id: string; rateBps: number } | null> {
    const [row] = await this.db
      .select({ id: vatRates.id, rateBps: vatRates.rateBps })
      .from(vatRates)
      .where(eq(vatRates.id, id))
      .limit(1);
    return row ? { id: row.id, rateBps: row.rateBps } : null;
  }

  async listAttributes(): Promise<Attribute[]> {
    const rows = await this.db
      .select()
      .from(attributes)
      .orderBy(asc(attributes.name));
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      inputType: row.inputType,
    }));
  }

  async createAttribute(input: {
    code: string;
    name: string;
    inputType?: string;
  }): Promise<Attribute> {
    const [row] = await this.db
      .insert(attributes)
      .values({
        code: input.code,
        name: input.name,
        inputType: input.inputType ?? 'SELECT',
      })
      .returning();
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      inputType: row.inputType,
    };
  }

  async listAttributeOptions(attributeId: string): Promise<AttributeOption[]> {
    const rows = await this.db
      .select()
      .from(attributeOptions)
      .where(eq(attributeOptions.attributeId, attributeId))
      .orderBy(asc(attributeOptions.sortOrder));
    return rows.map((row) => ({
      id: row.id,
      attributeId: row.attributeId,
      value: row.value,
      label: row.label,
      sortOrder: row.sortOrder,
    }));
  }

  async createAttributeOption(input: {
    attributeId: string;
    value: string;
    label: string;
    sortOrder?: number;
  }): Promise<AttributeOption> {
    const [row] = await this.db
      .insert(attributeOptions)
      .values({
        attributeId: input.attributeId,
        value: input.value,
        label: input.label,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    return {
      id: row.id,
      attributeId: row.attributeId,
      value: row.value,
      label: row.label,
      sortOrder: row.sortOrder,
    };
  }

  async assignProductAttribute(input: {
    productId: string;
    attributeId: string;
    role: 'VARIANT_DEFINING' | 'INFORMATIONAL';
  }): Promise<void> {
    await this.db
      .insert(productAttributes)
      .values({
        productId: input.productId,
        attributeId: input.attributeId,
        role: input.role,
      })
      .onConflictDoUpdate({
        target: [productAttributes.productId, productAttributes.attributeId],
        set: { role: input.role },
      });
  }

  async listSizeSystems(): Promise<SizeSystem[]> {
    const rows = await this.db
      .select()
      .from(sizeSystems)
      .orderBy(asc(sizeSystems.name));
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
    }));
  }

  async listSizeSystemValues(sizeSystemId: string): Promise<SizeSystemValue[]> {
    const rows = await this.db
      .select()
      .from(sizeSystemValues)
      .where(eq(sizeSystemValues.sizeSystemId, sizeSystemId))
      .orderBy(asc(sizeSystemValues.sortOrder));
    return rows.map((row) => ({
      id: row.id,
      sizeSystemId: row.sizeSystemId,
      code: row.code,
      label: row.label,
      sortOrder: row.sortOrder,
    }));
  }

  async createSizeSystem(input: {
    code: string;
    name: string;
  }): Promise<SizeSystem> {
    const [row] = await this.db
      .insert(sizeSystems)
      .values({
        code: input.code,
        name: input.name,
      })
      .returning();
    return {
      id: row.id,
      code: row.code,
      name: row.name,
    };
  }

  async createSizeSystemValue(input: {
    sizeSystemId: string;
    code: string;
    label: string;
    sortOrder?: number;
  }): Promise<SizeSystemValue> {
    const [row] = await this.db
      .insert(sizeSystemValues)
      .values({
        sizeSystemId: input.sizeSystemId,
        code: input.code,
        label: input.label,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    return {
      id: row.id,
      sizeSystemId: row.sizeSystemId,
      code: row.code,
      label: row.label,
      sortOrder: row.sortOrder,
    };
  }

  async listAllSizeValues(): Promise<SizeSystemValue[]> {
    const rows = await this.db
      .select()
      .from(sizeSystemValues)
      .orderBy(asc(sizeSystemValues.sortOrder));
    return rows.map((row) => ({
      id: row.id,
      sizeSystemId: row.sizeSystemId,
      code: row.code,
      label: row.label,
      sortOrder: row.sortOrder,
    }));
  }

  async updateSizeSystemValue(
    id: string,
    input: Partial<{ code: string; label: string; sortOrder: number }>,
  ): Promise<SizeSystemValue> {
    const payload: Partial<typeof sizeSystemValues.$inferInsert> = {};
    if (input.code !== undefined) payload.code = input.code;
    if (input.label !== undefined) payload.label = input.label;
    if (input.sortOrder !== undefined) payload.sortOrder = input.sortOrder;

    const [row] = await this.db
      .update(sizeSystemValues)
      .set(payload)
      .where(eq(sizeSystemValues.id, id))
      .returning();
    return {
      id: row.id,
      sizeSystemId: row.sizeSystemId,
      code: row.code,
      label: row.label,
      sortOrder: row.sortOrder,
    };
  }

  async deleteSizeSystemValue(id: string): Promise<void> {
    await this.db
      .delete(sizeSystemValues)
      .where(eq(sizeSystemValues.id, id));
  }

  async createSizeChart(input: {
    name: string;
    scopeType: 'PRODUCT' | 'CATEGORY';
    scopeId: string;
    sizeSystemId?: string | null;
  }): Promise<SizeChart> {
    const [row] = await this.db
      .insert(sizeCharts)
      .values({
        name: input.name,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        sizeSystemId: input.sizeSystemId ?? null,
      })
      .returning();
    return {
      id: row.id,
      name: row.name,
      scopeType: row.scopeType as SizeChart['scopeType'],
      scopeId: row.scopeId,
      sizeSystemId: row.sizeSystemId ?? null,
    };
  }

  async listSizeCharts(
    scopeType?: string,
    scopeId?: string,
  ): Promise<SizeChart[]> {
    const conditions: SQL[] = [];
    if (scopeType) conditions.push(eq(sizeCharts.scopeType, scopeType));
    if (scopeId) conditions.push(eq(sizeCharts.scopeId, scopeId));

    const rows = await this.db
      .select()
      .from(sizeCharts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(sizeCharts.name));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      scopeType: row.scopeType as SizeChart['scopeType'],
      scopeId: row.scopeId,
      sizeSystemId: row.sizeSystemId ?? null,
    }));
  }

  async upsertSizeChartRow(input: {
    sizeChartId: string;
    sizeLabel: string;
    measurements: Record<string, unknown>;
    sortOrder?: number;
  }): Promise<SizeChartRow> {
    // Matches prior Supabase behavior (plain insert).
    const [row] = await this.db
      .insert(sizeChartRows)
      .values({
        sizeChartId: input.sizeChartId,
        sizeLabel: input.sizeLabel,
        measurements: input.measurements,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    return {
      id: row.id,
      sizeChartId: row.sizeChartId,
      sizeLabel: row.sizeLabel,
      measurements: (row.measurements as Record<string, unknown>) ?? {},
      sortOrder: row.sortOrder,
    };
  }

  async listSizeChartRows(sizeChartId: string): Promise<SizeChartRow[]> {
    const rows = await this.db
      .select()
      .from(sizeChartRows)
      .where(eq(sizeChartRows.sizeChartId, sizeChartId))
      .orderBy(asc(sizeChartRows.sortOrder));
    return rows.map((row) => ({
      id: row.id,
      sizeChartId: row.sizeChartId,
      sizeLabel: row.sizeLabel,
      measurements: (row.measurements as Record<string, unknown>) ?? {},
      sortOrder: row.sortOrder,
    }));
  }

  private mapDepartment = (
    row: typeof departments.$inferSelect,
  ): Department => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    imageUrl: row.imageUrl ?? null,
  });

  private mapCategory = (row: typeof categories.$inferSelect): Category => ({
    id: row.id,
    departmentId: row.departmentId,
    parentId: row.parentId ?? null,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    imageUrl: row.imageUrl ?? null,
  });

  private mapBrand = (row: typeof brands.$inferSelect): Brand => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoPath: row.logoPath ?? null,
    description: row.description ?? null,
    status: row.status,
  });

  private mapCollection = (
    row: typeof collections.$inferSelect,
  ): Collection => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    status: row.status,
  });

  private mapProduct = (
    row: typeof products.$inferSelect,
  ): CommerceProduct => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    shortDescription: row.shortDescription ?? null,
    productType: row.productType as CommerceProduct['productType'],
    departmentId: row.departmentId ?? null,
    categoryId: row.categoryId ?? null,
    subcategoryId: row.subcategoryId ?? null,
    brandId: row.brandId ?? null,
    status: row.status as CommerceProduct['status'],
    seo: (row.seo as Record<string, unknown>) ?? {},
    archivedAt: row.archivedAt ? new Date(row.archivedAt) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  });

  private mapVariant = (
    row: typeof productVariants.$inferSelect,
  ): ProductVariant => ({
    id: row.id,
    productId: row.productId,
    sku: row.sku,
    status: row.status as ProductVariant['status'],
    optionFingerprint: row.optionFingerprint,
    isDefault: row.isDefault,
  });

  private mapPrice = (row: typeof productPrices.$inferSelect): ProductPrice => ({
    id: row.id,
    productId: row.productId,
    variantId: row.variantId ?? null,
    currency: row.currency,
    basePricePence: Number(row.basePricePence),
    salePricePence:
      row.salePricePence == null ? null : Number(row.salePricePence),
    compareAtPence:
      row.compareAtPence == null ? null : Number(row.compareAtPence),
    costPence: row.costPence == null ? null : Number(row.costPence),
    vatRateId: row.vatRateId,
    vatInclusive: row.vatInclusive,
  });
}
