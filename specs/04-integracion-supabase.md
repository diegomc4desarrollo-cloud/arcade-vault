# SPEC 04 — Integración base de Supabase en la app Next.js

> **Status:** Implementado
> **Depends on:** SPEC 03
> **Date:** 2026-09-01
> **Objective:** Instalar `@supabase/supabase-js` y `@supabase/ssr` y cablear los clientes de Supabase (browser, server y refresco de sesión en `proxy.ts`) en la app de Next.js 16, sin construir ninguna funcionalidad encima.

---

## Section 1 — Por qué esta spec existe

Las specs futuras (autenticación real, catálogo en Postgres, puntuaciones persistidas, realtime, Edge Functions) necesitan un punto de entrada a Supabase común y correcto.

Montar ese cableado bien una sola vez evita que cada spec posterior reinvente los clientes y el manejo de cookies.

Next.js 16 renombró `middleware.ts` a `proxy.ts` (ver `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`), así que el patrón oficial de `@supabase/ssr` (que asume `middleware.ts`) hay que adaptarlo.

---

## Scope

**In:**

- Instalar las dependencias `@supabase/supabase-js` y `@supabase/ssr`.
- `app/lib/supabase/client.ts`: cliente de navegador (`createBrowserClient`) para Client Components.
- `app/lib/supabase/server.ts`: factoría de cliente de servidor (`createServerClient`) que puentea las cookies con `cookies()` de `next/headers`, con `getAll`/`setAll` y `try/catch` en `setAll` (los Server Components no pueden escribir cookies).
- `app/lib/supabase/proxy.ts`: helper `updateSession(request)` que crea un cliente de servidor sobre `NextRequest`/`NextResponse`, llama a `supabase.auth.getClaims()` para refrescar el token y devuelve la `NextResponse` con las cookies actualizadas.
- `proxy.ts` en la raíz del repo: exporta `proxy` (delega en `updateSession`) y un `config.matcher` que excluye assets estáticos (`_next/static`, `_next/image`, `favicon.ico`, imágenes).
- `app/api/health/supabase/route.ts`: Route Handler `GET` permanente que construye el cliente de servidor, llama a `supabase.auth.getClaims()` y devuelve `{ ok: true, session: false }` si conecta, o `{ ok: false, error }` (HTTP 500) si faltan variables de entorno o la llamada lanza.
- `.env.example`: mantener `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (el valor es una _publishable key_ `sb_publishable_...`); **eliminar** `SUPABASE_SERVICE_ROLE_KEY`.
- `README.md`: ampliar la sección "Variables de entorno" con las dos variables de Supabase y una nota de que sin ellas el `build` sigue compilando pero `/api/health/supabase` devuelve error.

**Out of scope (para futuras specs):**

- Creación de tablas, esquema, migraciones o RLS en Supabase.
- Conectar el `/auth` visual existente con Supabase Auth (login/registro/OAuth reales, modo invitado).
- Cualquier uso real de los clientes desde componentes o páginas existentes (`Nav`, `HallOfFame`, `GamePlayer`, `app/data.ts`, `app/lib/session.ts` siguen intactos).
- Realtime, Edge Functions y Storage.
- `SUPABASE_SERVICE_ROLE_KEY` y cualquier operación con privilegios de servicio: se añadirá cuando una spec lo requiera.
- Generación de tipos TypeScript de la base de datos (`Database`): se hará en la primera spec que cree tablas.
- Tests automatizados.

---

## Data model

Esta feature **no introduce datos persistentes ni estructuras nuevas**. No hay tablas, ni tipos de dominio, ni claves de `localStorage`.

Variables de entorno (en `.env.local`, no versionado; plantilla en `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL` — URL del proyecto (`https://eknolpsuvbndcfknoefp.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — _publishable key_ del proyecto (formato `sb_publishable_...`), con el mismo nombre que la clave en el panel de Supabase.

Ambas son públicas y van con prefijo `NEXT_PUBLIC_` (se usan también en el navegador). No se introduce ninguna variable solo-servidor en esta spec.

Firma de los helpers nuevos:

```ts
// app/lib/supabase/client.ts
export function createClient(): SupabaseClient;

// app/lib/supabase/server.ts
export async function createClient(): Promise<SupabaseClient>; // async: usa await cookies()

// app/lib/supabase/proxy.ts
export async function updateSession(request: NextRequest): Promise<NextResponse>;
```

Los clientes se crean **sin genérico `<Database>`** (el proyecto está vacío); se tiparán cuando exista el esquema.

---

## Implementation plan

1. **Dependencias.** `npm install @supabase/supabase-js @supabase/ssr`. Añadir a `.env.local` (local, no versionado) `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con los valores reales del proyecto `eknolpsuvbndcfknoefp`. Sin código todavía.
2. **`.env.example` y README.** En `.env.example`: dejar `NEXT_PUBLIC_SUPABASE_URL=` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=`, quitar la línea `SUPABASE_SERVICE_ROLE_KEY` y su comentario, ajustar el comentario para indicar que se pega la _publishable key_ (`sb_publishable_...`). En `README.md`: añadir ambas variables a la tabla de "Variables de entorno" y una frase sobre el healthcheck.
3. **Cliente de navegador.** Crear `app/lib/supabase/client.ts` (`"use client"` no hace falta; es un módulo) con `createClient()` que devuelve `createBrowserClient(url, key)` leyendo las dos `process.env.NEXT_PUBLIC_*`. Test manual: `npm run build` compila.
4. **Cliente de servidor.** Crear `app/lib/supabase/server.ts` con `createClient()` `async` que hace `const cookieStore = await cookies()` y llama a `createServerClient(url, key, { cookies: { getAll, setAll } })`; `setAll` envuelto en `try/catch` (no-op si se invoca desde un Server Component). Sin consumidores todavía.
5. **Helper de proxy.** Crear `app/lib/supabase/proxy.ts` con `updateSession(request)`: crea `let response = NextResponse.next({ request })`, instancia `createServerClient` con `getAll` desde `request.cookies` y `setAll` que escribe en `request.cookies` y en `response.cookies`, llama a `await supabase.auth.getClaims()` y devuelve `response` sin modificar. Seguir el patrón del doc de `@supabase/ssr` para Next.js, adaptado a que el archivo raíz será `proxy.ts`.
6. **`proxy.ts` raíz.** Crear `proxy.ts` en la raíz del repo: `export async function proxy(request: NextRequest) { return updateSession(request) }` y `export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'] }`. Test manual: `npm run dev` arranca sin errores y la navegación entre páginas existentes sigue funcionando igual.
7. **Healthcheck.** Crear `app/api/health/supabase/route.ts` con `export async function GET()`: `const supabase = await createClient()`; `const { error } = await supabase.auth.getClaims()`; si faltan las env vars o `error` está presente → `NextResponse.json({ ok: false, error: ... }, { status: 500 })`; si no → `NextResponse.json({ ok: true, session: false })`. Test manual: `curl localhost:3000/api/health/supabase` devuelve `{"ok":true,"session":false}` con las env vars puestas.
8. **Cierre.** `npm run lint` y `npm run build`. Confirmar que el build completa sin las env vars (Vercel/CI sin secretos) y que `git grep` no encuentra `SUPABASE_SERVICE_ROLE_KEY` ni ninguna clave real versionada. Verificación manual completa del healthcheck con `.env.local` real.

---

## Acceptance criteria

- [x] `package.json` lista `@supabase/supabase-js` y `@supabase/ssr` como dependencias y `npm install` deja el lockfile consistente.
- [x] Existen `app/lib/supabase/client.ts`, `app/lib/supabase/server.ts` y `app/lib/supabase/proxy.ts` con las firmas descritas.
- [x] Existe `proxy.ts` en la raíz del repo que exporta `proxy` y un `config.matcher` que excluye `_next/static`, `_next/image`, `favicon.ico` e imágenes.
- [x] `npm run dev` arranca sin errores y navegar entre `/`, `/juegos`, `/juegos/[id]`, `/salon`, `/auth` y `/acerca-de` funciona exactamente igual que antes de esta spec.
- [x] Con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` definidas, `GET /api/health/supabase` responde 200 con `{ "ok": true, "session": false }`.
- [x] Sin esas variables, `GET /api/health/supabase` responde 500 con `{ "ok": false, "error": ... }` y `npm run build` sigue completando.
- [x] `.env.example` contiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y **no** contiene `SUPABASE_SERVICE_ROLE_KEY`.
- [x] El `README.md` documenta ambas variables en la sección "Variables de entorno".
- [x] `git grep` no encuentra ninguna URL de proyecto con clave, `service_role` ni `sb_secret_` versionados.
- [x] Ningún componente o página existente importa nada de `app/lib/supabase/` (esta spec solo cablea; no consume).
- [x] `npm run lint` sin errores.
- [x] `npm run build` sin errores.

---

## Decisions

- **Sí:** dos clientes separados en `app/lib/supabase/` (`client.ts` y `server.ts`) más un helper de proxy. Razón: es el patrón oficial de `@supabase/ssr`; cada contexto (navegador / RSC / borde) maneja las cookies distinto. Elegido por el usuario.
- **Sí:** `proxy.ts` en la raíz con `updateSession` desde ya, aunque no haya auth funcional. Razón: elegido por el usuario; es el patrón oficial de `@supabase/ssr` y deja la spec de auth sin tener que tocar el cableado del borde.
- **Sí (adaptación obligada de Next.js 16):** el archivo del borde es `proxy.ts` con `export function proxy`, no `middleware.ts`. Razón: `middleware.ts` está deprecado en Next.js 16 (`proxy.md` en los docs); la guía de `@supabase/ssr` asume el nombre viejo.
- **Sí:** healthcheck permanente en `app/api/health/supabase/route.ts`. Razón: elegido por el usuario; da una comprobación de conectividad reutilizable sin depender de una feature.
- **Sí:** `getClaims()` como llamada del healthcheck (no `getUser()`). Razón: valida contra el servidor de Auth sin exigir sesión ni lanzar cuando no la hay.
- **Sí:** nombrar la variable `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, igual que la clave en el panel de Supabase. Razón: cambiado por el usuario durante la implementación; el nombre refleja el tipo de clave real (publishable, no la legacy anon).
- **Sí:** eliminar `SUPABASE_SERVICE_ROLE_KEY` de `.env.example` en esta spec. Razón: no se usa; se reintroducirá cuando una spec de servidor lo necesite, con su documentación.
- **No:** generar `database.types.ts` ni tipar los clientes con `<Database>` ahora. Razón: el proyecto Supabase está vacío (0 tablas); un `Database` vacío no aporta. Se hará en la primera spec con esquema.
- **No:** conectar `/auth`, `Nav` o `app/lib/session.ts` con Supabase en esta spec. Razón: elegido por el usuario; auth real es su propia spec.
- **No:** desarrollo local con Supabase CLI / Docker. Razón: el proyecto en la nube (`eknolpsuvbndcfknoefp`) ya existe y el MCP está conectado; el stack local se puede añadir después si hace falta.

---

## Risks

| Riesgo                                                                     | Mitigación                                                                                                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La guía de `@supabase/ssr` asume `middleware.ts` (deprecado en Next.js 16) | Esta spec fija `proxy.ts` con `export function proxy`; el cuerpo de `updateSession` es idéntico al de la guía.                                                                  |
| El `matcher` del proxy bloquea CSS/JS/imágenes si está mal escrito         | El `matcher` usa un negative lookahead que excluye `_next/static`, `_next/image`, `favicon.ico` e imágenes; un criterio de aceptación verifica que la navegación sigue intacta. |
| `build` en CI sin las env vars de Supabase                                 | Los clientes leen `process.env` en tiempo de ejecución, no de build; el healthcheck degrada a `{ ok: false }` en vez de romper. Criterio de aceptación explícito.               |
| Fuga de la _publishable key_                                               | Es una clave pública por diseño (`NEXT_PUBLIC_`); la que nunca debe versionarse (`service_role` / `sb_secret_`) se retira del `.env.example` en esta spec.                      |
| `proxy.ts` corre en runtime Node.js en Next.js 16 (antes Edge)             | `@supabase/ssr` funciona en Node.js; no se fija `runtime` (no está permitido en proxy).                                                                                         |
| Escribir cookies desde un Server Component lanza                           | `setAll` en `server.ts` va envuelto en `try/catch`; el refresco real de cookies ocurre en el proxy.                                                                             |

---

## What is **not** in this spec

- Creación de tablas, esquema, migraciones o RLS en Supabase.
- Conectar el `/auth` existente con Supabase Auth.
- Cualquier uso real de los clientes desde componentes o páginas existentes.
- Realtime, Edge Functions y Storage.
- `SUPABASE_SERVICE_ROLE_KEY` y operaciones con privilegios de servicio.
- Generación de tipos TypeScript de la base de datos.
- Tests automatizados.

Cada uno de estos, si se aborda, iría en su propia spec.
