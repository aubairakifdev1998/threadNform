export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiErrorBody;

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type User = {
  id: string;
  email: string;
  fullName?: string | null;
  role?: string;
  roles?: string[];
  isAdmin?: boolean;
  adminRole?: "OWNER" | "ADMIN" | "STAFF" | null;
  avatarUrl?: string | null;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  user: User;
};

export type SignUpResult =
  | { status: "authenticated"; session: AuthSession }
  | {
      status: "confirmation_required";
      email: string;
      message: string;
    };

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  productType: "SIMPLE" | "VARIABLE";
  basePricePence?: number | null;
  primaryImageUrl?: string | null;
  brandName?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  departmentId?: string | null;
  inStock?: boolean;
};

export type CatalogFilters = {
  departments: Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    imageUrl?: string | null;
  }>;
  categories: Array<{
    id: string;
    departmentId: string;
    parentId: string | null;
    name: string;
    slug: string;
    isActive: boolean;
    imageUrl?: string | null;
  }>;
  brands: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
  }>;
  collections: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
  }>;
  sizes: Array<{
    id: string;
    sizeSystemId: string;
    code: string;
    label: string;
    sortOrder: number;
  }>;
  colors: Array<{
    id: string;
    name: string;
    hex: string | null;
  }>;
  attributes: Array<{
    id: string;
    code: string;
    name: string;
    inputType: string;
    options: Array<{
      id: string;
      attributeId: string;
      value: string;
      label: string;
      sortOrder: number;
    }>;
  }>;
  priceRange: {
    minPence: number | null;
    maxPence: number | null;
  };
};

export type ProductListParams = {
  page?: number;
  pageSize?: number;
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
};

export type ProductDetail = ProductSummary & {
  variants?: ProductVariant[];
  media?: ProductMedia[];
  options?: ProductOption[];
  price?: {
    basePence: number;
    salePence?: number | null;
    compareAtPence?: number | null;
    currency?: string;
    vatInclusive?: boolean;
  } | null;
};

export type ProductVariant = {
  id: string;
  sku: string;
  basePricePence?: number | null;
  optionFingerprint?: string | null;
  inStock?: boolean;
};

export type ProductMedia = {
  id: string;
  url: string;
  alt?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
  variantId?: string | null;
};

export type ProductOption = {
  id: string;
  name: string;
  values: { id: string; value: string; hex?: string | null }[];
};

export type CartItem = {
  id: string;
  variantId: string;
  quantity: number;
  unitPricePence: number;
  lineTotalPence?: number;
  productName?: string;
  productSlug?: string;
  sku?: string;
  imageUrl?: string | null;
};

export type Cart = {
  id: string;
  guestToken?: string;
  items: CartItem[];
  subtotalPence?: number;
};

export type ShippingMethod = {
  id: string;
  name: string;
  description?: string | null;
  pricePence: number;
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
};

export type UkAddress = {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  county?: string;
  postcode: string;
  country?: string;
  phone?: string;
};

export type OrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus?: string;
  shippingStatus?: string;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  totalPence: number;
  grandTotalPence?: number;
  createdAt: string;
};

export type CustomerProfile = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  status?: string;
};

export type CustomerAddress = {
  id: string;
  customerId: string;
  fullName: string;
  line1: string;
  line2?: string | null;
  city: string;
  county?: string | null;
  postcode: string;
  country: string;
  phone?: string | null;
  isDefaultShipping: boolean;
};

export type AdminDashboard = {
  ordersToday?: number;
  revenueTodayPence?: number;
  pendingPayments?: number;
  pendingPaymentVerifications?: number;
  lowStockVariants?: number;
  processingOrders?: number;
  [key: string]: unknown;
};

export type SiteBillboard = {
  id: string;
  title: string;
  subtitle: string | null;
  seasonLabel: string | null;
  ctaLabel: string;
  ctaHref: string;
  secondaryCtaLabel: string | null;
  secondaryCtaHref: string | null;
  mediaType: "IMAGE" | "VIDEO" | "NONE";
  mediaUrl: string | null;
  posterUrl: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type CustomerReview = {
  id: string;
  customerName: string;
  rating: number;
  title: string | null;
  body: string;
  imageUrl: string | null;
  location: string | null;
  isPublished: boolean;
  sortOrder: number;
};
