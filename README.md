## Arcade Vault

Es una plataforma para jugar online y competir por la mayor cantidad de puntos.

## Usa Spec Driven Design

Basado en /spec y /spec-impl

Siguiendo las buenas practicas recomendadas aquí:
https://github.com/Klerith/fernando-skills

## Skills usadas

```bash
npx skills@latest add Klerith/fernando-skills
```

## Variables de entorno

El formulario de contacto de `/acerca-de` envía correos con [Resend](https://resend.com).
Copia `.env.example` a `.env.local` y rellena:

| Variable                               | Descripción                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`                       | Clave de API de Resend (https://resend.com/api-keys).                                     |
| `CONTACT_TO_EMAIL`                     | Dirección de destino de los mensajes del formulario.                                      |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL del proyecto Supabase (`https://<ref>.supabase.co`).                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública de Supabase; pega la _publishable key_ (`sb_publishable_...`) del proyecto. |

El remitente es el sandbox de Resend `onboarding@resend.dev`, que **solo entrega al
email con el que te registraste en Resend**: pon ese email en `CONTACT_TO_EMAIL`.
Para enviar a cualquier destinatario habría que verificar un dominio propio en Resend.

Las dos variables `NEXT_PUBLIC_SUPABASE_*` son públicas (se usan también en el
navegador). Sin ellas el sitio compila y funciona igual, pero el endpoint de
diagnóstico `GET /api/health/supabase` devuelve un error.

`.env.local` no se versiona. Si las variables no están definidas, el sitio compila y
funciona igual, pero el formulario devuelve un error de configuración al enviarse.

## Hola mundo
