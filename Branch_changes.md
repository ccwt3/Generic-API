// CODIGO GENERADO POR CODEX

# Cambios de la rama `sessions`

> **Nota (registro histórico).** Este archivo documenta la rama `sessions` de la
> API original y **no refleja el estado actual del código** (rama `refactor`).
> Puede contradecir al README/código vigente — p. ej. aquí se dice que el refresh
> token expira en "1 hora", cuando hoy el JWT de refresh expira en **5 min** (la
> cookie sí dura 1 h; ver deuda técnica #2 en el README). Se conserva como
> registro; para el estado vigente ver [`README.md`](README.md).

Esta documentacion resume los cambios observados en la rama `sessions` comparada contra `main`, incluyendo los cambios sin commit presentes en el working tree.

## Resumen

La rama introduce una reestructura del flujo de autenticacion basada en sesiones con JWT, agregando rotacion de refresh tokens, persistencia de tokens en base de datos y deteccion basica de reutilizacion de refresh tokens. Tambien ajusta los imports del proyecto para funcionar con resolucion ESM de Node (`Node16`).

## Autenticacion y sesiones

- `authLogin` ahora usa `userModel.loginUser` y genera dos tokens:
  - Access token firmado con los datos del usuario (`id`, `role`, `username`).
  - Refresh token firmado solo con el `id` del usuario.
- `authRegister` ahora usa `userModel.registerUser` y reutiliza el mismo flujo de generacion de tokens que el login.
- Se agrego `cookieNormalizer` para centralizar la escritura de cookies de autenticacion.
- La cookie `token`:
  - Es `signed`, `httpOnly`, `sameSite: "lax"`.
  - Usa `secure` solo en `production`.
  - Tiene `path: "/"`.
  - Expira en 1 minuto.
- La cookie `refreshToken`:
  - Se escribe dos veces con el mismo valor para cubrir `/auth/refresh` y `/auth/logout`.
  - Expira en 1 hora.
- `authRefresh` ahora rota el refresh token:
  - Valida el refresh token recibido.
  - Marca el token anterior como `USED`.
  - Crea un nuevo refresh token.
  - Crea un nuevo access token a partir del refresh token nuevo.
  - Permite reutilizar el refresh token anterior durante una ventana de gracia de 5 segundos.
  - Si el token anterior llega dentro de esa ventana, responde con el refresh token que ya habia sido generado.
  - Limpia cookies si la rotacion falla.
- `authLogout` ahora delega el cierre de sesion en `jwtFC.jwtLogout`, limpia las cookies y responde con el estado devuelto por el servicio.

## JWT y rotacion de refresh tokens

El modulo `services/jwtFunctions.ts` fue reorganizado para exponer un flujo mas orientado a sesiones:

- `jwtSignAccess(payload)` firma access tokens con expiracion de 1 minuto.
- `jwtSignRefresh({ id })` firma refresh tokens con expiracion de 1 hora y los guarda en base de datos.
- `jwtVerifyAccess(token)` valida access tokens.
- `createAccessToken(refreshToken)` crea un nuevo access token usando el usuario contenido en el refresh token.
- `rotateRefreshToken(refreshToken)` reemplaza un refresh token por uno nuevo.
- `jwtLogout(refreshToken)` elimina el refresh token activo durante el logout.

El comportamiento de seguridad mas importante es que, si se intenta usar un refresh token marcado como `USED` despues de su periodo de gracia, o un refresh token que ya no existe en la tabla de tokens, el sistema devuelve un estado de token reutilizado y elimina los tokens asociados al usuario.

Para evitar falsos positivos en requests casi simultaneas a `/auth/refresh`, se agrego una ventana de gracia de 5 segundos. Durante esa ventana, el refresh token anterior sigue siendo aceptado y se devuelve el mismo refresh token nuevo generado por la primera request. Como la base de datos guarda hashes y no puede reconstruir el token crudo, el token nuevo se conserva temporalmente en memoria durante esos 5 segundos.

## Modelo de tokens

`models/tokensModel.ts` ahora soporta mas operaciones sobre refresh tokens:

- Los tokens se guardan como hash SHA-256, no como texto plano.
- `storeToken(token, userId)` persiste el hash del token.
- `deleteToken(token, userId)` elimina el token activo.
- Si el token no existe, elimina todos los tokens del usuario y devuelve `403`, lo cual se usa como senal de posible reutilizacion.
- `getToken(token)` busca un token por su hash.
- `updateRow(newTokenId, updateObject)` actualiza estado, fecha de uso y referencia al token reemplazante.
- `rotateToken(oldToken, newToken, userId)` crea el token nuevo, marca el anterior como `USED`, guarda `used_at`, enlaza `replaced_by` y aplica la validacion del periodo de gracia.

## Cambios de base de datos

El modelo `Tokens` en `prisma/schema.prisma` fue ampliado:

- Se agrego el enum `StatusOfToken`:
  - `ACTIVE`
  - `USED`
- Se agregaron campos a `Tokens`:
  - `status`, con valor por defecto `ACTIVE`.
  - `used_at`, para registrar cuando se uso un token.
  - `replaced_by`, para enlazar un token con el token que lo reemplazo.
- Se agrego una self relation `TokenChain` para representar la cadena de reemplazo entre tokens.
- El indice de tokens cambio de `user_id` a `user_id + status`.
- `replaced_by` tiene constraint `unique`.

Migraciones nuevas detectadas:

- `prisma/migrations/20260403132218_added_field_to_tokens/migration.sql`
  - Crea el enum `StatusOfToken`.
  - Agrega `replaced_by`, `status` y `used_at`.
- `prisma/migrations/20260405193951_added_self_relation/migration.sql`
  - Cambia indices de `Tokens`.
  - Agrega indice unico sobre `replaced_by`.
  - Agrega foreign key de `replaced_by` hacia `Tokens.id`.

## Modelo de usuarios

`models/UsersModel.ts` cambio de funciones sueltas exportadas en un objeto a una clase `User` instanciada como `userModel`.

Cambios de nombres:

- `createUser` paso a `registerUser`.
- `validateCredentials` paso a `loginUser`.
- `getUser` se mantiene como metodo del modelo.

La logica principal se mantiene:

- Verificar si el username ya existe al registrar.
- Hashear passwords con `bcrypt`.
- Validar credenciales con `bcrypt.compare`.
- Devolver informacion basica del usuario autenticado.

## Compatibilidad ESM / Node16

Se actualizaron imports relativos para incluir extension `.js`, por ejemplo:

- `../services/jwtFunctions.js`
- `../models/UsersModel.js`
- `../prisma/lib/prisma.js`

Tambien se actualizo `tsconfig.json`:

- `module`: de `ESNext` a `Node16`.
- `moduleResolution`: de `node` a `node16`.

Esto alinea el proyecto con `"type": "module"` en `package.json` y con la resolucion ESM de Node.

## Rutas y controladores afectados

Se actualizaron imports en:

- `app.ts`
- `routes/authRouter.ts`
- `routes/postsRouter.ts`
- `routes/usersRouter.ts`
- `controllers/authController.ts`
- `controllers/postsController.ts`
- `controllers/userController.ts`
- `services/chekToken.ts`
- `models/PostsModel.ts`
- `models/UsersModel.ts`
- `models/tokensModel.ts`
- `prisma/lib/prisma.ts`

El cambio principal de comportamiento esta en `authController`, especialmente en:

- `/auth/login`
- `/auth/register`
- `/auth/refresh`
- `/auth/logout`

## Validacion

La validacion de password en `services/validation/authValidatorChain.ts` cambio:

- Minimo anterior: 8 caracteres.
- Minimo actual: 5 caracteres.

## Notas de estado

Piezas revisadas durante la pasada de calidad:

- Se eliminaron `console.log` de depuracion que exponian tokens o ruido interno.
- Se elimino `controlReusedTokens`, que estaba incompleta y no formaba parte del flujo real.
- Se eliminaron exports de tokens que no estaban integrados al flujo principal (`getToken`, `updateRow`).
- Los errores de firma de token ahora responden con HTTP desde el controlador.
- Las migraciones nuevas aparecen como archivos sin seguimiento en Git al momento de esta documentacion.

## Revision de calidad

Se revisaron `models`, `controllers`, `prisma`, `routes` y `services` con foco en modularidad, legibilidad, limpieza, diseno, buenas practicas y tipado.

### Evaluacion

- Modularidad / legibilidad: el proyecto estaba dividido en capas razonables, pero algunas abstracciones eran mas ruido que ayuda. La clase `User` no tenia estado y el servicio JWT tenia funciones incompletas, asi que la modularidad perjudicaba la lectura en vez de aclararla.
- Limpieza: habia logs de tokens, typos en mensajes, returns que no respondian al cliente y codigo muerto. Eso ya no es deuda inocente; eso es boleto directo a bugs tontos.
- Diseno: el flujo de refresh tokens necesitaba una operacion clara de rotacion en el modelo. Se concentro esa logica en `tokensModel.rotateToken` y se dejo `jwtFunctions` como coordinador de firma/verificacion.
- Buenas practicas: se ordenaron middlewares para autenticar antes de validar bodies en rutas protegidas, se validaron variables de entorno criticas y se dejaron respuestas HTTP consistentes.
- Tipado: se agregaron payloads discriminados para access/refresh tokens y validadores de forma antes de confiar en el contenido del JWT.

### Cambios de calidad aplicados

- `controllers/authController.ts`
  - Reemplaza `cookieNormalizer` por helpers claros: `setAuthCookies`, `clearAuthCookies`, `credentialsFromRequest` y `createAuthTokens`.
  - Quita logs de access/refresh tokens.
  - Corrige respuestas que devolvian objetos en vez de usar `res.status(...).json(...)`.
  - Usa status `201` en registro y mensajes consistentes.
- `services/jwtFunctions.ts`
  - Reescrito para separar firma, verificacion, rotacion y logout.
  - Agrega `jti` con `randomUUID()` al refresh token para evitar tokens duplicados emitidos en el mismo segundo.
  - Valida payloads de access y refresh tokens antes de confiar en ellos.
  - Elimina la funcion incompleta `controlReusedTokens`.
- `models/tokensModel.ts`
  - Expone solo operaciones usadas: `storeToken`, `deleteToken` y `rotateToken`.
  - Mantiene hashes SHA-256 para persistencia de refresh tokens.
  - Centraliza la ventana de gracia de 5 segundos y la deteccion de reutilizacion.
  - Evita `any` en el manejo del error Prisma `P2025`.
- `models/UsersModel.ts`
  - Elimina la clase sin estado y vuelve a funciones explicitas exportadas en un objeto.
  - Usa shorthand de propiedades para reducir ruido.
- `controllers/postsController.ts`
  - Corrige el update de posts para leer `req.body.message`, que es lo que valida `postUpdateValidatorChain`.
  - Simplifica ramas de error y corrige mensajes.
- `routes/postsRouter.ts`
  - Mueve `checkToken` antes de validadores en `POST /posts` y `PATCH /posts/:id`.
- `services/chekToken.ts`
  - Centraliza la lectura/verificacion del access token.
  - Solo asigna `req.user` despues de validar la forma del payload.
- `services/sanitizerCheck.ts`
  - Responde errores de validacion en una propiedad `errors`.
- `prisma/lib/prisma.ts`
  - Valida `DATABASE_URL` al iniciar.
  - Limpia formato e imports.

### Riesgos restantes

- La ventana de gracia devuelve el refresh token nuevo desde una cache en memoria. Si el proceso reinicia dentro de esos 5 segundos, no puede reconstruir el token crudo porque la base de datos solo guarda hashes.
- `deleteToken` en logout sigue eliminando el token presentado; si en el futuro se quieren sesiones multiples por usuario o logout global, hay que definir esa politica explicitamente.
- No hay pruebas automatizadas para la carrera de `/auth/refresh`; el flujo compila, pero esta parte merece test de integracion con dos requests casi simultaneas.

---

## Sesion (rama `refactor`) — higiene de documentacion

Pasada de solo-documentacion, sin cambios de comportamiento en el codigo:

- `README.md`: se elimino la raiz inexistente `API/` del diagrama de estructura
  (los archivos viven en la raiz del repo) y se agregaron `prisma.config.ts` y
  `prisma/generated/prisma/` para reflejar el layout real.
- `README.md`: corregido el enlace roto `BRANCH_CHANGES.md` -> `Branch_changes.md`
  (fallaba en sistemas case-sensitive como GitHub/Linux) y anotado que apunta a un
  registro historico de la rama `sessions`.
- `Branch_changes.md`: se agrego una nota de "registro historico" aclarando que
  documenta la rama `sessions` y puede contradecir el codigo actual (menciona
  refresh de "1 hora" cuando el JWT de refresh hoy expira en 5 min).

[Listo :v]

---

## Sesion (rama `refactor`) — conversion de blog API a API template

Objetivo: transformar la copia de la blog API en un **template de API**
reutilizable, conservando la esencia (capas, nombres, estilo) y arreglando la
deuda tecnica pendiente. Toda la documentacion nueva vive en `README_new.md`.

### Configuracion centralizada (nuevo `config/env.ts`)

- Unica fuente de verdad de la config: valida al arranque las criticas
  (`DATABASE_URL`, `JWT_KEY`, `JWT_KEY_REFRESH`, y **`COOKIE_KEY`, que antes no
  se validaba** — bug: el server arrancaba y el login reventaba en runtime).
- Opcionales con default: `PORT` (3000), `CORS_ORIGIN`, `IS_PRODUCTION`,
  `ACCESS_TOKEN_TTL_S` (900 = 15 min), `REFRESH_TOKEN_TTL_S` (604800 = 7 dias).
- Los TTL de los tokens ahora vienen de env y el `maxAge` de las cookies se
  **deriva** de ellos (`ttl * 1000`): arregla la deuda #2 (cookie de 1 h que
  sobrevivia a un JWT de 5 min). Se fueron los valores de testing (1 min / 5 min).
- `REFRESH_TOKEN_GRACE_PERIOD_MS` quedo definida una sola vez (deuda #7; antes
  duplicada en `jwtFunctions.ts` y `tokensModel.ts`).
- Migrados a consumir `config/env.ts`: `prisma/lib/prisma.ts`, `jwtFunctions.ts`,
  `authController.ts`, `corsOptions.ts`, `tokensModel.ts`, `app.ts`.

### Fixes de deuda tecnica

- **CORS** ahora permite `PATCH` (deuda #1; el preflight lo bloqueaba) y el
  `origin` sale de env.
- **Script `dev`**: `tsx watch app.ts` (deuda #4; antes `pnpm dlx tsx app.js`,
  que apuntaba a un archivo inexistente y redescargaba tsx).
- **helmet** global y **express-rate-limit** en `/auth` (100 req / 15 min por
  IP) (deuda #8). Nuevas dependencias.
- **Error handler** de `app.ts`: `err: unknown` (antes mal tipado como
  `ErrorRequestHandler`) y mensaje serio; `PORT` desde env.
- Typo de archivo: `services/chekToken.ts` → `services/checkToken.ts` (git mv).
- Limpieza: `emptyEndpoint` e interfaz `UsersRequest` muertos en
  `userController.ts`; validacion manual redundante en `postNewPost`.

### Recurso de ejemplo `posts` completado

- **`GET /posts` real** (deuda #5): listado publico de posts publicados, sin
  auth (antes exigia token y respondia "Empty endpoint").
- **`PATCH /posts/:id/publish`**: publica/despublica un post propio. Nuevo
  `publishValidatorChain` (boolean estricto) + `PostsModel.setPublishStatus`.

### Base de datos

- Eliminado el modelo `Comment` (estaba en la base sin rutas ni controllers).
  Migracion `20260705230145_remove_comments` aplicada y cliente regenerado.

### Archivos nuevos

- `README_new.md`: documentacion completa del template (flujo de request,
  capas, convenciones, referencia de API, guia para agregar un recurso nuevo,
  limitaciones conocidas).
- `.env.example`: plantilla de variables de entorno.
- `pnpm-workspace.yaml`: `allowBuilds` para prisma/esbuild (pnpm 11 bloquea
  build scripts por defecto).

### Verificacion

- `tsc --noEmit` limpio.
- Flujo end-to-end con curl contra el server local: register (201) → GET /posts
  anonimo (200) → POST /posts (201) → publish (200, y 400 con boolean invalido)
  → el post aparece en el listado publico → refresh (200) → logout (200) →
  preflight OPTIONS anuncia PATCH y helmet responde con CSP.
- Datos de prueba del smoke test borrados (queda el usuario `tpl.check` en la
  DB de dev; no hay endpoint para borrar usuarios).

### Conscientemente NO tocado (esencia)

- La ventana de gracia sigue en memoria (limitacion single-instance documentada).
- Estructura de capas, contrato `{ status, ...data }`, estilo de modelos y
  controllers: intactos.

[Listo :v]

---

## Sesion (rama `refactor`) — suite de testing de integracion

Se agrego testing de integracion al template: **38 tests** que hacen requests
HTTP reales (Supertest) contra el `app` de Express y un **PostgreSQL efimero en
Docker** (Testcontainers). Sin mocks de Prisma: se prueba el comportamiento
observable de la API completa.

### Stack elegido

- **Vitest** (no Jest): soporte nativo ESM + TypeScript, cero config extra con
  `"type": "module"` y resolucion `Node16`.
- **Supertest**: requests contra el app exportado, sin abrir puerto.
- **@testcontainers/postgresql**: contenedor `postgres:17` por corrida, con las
  migraciones reales aplicadas via `prisma migrate deploy`. Hermetico (secretos
  dummy, no usa el `.env` local ni la DB de desarrollo).

### Cambios de codigo

- **Split `app.ts` / `server.ts`**: `app.ts` ahora exporta el app sin hacer
  `listen` (necesario para Supertest); el `listen` vive en `server.ts`, nuevo
  punto de entrada. `dev` es `tsx watch server.ts`. Se anoto `app: Express`
  (TS2742 de pnpm con `declaration: true`).
- **`vitest.config.ts`**: archivos en serie (comparten DB), timeouts amplios
  para el arranque del contenedor.
- **`tests/`**: `globalSetup.ts` (contenedor + env + migraciones),
  `helpers.ts` (truncado, registro, parseo de cookies), y las tres suites.
- `pnpm-workspace.yaml`: los build scripts nativos de testcontainers (`ssh2`,
  `cpu-features`, `protobufjs`) quedaron explicitamente en `false` — son
  aceleradores opcionales que no se necesitan (Docker local por named pipe).

### Que cubren los tests

- **auth (15)**: register/login/logout con cookies httpOnly y paths
  restringidos; rotacion verificada en la DB (`USED` + `replaced_by`);
  **ventana de gracia** con dos refresh concurrentes; **deteccion de
  reutilizacion** (retrocediendo `used_at` para no dormir 5 s) con borrado
  total de tokens; refresh tras logout → 403.
- **posts (18)**: listado publico solo con publicados en orden desc;
  visibilidad de borradores (anonimo 404 / tercero 404 / autor 200); ownership
  en PATCH, publish y DELETE; boolean estricto en publish; validaciones 400.
- **users (5)**: `/me` con payload del token; rama 401 de `checkToken` con una
  cookie firmada a mano (replica de cookie-signature) cuyo contenido no es JWT;
  `/me/posts` con borradores propios y sin posts ajenos.

### Hallazgo curioso

Dos access tokens firmados el mismo segundo con los mismos claims producen un
JWT **identico** (HS256 es determinista y `iat`/`exp` van en segundos). No es
bug — por eso el refresh lleva `jti` — pero obligo a ajustar una asercion.

### Verificacion

- `tsc --noEmit` limpio.
- `pnpm test` verde dos veces seguidas (contenedor fresco cada vez, sin estado
  residual).
- `pnpm dev` (ahora `server.ts`) verificado con smoke de `GET /posts`.

### Docs

- README del template: fila de Testing en el stack, `server.ts` y `tests/` en
  la estructura, nueva seccion **Testing** (infraestructura, cobertura, como
  clonar la suite para un recurso nuevo), y la limitacion "Tests" reemplazada
  por "CI" como siguiente punto de extension.

[Listo :v]
