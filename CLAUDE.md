# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Antes de escribir código

Este proyecto usa **Next.js 16**, una versión con cambios importantes respecto a versiones anteriores. Antes de tocar cualquier archivo bajo `app/`, lee la guía relevante en `node_modules/next/dist/docs/` (`01-app/` para App Router, `03-architecture/` para temas transversales) y respeta los avisos de deprecación. No asumas patrones de Next.js de versiones anteriores basándote solo en conocimiento previo.

## Comandos

- `npm run dev` — servidor de desarrollo
- `npm run build` — build de producción
- `npm run start` — servidor de producción (requiere build previo)
- `npm run lint` — ESLint (flat config en `eslint.config.mjs`, basado en `eslint-config-next`)

No hay suite de tests configurada todavía.

## Arquitectura

Arcade Vault es una plataforma para jugar arcades online y competir por puntuación, construida con Next.js App Router (`app/`), React 19 y Tailwind CSS v4 (vía `@tailwindcss/postcss`, sin `tailwind.config`).

El estado actual de `app/` es el boilerplate por defecto de `create-next-app` — la implementación real todavía no existe.

### `resources/templates/` — referencia de diseño, no código de producción

Esta carpeta contiene un **prototipo HTML autocontenido** (`Arcade Vault.html` + varios `.jsx`) que sirve como referencia visual/funcional de lo que debe construirse en `app/`. Es standalone: carga React, ReactDOM y Babel vía CDN (`unpkg`) y transpila los `.jsx` en el navegador con `<script type="text/babel">` — **no se integra con el build de Next.js ni debe importarse desde `app/`**. Úsalo solo como referencia de diseño (paleta neón/retro, componentes, textos en español) al reimplementar cada pantalla como Server/Client Components de Next.js.

Pantallas cubiertas por el prototipo (mapean a rutas a crear en `app/`):

- `nav.jsx` — navegación global (biblioteca, salón de la fama, login, menú móvil)
- `biblioteca.jsx` — listado/catálogo de juegos con filtro por categoría
- `detalle.jsx` — ficha de detalle de un juego
- `reproductor.jsx` — pantalla del reproductor/juego en sí
- `auth.jsx` — inicio de sesión
- `salon.jsx` — salón de la fama (rankings)
- `data.jsx` — datos mock compartidos: catálogo de juegos (`GAMES`), categorías (`CATS`) y generador de puntuaciones simuladas (`seededScores`)
- `app.jsx` — router a mano basado en `location.hash` (solo referencia; en Next.js esto se reemplaza por el App Router real) y persistencia de sesión/puntuaciones en `localStorage`

### Flujo de desarrollo dirigido por especificación

El README indica que el proyecto sigue Spec Driven Design usando los skills de [Klerith/fernando-skills](https://github.com/Klerith/fernando-skills) (`/spec` y `/spec-impl`), instalables con `npx skills@latest add Klerith/fernando-skills`. Si esos comandos están disponibles, prioriza pasar por `/spec` antes de implementar funcionalidad nueva.
