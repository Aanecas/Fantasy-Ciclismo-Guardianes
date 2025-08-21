export default function Home() {
  return (
    <section className="relative">
      <div className="absolute inset-0 -z-10 bg-brand-soft" />
      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-4">
          <h1 className="h1">Juega la Vuelta con estilo</h1>
          <p className="subtle">
            Accede con Google y sincronizaremos tu cuenta en la hoja.
          </p>
          <div className="flex gap-3">
            <a className="btn btn-primary" href="/mi-equipo">
              Ir a Mi equipo
            </a>
            <a className="btn btn-ghost" href="/reglas">
              Reglas
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
