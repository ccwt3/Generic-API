import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";

import app from "../app.js";
import { prisma } from "../prisma/lib/prisma.js";
import {
  truncateAll,
  registerAndGetCookies,
  cookiesFromResponse,
  setCookiesFromResponse,
} from "./helpers.js";

beforeEach(truncateAll);
afterAll(() => prisma.$disconnect());

describe("POST /auth/register", () => {
  it("crea el usuario y abre sesión con cookies httpOnly", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ username: "auth.user", password: "secret123" })
      .expect(201);

    expect(response.body.message).toBe("Register successful");

    const setCookies = setCookiesFromResponse(response);
    const tokenCookie = setCookies.find((c) => c.startsWith("token="));
    const refreshCookies = setCookies.filter((c) =>
      c.startsWith("refreshToken="),
    );

    expect(tokenCookie).toContain("HttpOnly");
    expect(tokenCookie).toContain("Path=/");
    // refreshToken se emite dos veces, restringida a sus dos endpoints
    expect(refreshCookies).toHaveLength(2);
    expect(refreshCookies.join(" ")).toContain("Path=/auth/refresh");
    expect(refreshCookies.join(" ")).toContain("Path=/auth/logout");
  });

  it("rechaza un username ya registrado con 409", async () => {
    await registerAndGetCookies("auth.user");

    const response = await request(app)
      .post("/auth/register")
      .send({ username: "auth.user", password: "secret123" })
      .expect(409);

    expect(response.body.message).toBe("Username is already in use");
  });

  it("rechaza un username inválido con 400 { errors }", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ username: "Invalid User!", password: "secret123" })
      .expect(400);

    expect(response.body.errors).toHaveProperty("username");
  });

  it("rechaza un password corto con 400 { errors }", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ username: "auth.user", password: "abc" })
      .expect(400);

    expect(response.body.errors).toHaveProperty("password");
  });
});

describe("POST /auth/login", () => {
  it("abre sesión con credenciales válidas", async () => {
    await registerAndGetCookies("auth.user");

    const response = await request(app)
      .post("/auth/login")
      .send({ username: "auth.user", password: "secret123" })
      .expect(200);

    expect(response.body.message).toBe("User logged in");

    const cookies = cookiesFromResponse(response);
    expect(cookies.token).not.toBe("");
    expect(cookies.refreshToken).not.toBe("");
  });

  it("rechaza un password incorrecto con 401", async () => {
    await registerAndGetCookies("auth.user");

    await request(app)
      .post("/auth/login")
      .send({ username: "auth.user", password: "wrongpass" })
      .expect(401);
  });

  it("rechaza un usuario inexistente con 401", async () => {
    await request(app)
      .post("/auth/login")
      .send({ username: "no.existe", password: "secret123" })
      .expect(401);
  });
});

describe("POST /auth/refresh", () => {
  it("rota el refresh token y renueva el access", async () => {
    const oldCookies = await registerAndGetCookies("auth.user");

    const response = await request(app)
      .post("/auth/refresh")
      .set("Cookie", oldCookies.refreshToken)
      .expect(200);

    const newCookies = cookiesFromResponse(response);
    expect(newCookies.refreshToken).not.toBe("");
    expect(newCookies.refreshToken).not.toBe(oldCookies.refreshToken);
    // El access no se compara por desigualdad: firmado en el mismo segundo
    // con los mismos claims produce un JWT idéntico (por eso el refresh lleva jti)
    expect(newCookies.token).not.toBe("");
  });

  it("marca el token anterior como USED y lo enlaza con su reemplazo", async () => {
    const oldCookies = await registerAndGetCookies("auth.user");

    await request(app)
      .post("/auth/refresh")
      .set("Cookie", oldCookies.refreshToken)
      .expect(200);

    const rows = await prisma.tokens.findMany();
    expect(rows).toHaveLength(2);

    const usedRow = rows.find((row) => row.status === "USED");
    const activeRow = rows.find((row) => row.status === "ACTIVE");

    expect(usedRow?.used_at).not.toBeNull();
    expect(usedRow?.replaced_by).toBe(activeRow?.id);
  });

  it("tolera dos refresh casi simultáneos (ventana de gracia)", async () => {
    const cookies = await registerAndGetCookies("auth.user");

    const [first, second] = await Promise.all([
      request(app).post("/auth/refresh").set("Cookie", cookies.refreshToken),
      request(app).post("/auth/refresh").set("Cookie", cookies.refreshToken),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // La sesión sigue viva: el token devuelto puede seguir rotándose
    const survivor = cookiesFromResponse(first);
    await request(app)
      .post("/auth/refresh")
      .set("Cookie", survivor.refreshToken)
      .expect(200);
  });

  it("detecta reutilización fuera de la gracia: 403 y mata la sesión", async () => {
    const oldCookies = await registerAndGetCookies("auth.user");

    await request(app)
      .post("/auth/refresh")
      .set("Cookie", oldCookies.refreshToken)
      .expect(200);

    // Retrocede used_at para salir de la ventana de gracia sin dormir 5s
    await prisma.tokens.updateMany({
      where: { status: "USED" },
      data: { used_at: new Date(Date.now() - 10_000) },
    });

    await request(app)
      .post("/auth/refresh")
      .set("Cookie", oldCookies.refreshToken)
      .expect(403);

    // Todos los tokens del usuario borrados: sesión invalidada
    const remaining = await prisma.tokens.findMany();
    expect(remaining).toHaveLength(0);
  });

  it("responde 400 si no llega la cookie", async () => {
    await request(app).post("/auth/refresh").expect(400);
  });
});

describe("POST /auth/logout", () => {
  it("cierra sesión y limpia las cookies", async () => {
    const cookies = await registerAndGetCookies("auth.user");

    const response = await request(app)
      .post("/auth/logout")
      .set("Cookie", cookies.refreshToken)
      .expect(200);

    expect(response.body.message).toBe("User logged out successfully");

    // clearCookie emite las cookies vacías y expiradas
    const setCookies = setCookiesFromResponse(response);
    expect(setCookies.some((c) => c.startsWith("token=;"))).toBe(true);

    const remaining = await prisma.tokens.findMany();
    expect(remaining).toHaveLength(0);
  });

  it("un refresh token ya deslogueado se trata como reutilización (403)", async () => {
    const cookies = await registerAndGetCookies("auth.user");

    await request(app)
      .post("/auth/logout")
      .set("Cookie", cookies.refreshToken)
      .expect(200);

    await request(app)
      .post("/auth/refresh")
      .set("Cookie", cookies.refreshToken)
      .expect(403);
  });

  it("responde 400 si no llega la cookie", async () => {
    await request(app).post("/auth/logout").expect(400);
  });
});
