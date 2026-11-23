/**
 * Moldura das telas de acesso (entrar, primeiro acesso, recuperar senha),
 * no mesmo desenho do Grupo S&C, com a identidade da FAV (preto + âmbar).
 * Computador: painel da marca à esquerda e formulário à direita.
 * Celular: faixa da marca no topo e formulário logo abaixo.
 */
const LOGO = "https://media.base44.com/images/public/69cd88dc480a9d07fa708c8a/18acf42f3_logo.png";
const FRASE_1 = "Cada boa inicial começa com um bom dia de trabalho.";
const FRASE_2 = "Que o seu seja ótimo!";

function Fundo() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[#0f0f0f]" />
      <div className="absolute inset-0 bg-[#1a1610]" style={{ clipPath: "polygon(58% 0,100% 0,100% 100%,40% 100%)" }} />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_47%,rgba(240,165,0,0.22)_50%,transparent_53%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_15%,rgba(240,165,0,0.18),transparent_45%)]" />
      <div className="absolute -right-16 -top-14 h-72 w-72 rounded-full border border-primary/20" />
      <div className="absolute right-6 top-8 h-36 w-36 rounded-full border border-primary/15" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_55%,rgba(0,0,0,0.6))]" />
    </div>
  );
}

function Marca({ compacto = false }) {
  const tam = compacto ? "h-20 w-20" : "h-28 w-28 xl:h-32 xl:w-32";
  return (
    <div className="relative flex flex-col items-center">
      <div className="absolute top-0 h-44 w-44 -translate-y-6 rounded-full bg-[radial-gradient(circle,rgba(240,165,0,0.28),transparent_70%)]" />
      <span className={`relative overflow-hidden rounded-[1.6rem] bg-white ring-4 ring-white shadow-2xl shadow-black/50 ${tam}`}>
        <img src={LOGO} alt="FAV Advogados" className="h-full w-full object-contain p-2" />
      </span>
      <div className={`relative text-center ${compacto ? "mt-3" : "mt-5"}`}>
        <div className={`flex items-baseline justify-center gap-2 font-semibold text-white ${compacto ? "text-3xl" : "text-5xl"}`}>
          FAV<span className={`inline-block rounded-full bg-primary ${compacto ? "h-2 w-2" : "h-3 w-3"}`} />
        </div>
        <div className={`uppercase text-white/70 ${compacto ? "text-[11px] tracking-[0.3em]" : "text-sm tracking-[0.34em]"} mt-1`}>Petições</div>
      </div>
    </div>
  );
}

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen bg-white text-foreground lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
        <Fundo />
        <div className="relative flex items-center justify-end">
          <span className="text-xs uppercase tracking-[0.2em] text-white/60">Sistema de iniciais trabalhistas</span>
        </div>
        <div className="relative py-6"><Marca /></div>
        <div className="relative max-w-xl">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">{FRASE_1}</h2>
          <p className="mt-2 text-lg font-medium text-primary xl:text-xl">{FRASE_2}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-primary" />FAV Advogados · trabalhista
            </span>
          </div>
        </div>
      </aside>

      <header className="relative overflow-hidden px-6 pb-8 pt-7 text-center text-white lg:hidden">
        <Fundo />
        <div className="relative mb-6"><Marca compacto /></div>
        <p className="relative text-lg font-semibold leading-snug">{FRASE_1}</p>
        <p className="relative mt-1 text-sm font-medium text-primary">{FRASE_2}</p>
      </header>

      <main className="flex flex-col bg-white px-6 py-10 sm:px-10 lg:min-h-screen lg:py-12">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <div className="mb-8">
            {Icon && (
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary-ink">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-[#111] sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <div className="[&_button[type=submit]]:bg-primary [&_button[type=submit]]:text-[#111] [&_button[type=submit]]:shadow-lg [&_button[type=submit]]:shadow-amber-500/20 [&_button[type=submit]:hover]:opacity-95 [&_input]:rounded-xl [&_input]:border-slate-300 [&_input]:bg-white [&_input]:text-slate-900 [&_input:focus-visible]:border-primary [&_input:focus-visible]:ring-[3px] [&_input:focus-visible]:ring-primary/25 [&_input:focus-visible]:ring-offset-0 [&_label]:text-slate-700 [&_a]:text-primary-ink">
            {children}
          </div>
          {footer && (
            <p className="mt-8 text-center text-sm text-slate-400 [&_a]:!text-primary-ink [&_a]:font-medium">{footer}</p>
          )}
        </div>
        <p className="mt-10 text-center text-xs text-slate-300">© {new Date().getFullYear()} FAV Advogados</p>
      </main>
    </div>
  );
}
