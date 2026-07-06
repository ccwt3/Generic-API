import { createHmac } from "node:crypto";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";

import app from "../app.js";
import { prisma } from "../prisma/lib/prisma.js";
import { COOKIE_KEY } from "../config/env.js";
import { truncateAll, registerAndGetCookies } from "./helpers.js";

beforeEach(truncateAll);
afterAll(() => prisma.$disconnect());

// Replica la firma de cookie-parser (cookie-signature) para poder mandar una
// cookie con firma válida pero contenido que no es un JWT: cubre la rama 401
// de checkToken (con firma inválida, cookie-parser la descarta y daría 400).
function signedCookie(name: string, value: string) {
  const hmac = createHmac("sha256", COOKIE_KEY)
    .update(value)
    .digest("base64")
    .replace(/=+$/, "");

  return `${name}=${encodeURIComponent(`s:${value}.${hmac}`)}`;
}

describe("GET /users/me", () => {
  it("devuelve los datos del usuario autenticado", async () => {
    const cookies = await registerAndGetCookies("users.tester");

    const response = await request(app)
      .get("/users/me")
      .set("Cookie", cookies.token)
      .expect(200);

    expect(response.body.user).toMatchObject({
      username: "users.tester",
      role: "USER",
    });
    expect(response.body.user.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sin token responde 400", async () => {
    await request(app).get("/users/me").expect(400);
  });

  it("con un token que no es JWT responde 401", async () => {
    await request(app)
      .get("/users/me")
      .set("Cookie", signedCookie("token", "no-soy-un-jwt"))
      .expect(401);
  });
});

describe("GET /users/me/posts", () => {
  it("lista solo los posts propios, incluyendo borradores, más reciente primero", async () => {
    const mine = await registerAndGetCookies("users.tester");
    const other = await registerAndGetCookies("users.other");

    const newPost = (title: string, cookies: typeof mine) =>
      request(app)
        .post("/posts")
        .set("Cookie", cookies.token)
        .send({ title, message: "Mensaje de prueba suficientemente largo." })
        .expect(201);

    await newPost("Mi borrador viejo", mine);
    await newPost("Mi borrador nuevo", mine);
    await newPost("Post de otro usuario", other);

    const response = await request(app)
      .get("/users/me/posts")
      .set("Cookie", mine.token)
      .expect(200);

    const titles = response.body.posts.map(
      (row: { title: string }) => row.title,
    );
    expect(titles).toEqual(["Mi borrador nuevo", "Mi borrador viejo"]);
  });

  it("sin token responde 400", async () => {
    await request(app).get("/users/me/posts").expect(400);
  });
});
