// Refresco de la sesión de Supabase en el borde, invocado desde proxy.ts.
// Next.js 16 renombró middleware.ts -> proxy.ts; el cuerpo sigue el patrón
// oficial de @supabase/ssr para App Router.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No metas código entre createServerClient y getClaims: un fallo aquí
  // puede cerrar sesiones de forma aleatoria.
  await supabase.auth.getClaims();

  return response;
}
