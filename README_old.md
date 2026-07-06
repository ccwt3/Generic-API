# Generic-API

Backend REST de un blog auto-gestionado, donde un autor puede publicar entradas
(publicadas o en borrador) y los lectores pueden consultar las públicas.

Construido con **Node.js + Express 5**, **Prisma 7** sobre **PostgreSQL**, y un
sistema de **autenticación por sesiones con JWT** (access token + refresh token
con rotación y detección de reutilización).

> **Sobre este documento.** Esta es la documentación viva del backend: refleja lo
> que la API hace hoy. El diseño original completo del producto (frontends,
> comentarios, dashboard, etc.) se conserva al final en
> [Roadmap / plan original](#roadmap--plan-original). Los cambios de rama por
> sesión se registran aparte en [`Branch_changes.md`](Branch_changes.md) (registro
> histórico de la rama `sessions`; puede no reflejar el código actual).

---

## Índice

- [Stack](#stack)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Requisitos y puesta en marcha](#requisitos-y-puesta-en-marcha)
- [Arquitectura](#arquitectura)
- [Autenticación y sesiones](#autenticación-y-sesiones)
- [Referencia de la API](#referencia-de-la-api)
- [Modelos de datos](#modelos-de-datos)
- [Validaciones](#validaciones)
- [Estado de implementación y deuda técnica](#estado-de-implementación-y-deuda-técnica)
- [Roadmap / plan original](#roadmap--plan-original)

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
| CORS          | `cors`                                                 |
| Gestor pkgs   | `pnpm`                                                 |

---

## Estructura del proyecto

```
.
├── app.ts                     # Punto de entrada: middlewares globales + montaje de routers
├── config/
│   └── corsOptions.ts         # Configuración de CORS
├── routes/                    # Definición de rutas y orden de middlewares
│   ├── authRouter.ts          # /auth/*
│   ├── postsRouter.ts         # /posts/*
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
│   ├── chekToken.ts           # Middleware de autenticación (access token)
│   ├── jwtFunctions.ts        # Firma/verificación/rotación de tokens
│   ├── sanitizerCheck.ts      # Corta la cadena si express-validator encontró errores
│   └── validation/            # Cadenas de validación por endpoint
│       ├── authValidatorChain.ts
│       ├── postValidatorChain.ts
│       └── postUpdateValidatorChain.ts
├── prisma/
│   ├── schema.prisma          # Modelos: User, Post, Comment, Tokens
│   ├── lib/prisma.ts          # Cliente Prisma (valida DATABASE_URL al iniciar)
│   ├── migrations/            # Migraciones SQL
│   └── generated/prisma/      # Cliente Prisma generado (no editar a mano)
├── prisma.config.ts           # Configuración de Prisma (datasource / migraciones)
├── express.d.ts               # Augment de Express.Request con `user`
└── tsconfig.json
```

**Capas y dependencia (una sola dirección):**

```
routes → (middlewares: validación / auth) → controllers → models → prisma
```

---

## Requisitos y puesta en marcha

### Variables de entorno

La app **no arranca** si faltan las variables críticas (se validan al inicio en
`prisma/lib/prisma.ts` y `services/jwtFunctions.ts`).

| Variable          | Obligatoria | Uso                                                                    |
| ----------------- | ----------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`    | Sí          | Cadena de conexión a PostgreSQL (usada por el adaptador `pg`).         |
| `JWT_KEY`         | Sí          | Secreto para firmar/verificar **access tokens**.                       |
| `JWT_KEY_REFRESH` | Sí          | Secreto para firmar/verificar **refresh tokens**.                      |
| `COOKIE_KEY`      | Sí          | Secreto de `cookie-parser` para firmar cookies (`signed: true`).       |
| `ENVIRONMENT`     | No          | Si vale `"production"`, las cookies se emiten con `secure: true`.      |

> Nota: el proyecto usa `ENVIRONMENT` (no el habitual `NODE_ENV`) para decidir el
> flag `secure` de las cookies.

### Instalación y ejecución

```bash
pnpm install
pnpm prisma migrate deploy   # aplica las migraciones a la base de datos
pnpm dev                     # levanta el servidor en http://localhost:3000
```

El servidor escucha en el puerto **3000** (fijo en `app.ts`).

---

## Arquitectura

- **`app.ts`** registra los middlewares globales en este orden: `express.json`,
  `express.urlencoded`, `cookie-parser` (con `COOKIE_KEY`), `cors`, y luego los
  tres routers. Cierra con un manejador de errores que responde `500`.
- **Routers** declaran el orden explícito de middlewares por endpoint. En rutas
  protegidas, **primero se autentica y luego se validan los bodies** (así no se
  valida el input de una petición no autenticada).
- **Controllers** no tocan Prisma directamente: leen el request, llaman al modelo
  y traducen el `status` numérico del modelo a una respuesta HTTP con JSON.
- **Models** encapsulan Prisma y devuelven un objeto con forma `{ status, ...data }`.
  Es el contrato interno entre modelo y controller (no es el status HTTP final,
  aunque suele coincidir).

**Convención de respuesta.** Toda respuesta es JSON con al menos `{ message }`.
Las de éxito añaden la carga (`post`, `posts`, `user`). Los errores de validación
devuelven `{ errors }` con el mapa de `express-validator`.

---

## Autenticación y sesiones

El flujo se basa en **dos tokens** entregados como cookies firmadas y `httpOnly`:

| Token          | Cookie         | Firma con        | Vida del JWT | Payload                   |
| -------------- | -------------- | ---------------- | ------------ | ------------------------- |
| Access token   | `token`        | `JWT_KEY`        | **1 min**    | `{ id, role, username }`  |
| Refresh token  | `refreshToken` | `JWT_KEY_REFRESH`| **5 min**    | `{ userId, jti }`         |

**Detalles de las cookies:**

- Todas: `signed`, `httpOnly`, `sameSite: "lax"`, y `secure` solo en `production`.
- `token` se emite con `path: "/"`.
- `refreshToken` se emite **dos veces**, con `path: "/auth/refresh"` y
  `path: "/auth/logout"`, para que el navegador solo lo envíe a esos dos
  endpoints (reduce su superficie de exposición).

**Rotación de refresh tokens (`POST /auth/refresh`):**

1. Se verifica el refresh token recibido.
2. Se marca el token anterior como `USED`, se registra `used_at` y se enlaza con
   su reemplazo (`replaced_by`) — todo dentro de una transacción de Prisma.
3. Se emite un refresh token nuevo y un access token nuevo.

**Detección de reutilización.** Si llega un refresh token que ya está `USED`
(fuera de la ventana de gracia) o que ya no existe en la tabla, se asume robo/replay
y se **borran todos los tokens del usuario** (invalida la sesión). Respuesta `403`.

**Ventana de gracia (5 s).** Para evitar falsos positivos cuando dos peticiones a
`/auth/refresh` corren casi al mismo tiempo (p. ej. varias pestañas), el token
recién rotado se guarda en memoria durante 5 segundos; si el token viejo se
representa dentro de esa ventana, se devuelve el mismo token nuevo en lugar de
disparar la alarma de reutilización.

**Persistencia.** Los refresh tokens se guardan **hasheados (SHA-256)**, nunca en
texto plano. Por eso la ventana de gracia depende de una caché en memoria: la base
no puede reconstruir el token crudo.

**Middleware de acceso (`services/chekToken.ts`):**

- `checkToken`: exige un access token válido; adjunta `req.user` solo tras validar
  la forma del payload. Sin token → `400`; token inválido → `401`.
- `checkTokenForAnon`: si no hay token, deja pasar como anónimo; si hay token, lo
  valida. Se usa en `GET /posts/:id` para que un anónimo pueda ver posts públicos.

---

## Referencia de la API

Base URL local: `http://localhost:3000`

| Método   | Ruta              | Auth              | Body                    | Éxito | Descripción                              |
| -------- | ----------------- | ----------------- | ----------------------- | ----- | ---------------------------------------- |
| `POST`   | `/auth/register`  | —                 | `{ username, password }`| `201` | Crea usuario y abre sesión (cookies).    |
| `POST`   | `/auth/login`     | —                 | `{ username, password }`| `200` | Valida credenciales y abre sesión.       |
| `POST`   | `/auth/refresh`   | cookie `refreshToken` | —                   | `200` | Rota refresh token y renueva access.     |
| `POST`   | `/auth/logout`    | cookie `refreshToken` | —                   | `200` | Cierra sesión y limpia cookies.          |
| `GET`    | `/posts`          | access token      | —                       | `200` | **Placeholder** (`"Empty endpoint"`).    |
| `GET`    | `/posts/:id`      | opcional (anon)   | —                       | `200` | Devuelve un post; los no públicos solo para su autor. |
| `POST`   | `/posts`          | access token      | `{ title, message }`    | `201` | Crea un post (en borrador por defecto).  |
| `PATCH`  | `/posts/:id`      | access token      | `{ message }`           | `200` | Edita el `message` de un post propio.    |
| `DELETE` | `/posts/:id`      | access token      | —                       | `200` | Borra un post propio.                    |
| `GET`    | `/users/me`       | access token      | —                       | `200` | Datos del usuario autenticado (del token).|
| `GET`    | `/users/me/posts` | access token      | —                       | `200` | Todos los posts del usuario (desc. por fecha). |

**Códigos de error comunes:** `400` (falta info / UUID inválido / errores de
validación en `errors`), `401` (credenciales o token inválidos), `403` (refresh
token reutilizado), `404` (post no encontrado o borrador ajeno), `409` (username
ya en uso), `500` (error interno).

### Notas por endpoint

- **`POST /posts`** crea el post con `is_published = false` (borrador). No existe
  aún un endpoint para cambiar el estado de publicación (ver deuda técnica).
- **`PATCH /posts/:id`** solo actualiza `message`; `title` no es editable todavía.
- **`GET /posts/:id`** valida que `:id` sea un UUID v4 (con `zod`) antes de consultar.
- **`GET /users/me`** devuelve el contenido del access token, no relee la base; el
  `role` podría estar desactualizado hasta la siguiente renovación del token.

---

## Modelos de datos

Definidos en [`prisma/schema.prisma`](prisma/schema.prisma).

**User** — `id` (uuid), `username` (único), `password` (hash bcrypt), `role`
(`USER` | `AUTHOR` | `ADMIN`, default `USER`), relaciones a `posts` y `comments`.

**Post** — `id` (uuid), `author_id` → `User`, `title`, `message`, `published_time`
(default `now()`), `image_url` (opcional), `is_published` (default `false`),
relación a `comments`.

**Comment** — `id` (uuid), `post_id` → `Post`, `author_id` → `User`, `message`.
> Modelado en la base pero **sin rutas ni controllers todavía**.

**Tokens** — persistencia de refresh tokens hasheados:

- `id`, `user_id`, `token` (hash SHA-256, único).
- `status` (`ACTIVE` | `USED`, default `ACTIVE`).
- `used_at` (cuándo se rotó).
- `replaced_by` (único) + self-relation `TokenChain` (`parent`/`children`) para
  encadenar el token con su reemplazo.
- Índice compuesto `@@index([user_id, status])`.

---

## Validaciones

**`authValidatorChain`** (login/register):

- `username`: requerido, `trim`, minúsculas con `.` y `_` permitidos
  (`/^[a-z]+([._][a-z]+)*$/`), longitud 3–15.
- `password`: requerido, mínimo **5** caracteres.

**`postValidatorChain`** (crear post):

- `title`: requerido, longitud 5–100.
- `message`: requerido, `trim`, longitud 10–1000.

**`postUpdateValidatorChain`** (editar post):

- `message`: requerido, `trim`, longitud 10–1000.

Si alguna cadena falla, `sanitizerCheck` corta el flujo y responde `400` con
`{ errors: <mapa de express-validator> }`.

---

## Estado de implementación y deuda técnica

Lo que **sí** funciona hoy: registro, login, logout, rotación segura de refresh
tokens con detección de reutilización, CRUD de posts propios y lectura de posts
públicos por anónimos.

Pendientes y hallazgos detectados durante la auditoría (aún **no corregidos**):

| # | Severidad | Punto                                  | Detalle                                                                                                                                  |
| - | --------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Alta      | CORS sin `PATCH`                       | `config/corsOptions.ts` permite `["POST","GET","PUT","DELETE"]` pero la API usa `PATCH /posts/:id`. El preflight del navegador lo bloquea. (`PUT` está permitido pero no se usa.) |
| 2 | Media     | Cookie vs JWT del refresh desincronizados | El JWT de refresh expira en **5 min**, pero la cookie `refreshToken` tiene `maxAge` de **1 h**. La cookie sobrevive al token que contiene. |
| 3 | Media     | Ventana de gracia en memoria           | El token rotado se cachea en memoria 5 s. Si el proceso se reinicia o corre en varias instancias, se pierde y `/auth/refresh` puede fallar con `409`. |
| 4 | Baja      | Script `dev`                           | `package.json` usa `pnpm dlx tsx app.js`: el entry es `app.ts` (no `app.js`) y `dlx` redescarga `tsx` (ya es devDependency). Conviene `pnpm exec tsx app.ts`. |
| 5 | Baja      | `GET /posts`                           | Es un placeholder (`"Empty endpoint"`); falta el listado real de posts públicos. |
| 6 | Baja      | Endpoints planeados sin implementar    | Comentarios, `/users/:id`, cambio de `is_published`, e imágenes (Supabase) siguen en el roadmap, no en el código. |
| 7 | Baja      | Duplicación de constante               | `REFRESH_TOKEN_GRACE_PERIOD_MS` está definido en `jwtFunctions.ts` y en `tokensModel.ts`; pueden divergir. |
| 8 | Baja      | Endurecimiento básico                  | No hay rate limiting ni cabeceras de seguridad (p. ej. `helmet`). El manejador de errores en `app.ts` tipa `err` como `ErrorRequestHandler` (debería ser `unknown`/`Error`). |

---

## Roadmap / plan original

> Esta sección conserva el diseño original del producto completo (backend + dos
> frontends). Sirve como referencia de hacia dónde va el proyecto; **no** describe
> el estado actual del código.

### Distribución

El proyecto se pensó para tres sitios:

- Backend (esta API)
- Frontend público (home)
- Frontend de dashboard

### Rutas previstas

```
// AUTH
/auth/login
/auth/register

// POSTS
/posts
/posts/:post_id
/posts/:post_id/comments
/posts/:post_id/comments/:comment_id

// USERS
/users/:id
/users/:id/posts

// Sitio distinto (dashboard)
/users/me
/users/me/posts
/users/me/comments
```

### Features previstas

- Posts con autor, timestamp, título, cuerpo e imágenes.
- Comentarios (autor, cuerpo, timestamp) e interacciones.
- CRUD de posts y comentarios por sus autores.
- Posts publicados y no publicados.

### Dashboard

- Lista de todos mis posts (con indicador de estado de publicación).
- Botón para cambiar el estado de publicación.
- Botón "Nuevo post" con formulario.
- Gestión de comentarios (borrarlos).

### Tecnologías previstas

**Backend:** TypeScript, Express, express-validator, bcryptjs, dotenv, Prisma,
jsonwebtoken, CORS, Supabase (imágenes).

**Frontend:** Vite, React, TinyMCE.
