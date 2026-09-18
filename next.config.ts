import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite probar el servidor de desarrollo desde otros dispositivos de la
  // misma red local (móvil, tablet) sin el bloqueo cross-origin por defecto.
  allowedDevOrigins: ["192.168.0.*"],
  // El indicador de Next.js se posiciona por defecto abajo-a-la-izquierda,
  // justo donde Arena Z muestra el arma/munición (az-hud-bl), y lo tapa.
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
