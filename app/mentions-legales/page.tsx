import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function MentionsLegalesPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-100 px-6 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-xl flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #1E2761, #3B5BDB)' }}
          >
            M
          </div>
          <span className="font-bold text-[#1E2761]">Maimoo</span>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#1E2761] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Accueil
        </Link>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black text-[#0F172A] mb-2">Mentions légales</h1>
        <p className="text-sm text-[#94A3B8] mb-10">Dernière mise à jour : juin 2026</p>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#1E2761] mb-3">Éditeur du site</h2>
          <p className="text-[#334155] leading-relaxed">
            <strong>Maimoo</strong><br />
            Représentant : Mathéo Lépine<br />
            63 avenue Raymond Poincaré<br />
            75016 Paris, France<br />
            Email : <a href="mailto:contact@maimoo.fr" className="text-[#3B5BDB] hover:underline">contact@maimoo.fr</a>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#1E2761] mb-3">Directeur de la publication</h2>
          <p className="text-[#334155] leading-relaxed">Mathéo Lépine</p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#1E2761] mb-3">Hébergeur</h2>
          <p className="text-[#334155] leading-relaxed">
            <strong>Vercel Inc.</strong><br />
            340 Pine Street, Suite 701<br />
            San Francisco, CA 94104<br />
            États-Unis<br />
            <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-[#3B5BDB] hover:underline">vercel.com</a>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#1E2761] mb-3">Propriété intellectuelle</h2>
          <p className="text-[#334155] leading-relaxed">
            L&apos;ensemble des contenus présents sur le site Maimoo (textes, graphismes, logos) est la propriété exclusive de Maimoo et est protégé par les lois françaises et internationales relatives à la propriété intellectuelle.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#1E2761] mb-3">Responsabilité</h2>
          <p className="text-[#334155] leading-relaxed">
            Maimoo s&apos;efforce de maintenir les informations accessibles à jour. Toutefois, la responsabilité de Maimoo ne saurait être engagée en cas d&apos;erreur ou d&apos;omission dans les informations diffusées sur ce site.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-100 px-6 py-6 text-center">
        <p className="text-xs text-[#94A3B8]">© 2026 Maimoo. Tous droits réservés.</p>
      </footer>
    </div>
  )
}
