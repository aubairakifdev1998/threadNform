import type { ApiEnvelope } from "@/types/api";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: string;
      status: number;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
  }
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken?: string | null;
  guestToken?: string | null;
  idempotencyKey?: string;
  searchParams?: Record<string, string | number | boolean | undefined | null>;
  cache?: RequestCache;
  next?: NextFetchRequestConfig;
  headers?: HeadersInit;
};

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1"
  ).replace(/\/$/, "");
}

function buildUrl(
  path: string,
  searchParams?: RequestOptions["searchParams"],
) {
  const url = new URL(
    path.startsWith("http") ? path : `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`,
  );

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    accessToken,
    guestToken,
    idempotencyKey,
    searchParams,
    cache,
    next,
    headers: extraHeaders,
  } = options;

  const headers = new Headers(extraHeaders);
  headers.set("Accept", "application/json");

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (guestToken) {
    headers.set("X-Guest-Token", guestToken);
  }
  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  const response = await fetch(buildUrl(path, searchParams), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache,
    next,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!payload || typeof payload !== "object" || !("success" in payload)) {
    throw new ApiError("Unexpected response from API", {
      code: "UNEXPECTED_RESPONSE",
      status: response.status,
    });
  }

  if (!payload.success) {
    throw new ApiError(payload.error.message || "Request failed", {
      code: payload.error.code || "REQUEST_FAILED",
      status: response.status,
      details: payload.error.details,
    });
  }

  return payload.data;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: Omit<RequestOptions, "body" | "method"> = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }
  if (options.guestToken) {
    headers.set("X-Guest-Token", options.guestToken);
  }
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }

  const response = await fetch(buildUrl(path, options.searchParams), {
    method: "POST",
    headers,
    body: formData,
    cache: options.cache,
    next: options.next,
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!payload || typeof payload !== "object" || !("success" in payload)) {
    throw new ApiError("Unexpected response from API", {
      code: "UNEXPECTED_RESPONSE",
      status: response.status,
    });
  }

  if (!payload.success) {
    throw new ApiError(payload.error.message || "Upload failed", {
      code: payload.error.code || "UPLOAD_FAILED",
      status: response.status,
      details: payload.error.details,
    });
  }

  return payload.data;
}
