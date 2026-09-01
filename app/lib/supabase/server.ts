// Cliente de Supabase para el servidor (Server Components, Route Handlers,
// Server Actions). Puentea la sesión con las cookies de la petición.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Invocado desde un Server Component: no puede escribir cookies.
            // El refresco real de la sesión ocurre en proxy.ts (updateSession).
          }
        },
      },
    },
  );
}
