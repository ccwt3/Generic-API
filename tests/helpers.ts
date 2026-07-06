import request from "supertest";
import type { Response } from "supertest";
import app from "../app.js";
import { prisma } from "../prisma/lib/prisma.js";

// Deja la DB vacía; se llama en el beforeEach de cada suite.
export async function truncateAll() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Tokens", "Post", "User" CASCADE',
  );
}

export type AuthCookies = {
  token: string; // par "token=..." listo para el header Cookie
  refreshToken: string; // par "refreshToken=..." listo para el header Cookie
};

// Registra un usuario y devuelve sus cookies de sesión. Supertest no maneja
// cookie jar con paths, así que las cookies se reenvían a mano con
// .set("Cookie", ...).
export async function registerAndGetCookies(
  username: string,
): Promise<AuthCookies> {
  const response = await request(app)
    .post("/auth/register")
    .send({ username, password: "secret123" })
    .expect(201);

  return cookiesFromResponse(response);
}

// Extrae los pares nombre=valor de los headers Set-Cookie de una respuesta.
export function cookiesFromResponse(response: Response): AuthCookies {
  const setCookies = setCookiesFromResponse(response);

  return {
    token: lastCookiePair(setCookies, "token"),
    refreshToken: lastCookiePair(setCookies, "refreshToken"),
  };
}

export function setCookiesFromResponse(response: Response): string[] {
  const header = response.headers["set-cookie"];

  if (!header) {
    return [];
  }

  return Array.isArray(header) ? header : [header];
}

function lastCookiePair(setCookies: string[], name: string): string {
  const pairs = setCookies
    .filter((cookie) => cookie.startsWith(`${name}=`))
    .map((cookie) => cookie.split(";")[0] ?? "");

  return pairs.at(-1) ?? "";
}
