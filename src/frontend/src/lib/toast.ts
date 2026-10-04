import { toast as sonner } from "sonner";

/**
 * One toast API for admin + storefront. Keeps copy, duration, and tone
 * consistent so callers never invent their own Sonner options.
 */
export const toast = {
  success(message: string, description?: string) {
    return sonner.success(message, { description });
  },
  error(message: string, description?: string) {
    return sonner.error(message, { description });
  },
  info(message: string, description?: string) {
    return sonner.info(message, { description });
  },
  warning(message: string, description?: string) {
    return sonner.warning(message, { description });
  },
  loading(message: string) {
    return sonner.loading(message);
  },
  dismiss(id?: string | number) {
    return sonner.dismiss(id);
  },
  promise: sonner.promise,
};
