const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const rawApiBaseUrlValue = (import.meta.env as Record<string, unknown>)
  .VITE_API_BASE_URL;
const rawApiBaseUrl =
  typeof rawApiBaseUrlValue === "string" ? rawApiBaseUrlValue.trim() : "";

const apiBaseUrl =
  rawApiBaseUrl.length > 0 ? trimTrailingSlash(rawApiBaseUrl) : "";

export const buildApiUrl = (path: string): string => {
  if (path.startsWith("/")) {
    return `${apiBaseUrl}${path}`;
  }

  return `${apiBaseUrl}/${path}`;
};
