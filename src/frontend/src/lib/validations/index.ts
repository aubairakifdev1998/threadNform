import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signUpSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const ukAddressSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  line1: z.string().min(2, "Address line 1 is required"),
  line2: z.string().optional(),
  city: z.string().min(2, "City is required"),
  county: z.string().optional(),
  postcode: z
    .string()
    .min(5, "Enter a valid UK postcode")
    .max(8)
    .regex(/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, "Enter a valid UK postcode"),
  country: z.string().default("GB"),
  phone: z.string().optional(),
});

export const checkoutSchema = z.object({
  email: z.email("Enter a valid email"),
  phone: z.string().optional(),
  customerNote: z.string().max(500).optional(),
  shippingMethodId: z.string().uuid("Select a shipping method"),
  shippingAddress: ukAddressSchema,
  billingSameAsShipping: z.boolean().default(true),
  billingAddress: ukAddressSchema.optional(),
});

export const productFormSchema = z.object({
  name: z.string().min(2, "Product name is required"),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase kebab-case"),
  description: z.string().optional(),
  productType: z.enum(["SIMPLE", "VARIABLE"]),
  categoryId: z.string().uuid().optional().or(z.literal("")),
  basePricePounds: z.number().min(0).optional(),
  sku: z.string().optional(),
  sizeValueIds: z.array(z.string().uuid()).optional(),
  colorIds: z.array(z.string().uuid()).optional(),
  initialStock: z.number().int().min(0).optional(),
});

export const stockAdjustmentSchema = z.object({
  warehouseId: z.string().uuid("Select a warehouse"),
  variantId: z.string().uuid("Select a variant"),
  onHandDelta: z.number().int("Must be a whole number"),
  reason: z.string().min(2, "Reason is required"),
});

export const paymentRejectSchema = z.object({
  reason: z.string().min(5, "Provide a rejection reason"),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type CheckoutValues = z.infer<typeof checkoutSchema>;
export type ProductFormValues = z.infer<typeof productFormSchema>;
export type StockAdjustmentValues = z.infer<typeof stockAdjustmentSchema>;
