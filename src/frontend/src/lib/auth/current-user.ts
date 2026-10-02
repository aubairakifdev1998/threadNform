import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import type { User } from "@/types/api";

/** A session is only invalid when the API says so; anything else is transient. */
function isAuthRejection(error: unknown) {
  return (
    error instanceof ApiError && (error.status === 401 || error.status === 400)
  );
}

// Supabase refresh tokens are single-use: share one refresh across callers.
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return null;
  refreshing ??= authApi
    .refresh(refreshToken)
    .then((session) => {
      tokenStore.setSession(session.accessToken, session.refreshToken);
      return session.accessToken;
    })
    .catch((error: unknown) => {
      if (isAuthRejection(error)) return null;
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * The signed-in user, refreshing an expired access token once.
 * Returns null (and clears the stored session) only when the session is
 * definitively invalid. Network errors, 5xx and 429 are rethrown so callers
 * keep the user signed in.
 */
export async function fetchCurrentUser(): Promise<User | null> {
  const token = tokenStore.getAccessToken();
  if (!token) return null;
  try {
    return await authApi.me(token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }
  const fresh = await refreshAccessToken();
  if (!fresh) {
    tokenStore.clearSession();
    return null;
  }
  try {
    return await authApi.me(fresh);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      tokenStore.clearSession();
      return null;
    }
    throw error;
  }
}

/**
 * A usable access token for an authenticated request, refreshed if expired;
 * null when signed out. Transient failures fall back to the stored token.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  if (!tokenStore.getAccessToken()) return null;
  try {
    return (await fetchCurrentUser()) ? tokenStore.getAccessToken() : null;
  } catch {
    return tokenStore.getAccessToken();
  }
}
