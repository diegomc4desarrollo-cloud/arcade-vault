"use server";

import { headers } from "next/headers";
import { Resend } from "resend";
import { checkRateLimit } from "@/app/lib/rate-limit";

export type ContactResult =
  | { ok: true }
  | {
      ok: false;
      error: "validation" | "rate_limit" | "config" | "send";
      message: string;
    };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValid(name: string, email: string, message: string): boolean {
  if (!name || name.length > 100) return false;
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) return false;
  if (!message || message.length > 5000) return false;
  return true;
}

export async function enviarMensajeContacto(
  _prevState: ContactResult | null,
  formData: FormData,
): Promise<ContactResult> {
  // Honeypot: si viene relleno, es un bot. Fingimos éxito y no enviamos nada.
  if (String(formData.get("_gotcha") ?? "").trim()) {
    return { ok: true };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!isValid(name, email, message)) {
    return {
      ok: false,
      error: "validation",
      message:
        "Revisa los campos: nombre, correo y mensaje son obligatorios y el correo debe tener un formato válido.",
    };
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (!checkRateLimit(ip)) {
    return {
      ok: false,
      error: "rate_limit",
      message: "Demasiados envíos. Espera unos minutos e inténtalo de nuevo.",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL;

  if (!apiKey || !to) {
    console.error(
      "[contacto] Falta configuración: RESEND_API_KEY y/o CONTACT_TO_EMAIL.",
    );
    return {
      ok: false,
      error: "config",
      message: "El servicio de correo no está configurado. Inténtalo más tarde.",
    };
  }

  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: "Arcade Vault <onboarding@resend.dev>",
      to: [to],
      replyTo: email,
      subject: `Nuevo mensaje de contacto — ${name}`,
      text: `Nombre: ${name}\nCorreo: ${email}\n\n${message}`,
    });

    if (error) {
      console.error("[contacto] Error de Resend:", error);
      return {
        ok: false,
        error: "send",
        message: "No se pudo enviar el mensaje. Inténtalo de nuevo.",
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("[contacto] Excepción al enviar:", err);
    return {
      ok: false,
      error: "send",
      message: "No se pudo enviar el mensaje. Inténtalo de nuevo.",
    };
  }
}
