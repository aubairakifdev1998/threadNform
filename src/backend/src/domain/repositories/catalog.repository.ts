export type Department = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  imageUrl: string | null;
};

export type Category = {
  id: string;
  departmentId: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  imageUrl: string | null;
};

export type Brand = {
  id: string;
  name: string;
  slug: string;
  logoPath: string | null;
  description: string | null;
  status: string;
};

export type Collection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
};

export type CommerceProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  productType: 'SIMPLE' | 'VARIABLE';
  departmentId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  brandId: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  seo: Record<string, unknown>;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductVariant = {
  id: string;
  productId: string;
  sku: string;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  optionFingerprint: string;
  isDefault: boolean;
};

export type ProductPrice = {
  id: string;
  productId: string;
  variantId: string | null;
  currency: string;
  basePricePence: number;
  salePricePence: number | null;
  compareAtPence: number | null;
  costPence: number | null;
  vatRateId: string;
  vatInclusive: boolean;
};

export type Attribute = {
  id: string;
  code: string;
  name: string;
  inputType: string;
};

export type AttributeOption = {
  id: string;
  attributeId: string;
  value: string;
  label: string;
  sortOrder: number;
};

export type SizeSystem = {
  id: string;
  code: string;
  name: string;
};

export type SizeSystemValue = {
  id: string;
  sizeSystemId: string;
  code: string;
  label: string;
  sortOrder: number;
};

export type SizeChart = {
  id: string;
  name: string;
  scopeType: 'PRODUCT' | 'CATEGORY';
  scopeId: string;
  sizeSystemId: string | null;
};

export type SizeChartRow = {
  id: string;
  sizeChartId: string;
  sizeLabel: string;
  measurements: Record<string, unknown>;
  sortOrder: number;
};

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

export interface CatalogRepository {
  listDepartments(): Promise<Department[]>;
  createDepartment(input: {
    name: string;
    slug: string;
    sortOrder?: number;
    imageUrl?: string | null;
  }): Promise<Department>;
  updateDepartment(
    id: string,
    input: Partial<{
      name: string;
      slug: string;
      sortOrder: number;
      imageUrl: string | null;
      isActive: boolean;
    }>,
  ): Promise<Department>;
  listCategories(departmentId?: string): Promise<Category[]>;
  createCategory(input: {
    departmentId: string;
    parentId?: string | null;
    name: string;
    slug: string;
    sortOrder?: number;
    imageUrl?: string | null;
  }): Promise<Category>;
  updateCategory(
    id: string,
    input: Partial<{
      name: string;
      slug: string;
      departmentId: string;
      sortOrder: number;
      imageUrl: string | null;
    }>,
  ): Promise<Category>;
  deleteCategory(id: string): Promise<void>;
  listColors(): Promise<Array<{ id: string; name: string; hex: string | null }>>;
  createColor(input: {
    name: string;
    hex?: string | null;
  }): Promise<{ id: string; name: string; hex: string | null }>;
  updateColor(
    id: string,
    input: Partial<{ name: string; hex: string | null }>,
  ): Promise<{ id: string; name: string; hex: string | null }>;
  deleteColor(id: string): Promise<void>;
  listBrands(): Promise<Brand[]>;
  createBrand(input: {
    name: string;
    slug: string;
    description?: string | null;
  }): Promise<Brand>;
  listCollections(): Promise<Collection[]>;
  createCollection(input: {
    name: string;
    slug: string;
    description?: string | null;
  }): Promise<Collection>;
  listProducts(params: {
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
  }): Promise<{ items: CommerceProduct[]; total: number }>;
  enrichProductSummaries(
    products: CommerceProduct[],
  ): Promise<
    Array<
      CommerceProduct & {
        brandName: string | null;
        categoryName: string | null;
        basePricePence: number | null;
        primaryImageUrl: string | null;
        inStock: boolean;
      }
    >
  >;
  getStorefrontFilters(): Promise<{
    departments: Department[];
    categories: Category[];
    brands: Brand[];
    collections: Collection[];
    sizes: SizeSystemValue[];
    colors: Array<{ id: string; name: string; hex: string | null }>;
    attributes: Array<Attribute & { options: AttributeOption[] }>;
    priceRange: { minPence: number | null; maxPence: number | null };
  }>;
  findCategoryBySlug(slug: string): Promise<Category | null>;
  findCollectionBySlug(slug: string): Promise<Collection | null>;
  findDepartmentBySlug(slug: string): Promise<Department | null>;
  getProductById(id: string): Promise<CommerceProduct | null>;
  getProductBySlug(slug: string): Promise<CommerceProduct | null>;
  createProduct(input: {
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
  }): Promise<CommerceProduct>;
  updateProduct(
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
  ): Promise<CommerceProduct>;
  listVariants(productId: string): Promise<ProductVariant[]>;
  getVariantById(id: string): Promise<ProductVariant | null>;
  getVariantBySku(sku: string): Promise<ProductVariant | null>;
  createVariant(input: {
    productId: string;
    sku: string;
    optionFingerprint: string;
    isDefault?: boolean;
    status?: ProductVariant['status'];
  }): Promise<ProductVariant>;
  updateVariant(
    id: string,
    input: Partial<{
      sku: string;
      status: ProductVariant['status'];
      isDefault: boolean;
    }>,
  ): Promise<ProductVariant>;
  attachVariantOptions(input: {
    variantId: string;
    colorId?: string | null;
    sizeValueId?: string | null;
  }): Promise<void>;
  findAttributeByCode(code: string): Promise<Attribute | null>;
  getPriceForVariant(variantId: string): Promise<ProductPrice | null>;
  getPriceForProduct(productId: string): Promise<ProductPrice | null>;
  upsertPrice(input: {
    productId: string;
    variantId?: string | null;
    basePricePence: number;
    salePricePence?: number | null;
    compareAtPence?: number | null;
    costPence?: number | null;
    vatRateId: string;
    vatInclusive?: boolean;
  }): Promise<ProductPrice>;
  getDefaultVatRate(): Promise<{ id: string; rateBps: number } | null>;
  getVatRate(id: string): Promise<{ id: string; rateBps: number } | null>;

  listAttributes(): Promise<Attribute[]>;
  createAttribute(input: {
    code: string;
    name: string;
    inputType?: string;
  }): Promise<Attribute>;
  listAttributeOptions(attributeId: string): Promise<AttributeOption[]>;
  createAttributeOption(input: {
    attributeId: string;
    value: string;
    label: string;
    sortOrder?: number;
  }): Promise<AttributeOption>;
  assignProductAttribute(input: {
    productId: string;
    attributeId: string;
    role: 'VARIANT_DEFINING' | 'INFORMATIONAL';
  }): Promise<void>;
  listSizeSystems(): Promise<SizeSystem[]>;
  listSizeSystemValues(sizeSystemId: string): Promise<SizeSystemValue[]>;
  listAllSizeValues(): Promise<SizeSystemValue[]>;
  createSizeSystem(input: { code: string; name: string }): Promise<SizeSystem>;
  createSizeSystemValue(input: {
    sizeSystemId: string;
    code: string;
    label: string;
    sortOrder?: number;
  }): Promise<SizeSystemValue>;
  updateSizeSystemValue(
    id: string,
    input: Partial<{ code: string; label: string; sortOrder: number }>,
  ): Promise<SizeSystemValue>;
  deleteSizeSystemValue(id: string): Promise<void>;
  createSizeChart(input: {
    name: string;
    scopeType: 'PRODUCT' | 'CATEGORY';
    scopeId: string;
    sizeSystemId?: string | null;
  }): Promise<SizeChart>;
  listSizeCharts(scopeType?: string, scopeId?: string): Promise<SizeChart[]>;
  upsertSizeChartRow(input: {
    sizeChartId: string;
    sizeLabel: string;
    measurements: Record<string, unknown>;
    sortOrder?: number;
  }): Promise<SizeChartRow>;
  listSizeChartRows(sizeChartId: string): Promise<SizeChartRow[]>;
}
