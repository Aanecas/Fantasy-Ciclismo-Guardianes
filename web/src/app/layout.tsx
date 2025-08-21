import "./globals.css";
import Providers from "@/components/Providers";
import AuthButtons from "@/components/AuthButtons";

export const metadata = { title: "Fantasy Ciclismo Guardianes" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <Providers>
          <header className="navbar">
            <nav className="container flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-soft" />
                <span className="font-semibold">Fantasy Ciclismo Guardianes</span>
              </div>
              <div className="flex items-center gap-2">
                <a className="btn btn-ghost" href="/clasificacion">Clasificación</a>
                <a className="btn btn-ghost" href="/mi-equipo">Mi equipo</a>
                <AuthButtons />
              </div>
            </nav>
          </header>
          <main className="container py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
