// Next.js 16: el antiguo middleware.ts se llama ahora proxy.ts.
// Refresca la sesión de Supabase en cada navegación.

import { type NextRequest } from "next/server";
import { updateSession } from "@/app/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todas las rutas salvo estáticos, optimización de imágenes, favicon
    // y ficheros de imagen.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
