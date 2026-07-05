// CODIGO GENERADO POR CODEX

# Cambios de la rama `sessions`

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
