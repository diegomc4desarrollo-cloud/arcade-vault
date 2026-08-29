# SPEC 03 — Página "Acerca de" y formulario de contacto con envío por Resend

> **Status:** Aprobado
> **Depends on:** SPEC 02
> **Date:** 2026-08-29
> **Objective:** Implementar `/acerca-de` portando `about.jsx` del prototipo `references/templates/home-about/` y conectar su formulario de contacto para que envíe un correo real al equipo mediante Resend a través de una Server Action.

---

## Scope

**In:**

- Instalar la dependencia `resend` y documentar las variables de entorno (`RESEND_API_KEY`, `CONTACT_TO_EMAIL`) en un `.env.example` versionado y en el README.
- Portar el CSS: añadir a `app/globals.css` el bloque `ABOUT PAGE` de `references/templates/home-about/styles.css` **verbatim** (incluye `.about-*`, `.highlight*`, `.about-divider`, `.contact-*`, `.terminal-success`, `.term-*`, `.btn.press`, `@keyframes shake`, `@keyframes pxblink`), sin re-declarar reglas ya presentes (`@keyframes blink`, `.fade-in`, `@keyframes fadeIn`), sin el bloque `GAMEPAD`.
- Pantalla **Acerca de** en `/acerca-de`: Server Component fino (`app/acerca-de/page.tsx`) que renderiza un Client Component nuevo (`app/components/AboutScreen.tsx`), portando `about.jsx`: hero con misión y 3 highlights (HEART/BROWSER/PLANT), separador `.about-divider`, sección de contacto (`.contact-intro` + formulario) y las animaciones `.reveal` al hacer scroll.
- Server Action `app/acerca-de/actions.ts` (`"use server"`) `enviarMensajeContacto(prevState, formData)`: comprobación de honeypot, rate limit en memoria por IP, revalidación en servidor (3 campos no vacíos + formato de email + límites de longitud) y envío con Resend (`from: onboarding@resend.dev`, `to: CONTACT_TO_EMAIL`, `replyTo` = email del visitante, cuerpo en **texto plano**). Devuelve un resultado tipado.
- Rate limiter en memoria reutilizable (`app/lib/rate-limit.ts`).
- Estados de UX del formulario: validación de cliente (campos no vacíos → `shake`), estado *pending* ("TRANSMITIENDO…", botón deshabilitado), éxito (terminal-success del template con las líneas decorativas + "GRACIAS, {NOMBRE}." + "ENVIAR OTRO MENSAJE"), error (banner rojo + `shake`, campos intactos, reintento).

**Out of scope (para futuras specs):**

- Verificar un dominio propio en Resend o enviar a destinatarios arbitrarios (el sandbox `onboarding@resend.dev` solo entrega al email de la cuenta de Resend).
- Guardar los mensajes de contacto en cualquier sitio (BD, fichero, panel de administración).
- Plantilla de correo con React Email o HTML rico.
- Anti-spam más allá de honeypot + rate limit en memoria (captcha, verificación de firma, store compartido).
- Autorespuesta automática al visitante.
- Tests automatizados.
- Portar el bloque `GAMEPAD` de `styles.css`.
- Cambios en el `Nav` (el enlace `/acerca-de` y su lógica `isActive` ya existen desde SPEC 02).

---

## Data model

Esta feature **no introduce datos persistentes**: los mensajes se envían por correo y no se guardan en BD, fichero ni `localStorage`.

Tipos en `app/acerca-de/actions.ts`:

```ts
type ContactResult =
  | { ok: true }
  | {
      ok: false;
      error: "validation" | "rate_limit" | "config" | "send";
      message: string; // texto listo para mostrar en el banner
    };

// Firma de la Server Action (para useActionState):
export async function enviarMensajeContacto(
  prevState: ContactResult | null,
  formData: FormData,
): Promise<ContactResult>;
```

Campos del `FormData`: `name`, `email`, `message`, `_gotcha` (honeypot, debe llegar vacío).

Variables de entorno (en `.env.local`, no versionado; plantilla en `.env.example`):

- `RESEND_API_KEY` — clave de API de Resend.
- `CONTACT_TO_EMAIL` — dirección de destino. Mientras se use el sandbox, debe ser el email de la cuenta de Resend.

Límites de validación de servidor: `name` 1–100, `email` 1–200 y con formato válido, `message` 1–5000 caracteres.

Rate limit (`app/lib/rate-limit.ts`): `Map<string, number[]>` en memoria del proceso; ventana **5 solicitudes / 10 minutos** por IP (`x-forwarded-for`, primer valor; clave de reserva `"unknown"` si no hay IP).

---

## Implementation plan

1. **Dependencia y entorno.** `npm install resend`. Crear `.env.example` con `RESEND_API_KEY=` y `CONTACT_TO_EMAIL=`. Añadir al `README.md` una sección "Variables de entorno" explicando ambas y la limitación del sandbox de Resend. Sin UI todavía.
2. **CSS.** Añadir a `app/globals.css` el bloque `ABOUT PAGE` de `references/templates/home-about/styles.css`, copiado verbatim (incluidas `@keyframes shake` y `@keyframes pxblink`), sin re-declarar `@keyframes blink`, `.fade-in` ni `@keyframes fadeIn`. Sin cambios visibles todavía.
3. **Rate limiter.** Crear `app/lib/rate-limit.ts` con `checkRateLimit(key: string): boolean` (ventana 5/10 min, `Map` en memoria, determinista, sin dependencias).
4. **Server Action.** Crear `app/acerca-de/actions.ts` (`"use server"`) con `enviarMensajeContacto`:
   - si `_gotcha` tiene valor → `{ ok: true }` sin enviar nada;
   - revalida `name`/`email`/`message` (no vacíos, formato de email, longitudes) → `{ ok: false, error: "validation", … }`;
   - `checkRateLimit(ip)` con la IP de `headers()` → `{ ok: false, error: "rate_limit", … }`;
   - si falta `RESEND_API_KEY` o `CONTACT_TO_EMAIL` → `console.error` + `{ ok: false, error: "config", … }`;
   - `new Resend(key).emails.send({ from: "Arcade Vault <onboarding@resend.dev>", to: [CONTACT_TO_EMAIL], replyTo: email, subject: \`Nuevo mensaje de contacto — ${name}\`, text: … })`; si la respuesta trae `error` → `{ ok: false, error: "send", … }`; si no → `{ ok: true }`.
   Test manual (con `.env.local` real): datos válidos entregan el correo; honeypot y rate limit se comportan.
5. **AboutScreen.** Crear `app/components/AboutScreen.tsx` (Client Component) portando `about.jsx`:
   - `useReveal` (mismo patrón que `HomeScreen`, con guarda `typeof IntersectionObserver === "undefined"` que añade `in` a todo);
   - `HighlightIcon` y el marcado de hero / misión / highlights / `.about-divider`;
   - formulario con `useActionState(enviarMensajeContacto, null)` y `useState` para los campos y el `shake`:
     - honeypot `<input name="_gotcha">` oculto fuera de pantalla, `tabIndex={-1}`, `autoComplete="off"`, `aria-hidden`;
     - `onSubmit` de cliente: si algún campo está vacío → `shake` 400 ms y no envía; si no, delega en la `action`;
     - *pending* (`isPending`) → botón "▸  TRANSMITIENDO…" deshabilitado;
     - `state?.ok === true` → `terminal-success` con las líneas decorativas del template, "GRACIAS, {NOMBRE}." y "ENVIAR OTRO MENSAJE" (resetea campos y estado);
     - `state?.ok === false` → banner de error rojo sobre el formulario + `shake`; los campos conservan lo escrito.
   Test manual: validación de cliente, envío correcto, error, reintento.
6. **Página.** Crear `app/acerca-de/page.tsx` (Server Component fino) que renderiza `<AboutScreen />`. Test manual: `/acerca-de` ya no da 404, el enlace "Acerca de" del Nav se resalta en esa ruta.
7. **Cierre.** `npm run lint` y `npm run build` (comprobar que el build no depende de las variables de entorno). Verificación manual completa con `.env.local`: envío correcto, error (API key inválida), honeypot vía devtools, rate limit y validación de servidor.

---

## Acceptance criteria

- [x] `GET /acerca-de` responde 200 (ya no 404) y muestra: kicker "▸ ACERCA DE", título "ACERCA DE ARCADE VAULT", el párrafo de misión y los 3 highlights (HEART / BROWSER / PLANT) con sus iconos pixel.
- [x] El separador `.about-divider` y la sección de contacto aparecen con la animación `.reveal` al hacer scroll.
- [x] El enlace "Acerca de" del `Nav` (barra y panel móvil) se resalta cuando la ruta es `/acerca-de`.
- [x] Enviar el formulario con algún campo vacío dispara la animación `shake` y no invoca la Server Action.
- [x] Con los 3 campos rellenos y una `RESEND_API_KEY` válida, el envío entrega un correo a `CONTACT_TO_EMAIL` cuyo `reply-to` es el email escrito por el visitante y cuyo cuerpo (texto plano) contiene nombre, email y mensaje.
- [x] Tras un envío correcto, el formulario se sustituye por la terminal de éxito con "GRACIAS, {NOMBRE}." y las líneas decorativas del template; "ENVIAR OTRO MENSAJE" devuelve el formulario vacío.
- [x] Durante el envío el botón muestra "TRANSMITIENDO…" y está deshabilitado.
- [x] Si el envío falla (p.ej. `RESEND_API_KEY` inválida), se muestra un banner de error, el formulario hace `shake`, conserva lo escrito y permite reintentar.
- [x] Rellenar el honeypot `_gotcha` (vía devtools) hace que la acción devuelva éxito sin enviar ningún correo.
- [x] Superar 5 envíos en 10 minutos desde la misma IP devuelve el estado de error de rate limit.
- [x] El servidor rechaza (`error: "validation"`) un envío con email mal formado o con un campo vacío aunque se haya saltado la validación de cliente.
- [x] `.env.example` existe con `RESEND_API_KEY` y `CONTACT_TO_EMAIL`; `git grep` no encuentra ninguna clave de API ni email real versionado.
- [x] Con `RESEND_API_KEY` / `CONTACT_TO_EMAIL` ausentes, `npm run build` completa igualmente y la acción devuelve `error: "config"` en tiempo de ejecución.
- [x] `npm run lint` sin errores.
- [x] `npm run build` sin errores.

---

## Decisions

- **Sí:** Server Action (`app/acerca-de/actions.ts`) + `useActionState`. Razón: patrón idiomático de Next.js 16 App Router para formularios; menos código que un Route Handler + `fetch` manual. Elegido por el usuario.
- **Sí:** remitente `onboarding@resend.dev` (sandbox de Resend). Razón: no requiere verificar dominio. Elegido por el usuario. Limitación conocida: Resend solo entrega al email de la cuenta propietaria, así que `CONTACT_TO_EMAIL` debe ser ese email.
- **Sí:** destino en `CONTACT_TO_EMAIL` (variable de entorno), nunca hardcodeado; `.env.example` versionado, `.env.local` ignorado. Razón: no dejar credenciales ni direcciones en un repo público.
- **Sí:** anti-spam = honeypot `_gotcha` + rate limit en memoria (`Map` por IP, 5/10 min). Razón: elegido por el usuario; sin dependencias. Limitación: el límite se reinicia con el proceso y es por instancia.
- **Sí:** correo en **texto plano** con `replyTo` = email del visitante. Razón: elegido por el usuario; imposible de romper y permite responder directamente.
- **Sí:** estado de error = banner rojo + animación `shake` (la misma del prototipo para campos vacíos). Razón: elegido por el usuario.
- **Sí:** la terminal de éxito conserva las líneas decorativas (`[OK] Conectando con servidor…`, etc.) tal cual el template, aunque el envío real ya haya ocurrido. Razón: "sigue el template exactamente igual"; son cosméticas.
- **Sí:** `AboutScreen` como Client Component único (igual que `HomeScreen` en SPEC 02), con `app/acerca-de/page.tsx` como Server Component fino. Razón: `useReveal` y el formulario interactivo necesitan cliente.
- **Sí (excepción puntual a "no se reescribe el CSS" de SPEC 01):** se porta el bloque `ABOUT PAGE` de `styles.css` verbatim a `app/globals.css`. Razón: esas clases nunca se portaron (SPEC 02 las dejó explícitamente fuera); se copian tal cual como en SPEC 01 y 02.
- **Sí:** se mantiene la validación de cliente (campos no vacíos) **además** de la de servidor. Razón: feedback inmediato; el servidor sigue siendo la fuente de verdad.
- **No:** persistir los mensajes de contacto (BD, fichero, `localStorage`). Razón: el canal es el correo; guardar copia queda fuera de alcance.
- **No:** React Email ni plantilla HTML. Razón: añade dependencias y complejidad de build sin valor para este caso.

---

## Risks

| Riesgo | Mitigación |
| --- | --- |
| `RESEND_API_KEY` / `CONTACT_TO_EMAIL` ausentes | La Server Action detecta la falta, hace `console.error` y devuelve `{ ok: false, error: "config" }`; la UI muestra el banner genérico. El `build` no depende de las variables. |
| El sandbox `onboarding@resend.dev` solo entrega al email de la cuenta de Resend | Documentado en `.env.example` y en el README: mientras no haya dominio verificado, `CONTACT_TO_EMAIL` debe ser el email de la cuenta de Resend. |
| Rate limit en memoria: se reinicia con el server y no cubre múltiples instancias | Aceptado para el alcance del proyecto; con escalado horizontal habría que mover el límite a un store compartido (otra spec). |
| El honeypot no frena bots avanzados | Complementado con el rate limit; endurecer (captcha, firma) sería otra spec. |
| IP poco fiable tras proxies / en local | Se usa el primer valor de `x-forwarded-for`; si no hay, clave de reserva `"unknown"`. No es seguridad crítica. |
| Clave de API filtrada por error en el cliente | La clave solo se lee dentro de `"use server"`; nunca se importa desde un Client Component ni se expone como `NEXT_PUBLIC_*`. |

---

## What is **not** in this spec

- Verificar un dominio propio en Resend o enviar a destinatarios arbitrarios.
- Guardar los mensajes de contacto en cualquier almacén.
- Plantilla de correo con React Email / HTML rico.
- Captcha o anti-spam más allá de honeypot + rate limit en memoria.
- Autorespuesta al visitante.
- Tests automatizados.
- Portar el bloque `GAMEPAD` de `styles.css`.

Cada uno de estos, si se aborda, iría en su propia spec.
