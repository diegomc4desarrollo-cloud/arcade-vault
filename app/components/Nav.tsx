"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { getUser, setUser as persistUser, subscribeUser } from "@/app/lib/session";

type NavSection = "home" | "biblioteca" | "salon" | "about" | "auth";

const getServerUserSnapshot = () => null;

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const user = useSyncExternalStore(subscribeUser, getUser, getServerUserSnapshot);

  const isActive = (section: NavSection) => {
    if (section === "home") return pathname === "/";
    if (section === "biblioteca") return pathname === "/juegos" || pathname.startsWith("/juegos/");
    if (section === "salon") return pathname === "/salon";
    if (section === "about") return pathname === "/acerca-de";
    return pathname === "/auth";
  };

  const close = () => setOpen(false);

  const handleSignOut = () => {
    persistUser(null);
  };

  return (
    <>
      <nav className="av-nav">
        <Link href="/" className="logo">
          <div className="logo-mark"></div>
          <div className="logo-text neon-cyan">
            ARCADE <span className="neon-magenta">VAULT</span>
          </div>
        </Link>
        <div className="links">
          <Link href="/" className={isActive("home") ? "active" : ""}>Inicio</Link>
          <Link href="/juegos" className={isActive("biblioteca") ? "active" : ""}>Biblioteca</Link>
          <Link href="/salon" className={isActive("salon") ? "active" : ""}>Salón de la Fama</Link>
          <Link href="/acerca-de" className={isActive("about") ? "active" : ""}>Acerca de</Link>
        </div>
        <div className="spacer"></div>
        <div className="coin-counter">
          <span className="coin"></span>
          <span>CRÉDITOS · 03</span>
        </div>
        {user ? (
          <button className="btn ghost auth-btn" onClick={handleSignOut}>{user.name} ▾</button>
        ) : (
          <Link href="/auth" className="btn auth-btn">Iniciar Sesión</Link>
        )}
        <button className="btn ghost hamburger" onClick={() => setOpen(true)} aria-label="Menú">≡</button>
      </nav>

      <div className={"av-mobile-backdrop" + (open ? " open" : "")} onClick={close}></div>
      <aside className={"av-mobile-panel" + (open ? " open" : "")}>
        <div className="pixel neon-cyan" style={{ fontSize: 11, marginBottom: 16 }}>MENÚ</div>
        <Link href="/" className={isActive("home") ? "active" : ""} onClick={close}>Inicio</Link>
        <Link href="/juegos" className={isActive("biblioteca") ? "active" : ""} onClick={close}>Biblioteca</Link>
        <Link href="/salon" className={isActive("salon") ? "active" : ""} onClick={close}>Salón de la Fama</Link>
        <Link href="/acerca-de" className={isActive("about") ? "active" : ""} onClick={close}>Acerca de</Link>
        <Link href="/auth" className={isActive("auth") ? "active" : ""} onClick={close}>
          {user ? "Cuenta" : "Iniciar Sesión"}
        </Link>
        <div style={{ flex: 1 }}></div>
        <div className="pixel" style={{ fontSize: 9, color: "var(--ink-faint)", letterSpacing: "0.16em" }}>
          CRÉDITOS · 03
        </div>
      </aside>
    </>
  );
}
