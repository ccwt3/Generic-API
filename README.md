# API Template

Template de **API REST en Node.js** con autenticación por sesiones (JWT con
rotación de refresh tokens), pensado para clonarse como punto de partida de
cualquier proyecto que necesite una API casera.

Nació de una blog API, y conserva a propósito su estructura y su recurso
principal: **`posts` se queda como recurso de referencia** — un ejemplo completo
y funcional del patrón `router → controller → model → prisma` que este template
usa para todo. Para crear un recurso nuevo se clona ese patrón (ver
[la guía](#guía-cómo-agregar-un-recurso-nuevo)).

> **Sobre este documento.** Es la documentación viva del template. El README.md
> original documenta la blog API de la que nace este proyecto y se conserva como
> referencia histórica (README_old.md).

---

## Índice

- [Stack](#stack)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Puesta en marcha](#puesta-en-marcha)
- [Arquitectura y flujo de una request](#arquitectura-y-flujo-de-una-request)
- [Capas y conexiones](#capas-y-conexiones)
- [Convenciones](#convenciones)
- [Autenticación y sesiones](#autenticación-y-sesiones)
- [Referencia de la API](#referencia-de-la-api)
- [Modelos de datos](#modelos-de-datos)
- [Validaciones](#validaciones)
- [Testing](#testing)
- [Guía: cómo agregar un recurso nuevo](#guía-cómo-agregar-un-recurso-nuevo)
- [Puntos de extensión y limitaciones conocidas](#puntos-de-extensión-y-limitaciones-conocidas)

---

## Stack

| Área          | Tecnología                                             |
| ------------- | ------------------------------------------------------ |
| Runtime       | Node.js (ESM, `"type": "module"`, resolución `Node16`) |
| Lenguaje      | TypeScript 5.9 (ejecutado con `tsx`)                   |
| Framework     | Express 5                                              |
| ORM           | Prisma 7 + `@prisma/adapter-pg`                        |
| Base de datos | PostgreSQL                                             |
| Auth          | `jsonwebtoken` (JWT) + `bcryptjs` + `cookie-parser`    |
| Validación    | `express-validator` (bodies) + `zod` (UUIDs)           |
| Seguridad     | `helmet` (cabeceras) + `express-rate-limit` (en /auth) |
| CORS          | `cors`                                                 |
| Testing       | Vitest + Supertest + Testcontainers (PostgreSQL efímero) |
| Gestor pkgs   | `pnpm`                                                 |

---

## Estructura del proyecto

```
.
├── server.ts                  # Punto de entrada: importa el app y hace el listen
├── app.ts                     # App de Express: middlewares globales + montaje de routers (exportado sin listen para los tests)
├── config/
│   ├── env.ts                 # ÚNICA fuente de configuración: valida env al arrancar
│   └── corsOptions.ts         # Configuración de CORS
├── routes/                    # Definición de rutas y orden de middlewares
│   ├── authRouter.ts          # /auth/*
│   ├── postsRouter.ts         # /posts/*   (recurso de referencia)
│   └── usersRouter.ts         # /users/*
├── controllers/               # Orquestación HTTP (leer request → llamar modelo → responder)
│   ├── authController.ts
│   ├── postsController.ts
│   └── userController.ts
├── models/                    # Acceso a datos (Prisma) y reglas de negocio
│   ├── UsersModel.ts
│   ├── PostsModel.ts
│   └── tokensModel.ts         # Persistencia y rotación de refresh tokens
├── services/                  # Middlewares y lógica transversal
│   ├── checkToken.ts          # Middleware de autenticación (access token)
│   ├── jwtFunctions.ts        # Firma/verificación/rotación de tokens
│   ├── sanitizerCheck.ts      # Corta la cadena si express-validator encontró errores
│   └── validation/            # Cadenas de validación por endpoint
│       ├── authValidatorChain.ts
│       ├── postValidatorChain.ts
│       ├── postUpdateValidatorChain.ts
│       └── publishValidatorChain.ts
├── prisma/
│   ├── schema.prisma          # Modelos: User, Post, Tokens
│   ├── lib/prisma.ts          # Cliente Prisma (usa DATABASE_URL de config/env.ts)
│   ├── migrations/            # Migraciones SQL
│   └── generated/prisma/      # Cliente Prisma generado (no editar a mano)
├── tests/                     # Suite de integración (ver sección Testing)
│   ├── globalSetup.ts         # Contenedor PostgreSQL efímero + migraciones + env de test
│   ├── helpers.ts             # truncateAll, registro de usuarios, parseo de cookies
│   ├── auth.test.ts
│   ├── posts.test.ts
│   └── users.test.ts
├── vitest.config.ts           # Config de Vitest (archivos en serie, timeouts de contenedor)
├── prisma.config.ts           # Configuración del CLI de Prisma
├── express.d.ts               # Augment de Express.Request con `user`
├── .env.example               # Plantilla de variables de entorno
├── pnpm-workspace.yaml        # allowBuilds: scripts de build aprobados (prisma, esbuild)
└── tsconfig.json
```

---

## Puesta en marcha

### Variables de entorno

Toda la configuración vive en **`config/env.ts`**, la única fuente de verdad:
valida las variables críticas **al arrancar** (si falta una, la app no inicia)
y da defaults a las opcionales. Ningún otro archivo lee `process.env`.

| Variable              | Obligatoria | Default                 | Uso                                                        |
| --------------------- | ----------- | ----------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`        | Sí          | —                       | Conexión a PostgreSQL (adaptador `pg`).                    |
| `JWT_KEY`             | Sí          | —                       | Secreto de los **access tokens**.                          |
| `JWT_KEY_REFRESH`     | Sí          | —                       | Secreto de los **refresh tokens**.                         |
| `COOKIE_KEY`          | Sí          | —                       | Secreto de `cookie-parser` (cookies firmadas).             |
| `PORT`                | No          | `3000`                  | Puerto del servidor.                                       |
| `CORS_ORIGIN`         | No          | `http://localhost:5173` | Origen permitido por CORS.                                 |
| `ENVIRONMENT`         | No          | —                       | Si vale `"production"`, cookies con `secure: true`.        |
| `ACCESS_TOKEN_TTL_S`  | No          | `900` (15 min)          | Vida del access token, en segundos.                        |
| `REFRESH_TOKEN_TTL_S` | No          | `604800` (7 días)       | Vida del refresh token, en segundos.                       |

> El `maxAge` de las cookies **se deriva** de los TTL (`ttl * 1000`): cookie y
> JWT no pueden divergir.

### Instalación y ejecución

```bash
cp .env.example .env         # y rellena los valores
pnpm install
pnpm prisma migrate deploy   # aplica las migraciones a la base de datos
pnpm dev                     # tsx watch server.ts → http://localhost:3000
pnpm test                    # suite de integración (requiere Docker corriendo)
```

---

## Arquitectura y flujo de una request

Traza completa de una petición autenticada, p. ej. `PATCH /posts/:id`:

```
Request
  │
  ▼
app.ts — middlewares globales, en orden:
  helmet → express.json → express.urlencoded → cookie-parser(COOKIE_KEY) → cors
  (las rutas /auth pasan además por el rate limiter: 100 req / 15 min por IP)
  │
  ▼
routes/postsRouter.ts — cadena explícita del endpoint:
  checkToken → postUpdateValidatorChain → sanitizerCheck → controller
  │     │              │                       │
  │     │              │                       └─ si hubo errores de validación → 400 { errors }
  │     │              └─ reglas de express-validator sobre el body
  │     └─ verifica el access token (cookie firmada) y adjunta req.user
  ▼
controllers/postsController.ts
  lee params/body → valida el UUID con zod → llama al modelo
  │
  ▼
models/PostsModel.ts
  encapsula Prisma → devuelve { status, ...data }   ← contrato interno
  │
  ▼
controller traduce ese status a HTTP y responde { message, ...carga }
  │
  ▼
(cualquier excepción no manejada cae al error handler de app.ts → 500)
```

**El contrato interno `{ status, ...data }`.** Los modelos nunca tocan `res`:
devuelven un objeto con un `status` numérico (que suele coincidir con el HTTP
final, pero es un contrato interno) más los datos. El controller es el único
que traduce eso a una respuesta HTTP. Esto mantiene los modelos testeables y a
los controllers sin SQL.

---

## Capas y conexiones

**Regla de oro: la dependencia fluye en una sola dirección.**

```
routes → (middlewares: auth / validación) → controllers → models → prisma
```

| Capa | Responsabilidad | Importa a | Nunca hace |
| --- | --- | --- | --- |
| `app.ts` | Middlewares globales y montaje de routers | routers, config | Lógica de negocio |
| `routes/` | Declarar endpoints y el **orden** de su cadena de middlewares | controllers, services | Tocar request/response |
| `controllers/` | Leer el request, invocar al modelo, traducir `status` → HTTP | models | Tocar Prisma directamente |
| `models/` | Acceso a datos y reglas de negocio; contrato `{ status, ...data }` | prisma | Tocar `req`/`res` |
| `services/` | Middlewares y lógica transversal (auth, JWT, validación) | models, config | Montar rutas |
| `config/` | Env validada y opciones compartidas | — (hoja) | Importar capas superiores |

`config/env.ts` es una hoja del grafo: cualquier capa puede importarla, ella no
importa a nadie. `services/jwtFunctions.ts` es el único servicio que llama a
modelos (`tokensModel`, `UsersModel`) porque la rotación de tokens es lógica
transversal que necesita persistencia.

---

## Convenciones

- **Respuestas**: toda respuesta es JSON con al menos `{ message }`. Las de
  éxito añaden la carga con nombre del recurso (`post`, `posts`, `user`). Los
  errores de validación devuelven `{ errors }` (mapa de express-validator).
- **Auth antes de validar**: en rutas protegidas, `checkToken` va **antes** de
  las cadenas de validación — no se gasta trabajo validando el input de una
  petición no autenticada.
- **Modelos con try/catch**: cada función de modelo captura sus errores, los
  loguea con `console.error` y devuelve `{ status: 500 }`. Los controllers no
  necesitan try/catch.
- **Un validador por caso de uso**: cada endpoint con body tiene su propia
  cadena en `services/validation/` (crear ≠ editar ≠ publicar), seguida siempre
  de `sanitizerCheck`.
- **UUIDs con zod**: los `:id` de ruta se validan con `uuIdSchema` (UUID v4) en
  el controller antes de consultar la base.
- **ESM estricto**: imports relativos con extensión `.js` (resolución `Node16`),
  aunque el archivo fuente sea `.ts`.
- **Nombres**: routers `<recurso>Router.ts`, controllers `<recurso>Controller.ts`,
  modelos `<Recurso>Model.ts`, validadores `<caso>ValidatorChain.ts`. Campos de
  base de datos en `snake_case`, código en `camelCase`.
- **Export default de objeto**: controllers y modelos exportan un objeto con sus
  funciones (`export default { fn1, fn2 }`) declaradas después con hoisting.

---

## Autenticación y sesiones

El flujo se basa en **dos tokens** entregados como cookies firmadas y `httpOnly`:

| Token          | Cookie         | Firma con         | Vida (default)   | Payload                  |
| -------------- | -------------- | ----------------- | ---------------- | ------------------------ |
| Access token   | `token`        | `JWT_KEY`         | 15 min (env)     | `{ id, role, username }` |
| Refresh token  | `refreshToken` | `JWT_KEY_REFRESH` | 7 días (env)     | `{ userId, jti }`        |

**Cookies:** todas `signed`, `httpOnly`, `sameSite: "lax"`, `secure` solo en
producción. `token` con `path: "/"`; `refreshToken` se emite **dos veces**, con
`path: "/auth/refresh"` y `path: "/auth/logout"`, para que el navegador solo lo
envíe a esos dos endpoints. El `maxAge` se deriva del TTL del JWT correspondiente.

**Rotación (`POST /auth/refresh`):** se verifica el refresh token; en una
transacción de Prisma el token viejo pasa a `USED` (con `used_at` y
`replaced_by` apuntando al nuevo); se emiten refresh y access nuevos.

**Detección de reutilización:** si llega un refresh token `USED` (fuera de la
ventana de gracia) o inexistente, se asume robo/replay: se **borran todos los
tokens del usuario** (mata la sesión) y se responde `403`.

**Ventana de gracia (5 s):** para no disparar la alarma con dos `refresh` casi
simultáneos (varias pestañas), el token recién emitido se cachea en memoria 5 s;
si el viejo se re-presenta dentro de esa ventana, se devuelve el mismo token
nuevo. Como la base guarda **hashes SHA-256** (nunca el token crudo), esta
ventana depende de la caché en memoria → limitación single-instance (ver
[limitaciones](#puntos-de-extensión-y-limitaciones-conocidas)).

**Middlewares de acceso (`services/checkToken.ts`):**

- `checkToken`: exige access token válido; adjunta `req.user` tras validar la
  forma del payload. Sin token → `400`; inválido → `401`.
- `checkTokenForAnon`: sin token deja pasar como anónimo; con token, lo valida.

**Rate limiting:** todo `/auth/*` pasa por `express-rate-limit`
(100 req / 15 min por IP) contra fuerza bruta en login/register/refresh.

---

## Referencia de la API

Base URL local: `http://localhost:3000`

| Método   | Ruta                      | Auth                  | Body                     | Éxito | Descripción                                          |
| -------- | ------------------------- | --------------------- | ------------------------ | ----- | ---------------------------------------------------- |
| `POST`   | `/auth/register`          | —                     | `{ username, password }` | `201` | Crea usuario y abre sesión (cookies).                |
| `POST`   | `/auth/login`             | —                     | `{ username, password }` | `200` | Valida credenciales y abre sesión.                   |
| `POST`   | `/auth/refresh`           | cookie `refreshToken` | —                        | `200` | Rota refresh token y renueva access.                 |
| `POST`   | `/auth/logout`            | cookie `refreshToken` | —                        | `200` | Cierra sesión y limpia cookies.                      |
| `GET`    | `/posts`                  | — (público)           | —                        | `200` | Lista posts publicados (desc. por fecha).            |
| `GET`    | `/posts/:id`              | opcional (anon)       | —                        | `200` | Un post; los no públicos solo para su autor.         |
| `POST`   | `/posts`                  | access token          | `{ title, message }`     | `201` | Crea un post (borrador por defecto).                 |
| `PATCH`  | `/posts/:id`              | access token          | `{ message }`            | `200` | Edita el `message` de un post propio.                |
| `PATCH`  | `/posts/:id/publish`      | access token          | `{ is_published }`       | `200` | Publica/despublica un post propio (boolean).         |
| `DELETE` | `/posts/:id`              | access token          | —                        | `200` | Borra un post propio.                                |
| `GET`    | `/users/me`               | access token          | —                        | `200` | Datos del usuario autenticado (del token).           |
| `GET`    | `/users/me/posts`         | access token          | —                        | `200` | Todos los posts del usuario (desc. por fecha).       |

**Códigos de error comunes:** `400` (falta info / UUID inválido / `{ errors }`
de validación), `401` (credenciales o token inválidos), `403` (refresh token
reutilizado), `404` (recurso no encontrado o borrador ajeno), `409` (username en
uso), `429` (rate limit en `/auth`), `500` (error interno).

**Notas:**

- `GET /users/me` devuelve el contenido del access token, no relee la base; el
  `role` puede quedar desactualizado hasta la siguiente renovación.
- `PATCH /posts/:id` solo edita `message`; `title` no es editable (extensión
  pendiente).

---

## Modelos de datos

Definidos en [`prisma/schema.prisma`](prisma/schema.prisma).

**User** — `id` (uuid), `username` (único), `password` (hash bcrypt, factor 12),
`role` (`USER` | `AUTHOR` | `ADMIN`, default `USER`), relación a `posts`.

**Post** *(recurso de referencia)* — `id` (uuid), `author_id` → `User`, `title`,
`message`, `published_time` (default `now()`), `image_url` (opcional),
`is_published` (default `false`).

**Tokens** — persistencia de refresh tokens **hasheados (SHA-256)**:

- `id`, `user_id`, `token` (hash, único).
- `status` (`ACTIVE` | `USED`, default `ACTIVE`), `used_at`.
- `replaced_by` (único) + self-relation `TokenChain` para encadenar cada token
  con su reemplazo.
- Índice compuesto `@@index([user_id, status])`.

---

## Validaciones

Cadenas de `express-validator` en `services/validation/`, siempre seguidas de
`sanitizerCheck` (corta con `400 { errors }` si algo falló):

**`authValidatorChain`** (login/register):
- `username`: requerido, `trim`, minúsculas con `.` y `_`
  (`/^[a-z]+([._][a-z]+)*$/`), longitud 3–15.
- `password`: requerido, mínimo 5 caracteres.

**`postValidatorChain`** (crear post):
- `title`: requerido, longitud 5–100.
- `message`: requerido, `trim`, longitud 10–1000.

**`postUpdateValidatorChain`** (editar post):
- `message`: requerido, `trim`, longitud 10–1000.

**`publishValidatorChain`** (publicar/despublicar):
- `is_published`: requerido, boolean **estricto** (`true`/`false` reales, no
  `"true"` string).

---

## Testing

Suite de **integración** (38 tests): cada test hace requests HTTP reales con
**Supertest** contra el `app` exportado (sin abrir puerto) y golpea un
**PostgreSQL real y efímero** que **Testcontainers** levanta en Docker por
corrida. No se mockea Prisma: lo que se prueba es el comportamiento observable
de la API, capa por capa.

```bash
pnpm test          # corrida única (requiere Docker Desktop corriendo)
pnpm test:watch    # modo watch
```

**Cómo funciona la infraestructura:**

- `tests/globalSetup.ts` arranca un contenedor `postgres:17`, exporta al env
  `DATABASE_URL` (la URI del contenedor) y secretos dummy, y aplica las
  migraciones reales con `prisma migrate deploy`. Es hermético: no usa tu
  `.env` ni toca tu base de desarrollo.
- `vitest.config.ts` corre los archivos **en serie** (`fileParallelism: false`)
  porque comparten la DB; cada suite hace `beforeEach(truncateAll)`.
- `tests/helpers.ts` centraliza el truncado y el manejo de cookies de sesión
  (Supertest no maneja cookie jar con paths, se reenvían a mano).

**Qué cubre:**

- `auth.test.ts` — lo crítico: register/login/logout, rotación de refresh
  tokens verificada **en la base** (`USED` + `replaced_by`), la **ventana de
  gracia** con dos refresh concurrentes, y la **detección de reutilización**
  (retrocediendo `used_at` en la DB para no dormir 5 s) con invalidación total
  de la sesión.
- `posts.test.ts` — el recurso de referencia: visibilidad de borradores
  (anónimo/tercero/autor), ownership en PATCH/DELETE (404 ajeno), publish con
  boolean estricto, validaciones `400 { errors }`.
- `users.test.ts` — `/me` y `/me/posts`, incluyendo la rama `401` de
  `checkToken` (cookie con firma válida pero contenido que no es JWT).

**Al clonar un recurso nuevo**, clona también su suite: `posts.test.ts` es la
plantilla (arrange con los helpers, actúa por HTTP, aserciones sobre la
respuesta y, cuando importa, sobre la base con el cliente de Prisma).

---

## Guía: cómo agregar un recurso nuevo

La receta del template: clonar el patrón de `posts`. Ejemplo con un recurso
`products`:

**1. Modelo en `prisma/schema.prisma` + migración**

```prisma
model Product {
  id         String   @id @default(uuid())
  owner_id   String
  owner      User     @relation(fields: [owner_id], references: [id])
  name       String
  created_at DateTime @default(now())
}
```

```bash
pnpm prisma migrate dev --name add_products
```

(Recuerda añadir la relación inversa `products Product[]` en `User` si aplica.)

**2. Modelo de datos: `models/ProductsModel.ts`**

Copia la forma de [`models/PostsModel.ts`](models/PostsModel.ts): funciones
sueltas exportadas en un objeto, cada una con try/catch que loguea y devuelve
`{ status: 500 }`, y el contrato `{ status, ...data }` en los éxitos:

```ts
import { prisma } from "../prisma/lib/prisma.js";

export default { createProduct /*, ... */ };

async function createProduct(ownerId: string, name: string) {
  try {
    await prisma.product.create({ data: { owner_id: ownerId, name } });
    return { status: 201 };
  } catch (error) {
    console.error("Error creating product:", error);
    return { status: 500 };
  }
}
```

**3. Validación: `services/validation/productValidatorChain.ts`**

Una cadena por caso de uso (crear ≠ editar), como
[`postValidatorChain.ts`](services/validation/postValidatorChain.ts).

**4. Controller: `controllers/productsController.ts`**

Copia la forma de [`controllers/postsController.ts`](controllers/postsController.ts):
lee el request, valida UUIDs de ruta con zod, llama al modelo y traduce cada
`status` a una respuesta `{ message, ...carga }`.

**5. Router: `routes/productsRouter.ts`**

Declara la cadena de cada endpoint en el orden del template:

```ts
productsRouter.post(
  "/",
  checkToken,              // 1. auth
  productValidatorChain,   // 2. validación del body
  sanitizerCheck,          // 3. corte si hubo errores
  productsController.createProduct, // 4. controller
);
```

**6. Montaje en `app.ts`**

```ts
app.use("/products", productsRouter);
```

**7. Documenta** el recurso en este archivo (tabla de la API, modelos,
validaciones).

Si el recurso no necesita auth (catálogo público), omite `checkToken` como hace
`GET /posts`. Si necesita lectura anónima con extra para dueños, usa
`checkTokenForAnon` como `GET /posts/:id`.

---

## Puntos de extensión y limitaciones conocidas

Decisiones conscientes del template — cosas que **no** trae y dónde engancharlas:

| Tema | Estado / punto de extensión |
| --- | --- |
| Ventana de gracia en memoria | La caché de 5 s de `jwtFunctions.ts` vive en el proceso: con varias instancias o un reinicio a media rotación, un refresh legítimo puede caer en `409`. Para multi-instancia: mover la caché a Redis (o guardar el token crudo cifrado). |
| Rate limit en memoria | `express-rate-limit` usa store en memoria; multi-instancia necesita un store compartido (p. ej. `rate-limit-redis`). |
| Autorización por rol | `Role` (`USER`/`AUTHOR`/`ADMIN`) existe en la base y viaja en el token, pero no hay middleware que lo exija. Punto de extensión: un `checkRole("ADMIN")` en `services/` que lea `req.user.role`. |
| CI | Los tests corren localmente (`pnpm test`); no hay pipeline. Extensión: GitHub Actions con Docker disponible en el runner (Testcontainers funciona tal cual en `ubuntu-latest`). |
| Paginación | Los listados devuelven todo. Extensión: `take`/`skip` de Prisma leídos de query params en el modelo. |
| `title` no editable | `PATCH /posts/:id` solo edita `message` — decisión heredada del blog; amplía `postUpdateValidatorChain` y el modelo si lo necesitas. |
| Imágenes | `image_url` existe en `Post` pero no hay flujo de subida (el plan original usaba Supabase). |
| `GET /users/me` | Responde con el payload del token, sin releer la base (el `role` puede quedar viejo hasta el próximo refresh). |
| Logout global | `deleteToken` borra solo el token presentado; "cerrar sesión en todos los dispositivos" sería un `deleteMany` por `user_id`. |
