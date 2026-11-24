const isDevelopment = import.meta.env.DEV;
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

if (!configuredApiUrl && !isDevelopment) {
  throw new Error("VITE_API_URL must be configured for production.");
}

const apiBaseUrl = (
  configuredApiUrl || "http://localhost:5000"
).replace(/\/+$/, "");

if (!isDevelopment) {
  const hostname = new URL(apiBaseUrl).hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  ) {
    throw new Error("VITE_API_URL cannot target localhost in production.");
  }
}

export function apiUrl(path) {
  return `${apiBaseUrl}/${path.replace(/^\/+/, "")}`;
}
