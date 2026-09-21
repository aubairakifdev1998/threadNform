const ACCESS_TOKEN_KEY = "threadnform_access_token";
const REFRESH_TOKEN_KEY = "threadnform_refresh_token";
const GUEST_CART_ID_KEY = "threadnform_guest_cart_id";
const GUEST_TOKEN_KEY = "threadnform_guest_token";

function canUseStorage() {
  return typeof window !== "undefined";
}

export const tokenStore = {
  getAccessToken() {
    if (!canUseStorage()) return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  getRefreshToken() {
    if (!canUseStorage()) return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  setSession(accessToken: string, refreshToken: string) {
    if (!canUseStorage()) return;
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clearSession() {
    if (!canUseStorage()) return;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export const guestCartStore = {
  getCartId() {
    if (!canUseStorage()) return null;
    return localStorage.getItem(GUEST_CART_ID_KEY);
  },
  getGuestToken() {
    if (!canUseStorage()) return null;
    return localStorage.getItem(GUEST_TOKEN_KEY);
  },
  set(cartId: string, guestToken: string) {
    if (!canUseStorage()) return;
    localStorage.setItem(GUEST_CART_ID_KEY, cartId);
    localStorage.setItem(GUEST_TOKEN_KEY, guestToken);
  },
  clear() {
    if (!canUseStorage()) return;
    localStorage.removeItem(GUEST_CART_ID_KEY);
    localStorage.removeItem(GUEST_TOKEN_KEY);
  },
};
