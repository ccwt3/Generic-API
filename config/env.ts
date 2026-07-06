import "dotenv/config";

// Única fuente de verdad de la configuración por entorno.
// Las variables críticas se validan aquí: si falta alguna, la app no arranca.

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

function getNumberEnv(name: string, defaultValue: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return defaultValue;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

// Críticas: la app no arranca si faltan.
export const DATABASE_URL = getRequiredEnv("DATABASE_URL");
export const JWT_KEY = getRequiredEnv("JWT_KEY");
export const JWT_KEY_REFRESH = getRequiredEnv("JWT_KEY_REFRESH");
export const COOKIE_KEY = getRequiredEnv("COOKIE_KEY");

// Opcionales con default.
export const PORT = getNumberEnv("PORT", 3000);
export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";
export const IS_PRODUCTION = process.env.ENVIRONMENT === "production";

// Vidas de los tokens, en segundos. El maxAge de las cookies se deriva de
// estos mismos valores (ttl * 1000), así JWT y cookie no pueden divergir.
export const ACCESS_TOKEN_TTL_S = getNumberEnv("ACCESS_TOKEN_TTL_S", 900); // 15 min
export const REFRESH_TOKEN_TTL_S = getNumberEnv(
  "REFRESH_TOKEN_TTL_S",
  604_800, // 7 días
);

// Ventana de gracia para reusos casi simultáneos de un refresh token rotado.
export const REFRESH_TOKEN_GRACE_PERIOD_MS = 5_000;
