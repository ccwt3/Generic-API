import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";

import app from "../app.js";
import { prisma } from "../prisma/lib/prisma.js";
import { truncateAll, registerAndGetCookies } from "./helpers.js";
import type { AuthCookies } from "./helpers.js";

beforeEach(truncateAll);
afterAll(() => prisma.$disconnect());

type PostRow = {
  id: string;
  title: string;
  message: string;
  is_published: boolean;
};

// POST /posts no devuelve el post creado, así que se recupera por título
// desde /users/me/posts (el listado del dueño incluye borradores).
async function createPost(
  cookies: AuthCookies,
  title: string,
  message = "Mensaje de prueba con más de diez caracteres.",
): Promise<PostRow> {
  await request(app)
    .post("/posts")
    .set("Cookie", cookies.token)
    .send({ title, message })
    .expect(201);

  const response = await request(app)
    .get("/users/me/posts")
    .set("Cookie", cookies.token)
    .expect(200);

  const post = (response.body.posts as PostRow[]).find(
    (row) => row.title === title,
  );

  expect(post).toBeDefined();
  return post!;
}

async function publishPost(cookies: AuthCookies, postId: string) {
  await request(app)
    .patch(`/posts/${postId}/publish`)
    .set("Cookie", cookies.token)
    .send({ is_published: true })
    .expect(200);
}

describe("GET /posts (listado público)", () => {
  it("devuelve 200 con lista vacía sin datos", async () => {
    const response = await request(app).get("/posts").expect(200);
    expect(response.body.posts).toEqual([]);
  });

  it("muestra solo los publicados, más reciente primero", async () => {
    const cookies = await registerAndGetCookies("posts.author");

    const first = await createPost(cookies, "Primer publicado");
    await createPost(cookies, "Borrador oculto");
    const last = await createPost(cookies, "Segundo publicado");
    await publishPost(cookies, first.id);
    await publishPost(cookies, last.id);

    const response = await request(app).get("/posts").expect(200);
    const titles = (response.body.posts as PostRow[]).map((row) => row.title);

    expect(titles).toEqual(["Segundo publicado", "Primer publicado"]);
  });
});

describe("GET /posts/:id", () => {
  it("un post publicado es visible para anónimos", async () => {
    const cookies = await registerAndGetCookies("posts.author");
    const post = await createPost(cookies, "Post publicado");
    await publishPost(cookies, post.id);

    const response = await request(app).get(`/posts/${post.id}`).expect(200);
    expect(response.body.post.title).toBe("Post publicado");
  });

  it("un borrador es 404 para anónimos", async () => {
    const cookies = await registerAndGetCookies("posts.author");
    const draft = await createPost(cookies, "Borrador privado");

    await request(app).get(`/posts/${draft.id}`).expect(404);
  });

  it("un borrador es 404 para otro usuario autenticado", async () => {
    const author = await registerAndGetCookies("posts.author");
    const stranger = await registerAndGetCookies("posts.stranger");
    const draft = await createPost(author, "Borrador privado");

    await request(app)
      .get(`/posts/${draft.id}`)
      .set("Cookie", stranger.token)
      .expect(404);
  });

  it("un borrador es visible para su autor", async () => {
    const cookies = await registerAndGetCookies("posts.author");
    const draft = await createPost(cookies, "Borrador propio");

    const response = await request(app)
      .get(`/posts/${draft.id}`)
      .set("Cookie", cookies.token)
      .expect(200);

    expect(response.body.post.is_published).toBe(false);
  });

  it("un id que no es UUID v4 responde 400", async () => {
    await request(app).get("/posts/no-es-un-uuid").expect(400);
  });
});

describe("POST /posts", () => {
  it("crea el post como borrador", async () => {
    const cookies = await registerAndGetCookies("posts.author");

    const post = await createPost(cookies, "Nace como borrador");
    expect(post.is_published).toBe(false);
  });

  it("sin token responde 400", async () => {
    await request(app)
      .post("/posts")
      .send({ title: "Sin sesión", message: "No debería poder crearse." })
      .expect(400);
  });

  it("valida title y message con 400 { errors }", async () => {
    const cookies = await registerAndGetCookies("posts.author");

    const response = await request(app)
      .post("/posts")
      .set("Cookie", cookies.token)
      .send({ title: "abc", message: "corto" })
      .expect(400);

    expect(response.body.errors).toHaveProperty("title");
    expect(response.body.errors).toHaveProperty("message");
  });
});

describe("PATCH /posts/:id", () => {
  it("edita el message de un post propio", async () => {
    const cookies = await registerAndGetCookies("posts.author");
    const post = await createPost(cookies, "Post editable");

    await request(app)
      .patch(`/posts/${post.id}`)
      .set("Cookie", cookies.token)
      .send({ message: "Mensaje editado con la longitud suficiente." })
      .expect(200);

    const response = await request(app)
      .get(`/posts/${post.id}`)
      .set("Cookie", cookies.token)
      .expect(200);

    expect(response.body.post.message).toBe(
      "Mensaje editado con la longitud suficiente.",
    );
  });

  it("un post ajeno responde 404 (ownership)", async () => {
    const author = await registerAndGetCookies("posts.author");
    const stranger = await registerAndGetCookies("posts.stranger");
    const post = await createPost(author, "Post ajeno");

    await request(app)
      .patch(`/posts/${post.id}`)
      .set("Cookie", stranger.token)
      .send({ message: "Intento de edición de un tercero." })
      .expect(404);
  });

  it("valida el message con 400 { errors }", async () => {
    const cookies = await registerAndGetCookies("posts.author");
    const post = await createPost(cookies, "Post editable");

    const response = await request(app)
      .patch(`/posts/${post.id}`)
      .set("Cookie", cookies.token)
      .send({ message: "corto" })
      .expect(400);

    expect(response.body.errors).toHaveProperty("message");
  });
});

describe("PATCH /posts/:id/publish", () => {
  it("publica y despublica un post propio", async () => {
    const cookies = await registerAndGetCookies("posts.author");
    const post = await createPost(cookies, "Post a publicar");

    await publishPost(cookies, post.id);
    let list = await request(app).get("/posts").expect(200);
    expect((list.body.posts as PostRow[]).map((row) => row.id)).toContain(
      post.id,
    );

    await request(app)
      .patch(`/posts/${post.id}/publish`)
      .set("Cookie", cookies.token)
      .send({ is_published: false })
      .expect(200);

    list = await request(app).get("/posts").expect(200);
    expect(list.body.posts).toEqual([]);
  });

  it("rechaza valores no booleanos estrictos con 400", async () => {
    const cookies = await registerAndGetCookies("posts.author");
    const post = await createPost(cookies, "Post a publicar");

    const response = await request(app)
      .patch(`/posts/${post.id}/publish`)
      .set("Cookie", cookies.token)
      .send({ is_published: "yes" })
      .expect(400);

    expect(response.body.errors).toHaveProperty("is_published");
  });

  it("un post ajeno responde 404 (ownership)", async () => {
    const author = await registerAndGetCookies("posts.author");
    const stranger = await registerAndGetCookies("posts.stranger");
    const post = await createPost(author, "Post ajeno");

    await request(app)
      .patch(`/posts/${post.id}/publish`)
      .set("Cookie", stranger.token)
      .send({ is_published: true })
      .expect(404);
  });
});

describe("DELETE /posts/:id", () => {
  it("borra un post propio", async () => {
    const cookies = await registerAndGetCookies("posts.author");
    const post = await createPost(cookies, "Post a borrar");

    await request(app)
      .delete(`/posts/${post.id}`)
      .set("Cookie", cookies.token)
      .expect(200);

    await request(app)
      .get(`/posts/${post.id}`)
      .set("Cookie", cookies.token)
      .expect(404);
  });

  it("un post ajeno responde 404 y sobrevive", async () => {
    const author = await registerAndGetCookies("posts.author");
    const stranger = await registerAndGetCookies("posts.stranger");
    const post = await createPost(author, "Post protegido");

    await request(app)
      .delete(`/posts/${post.id}`)
      .set("Cookie", stranger.token)
      .expect(404);

    await request(app)
      .get(`/posts/${post.id}`)
      .set("Cookie", author.token)
      .expect(200);
  });
});
