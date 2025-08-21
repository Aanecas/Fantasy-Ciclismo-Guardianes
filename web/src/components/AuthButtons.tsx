"use client";
import { signIn, signOut, useSession } from "next-auth/react";

export default function AuthButtons() {
  const { data: session, status } = useSession();
  const loading = status === "loading";

  if (loading) return <button className="btn btn-secondary" disabled>Cargando…</button>;

  if (session?.user) {
    return (
      <div className="flex items-center gap-3">
        {session.user.image && (
          <img src={session.user.image} alt="avatar" className="w-8 h-8 rounded-full" />
        )}
        <span className="text-sm subtle">{session.user.name}</span>
        <button className="btn btn-ghost" onClick={() => signOut()}>Salir</button>
      </div>
    );
  }

  return (
    <button className="btn btn-primary" onClick={() => signIn("google")}>
      Entrar con Google
    </button>
  );
}
