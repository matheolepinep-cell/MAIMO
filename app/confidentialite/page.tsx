import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-100 px-6 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-xl flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #0A0A0A, #0A0A0A)' }}
          >
            M
          </div>
          <span className="font-bold text-[#0A0A0A]">Maimoo</span>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0A0A0A] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Accueil
        </Link>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black text-[#0F172A] mb-2">Politique de confidentialité</h1>
        <p className="text-sm text-[#94A3B8] mb-10">Dernière mise à jour : juin 2026</p>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3">Données collectées</h2>
          <p className="text-[#334155] leading-relaxed mb-3">
            Dans le cadre de l&apos;utilisation du service Maimoo, nous collectons les données suivantes :
          </p>
          <ul className="list-disc pl-5 text-[#334155] space-y-1 leading-relaxed">
            <li>Adresse email et nom complet (inscription et identification)</li>
            <li>Notes, comptes-rendus et données clients saisies volontairement par l&apos;utilisateur</li>
            <li>Données de connexion (horodatage de session)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3">Finalité du traitement</h2>
          <p className="text-[#334155] leading-relaxed">
            Les données collectées sont utilisées exclusivement pour la fourniture du service Maimoo : authentification, stockage et restitution des informations clients, fonctionnalités de recherche et de collaboration en équipe.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3">Hébergement des données</h2>
          <p className="text-[#334155] leading-relaxed">
            Les données sont hébergées par <strong>Supabase</strong> sur des serveurs situés à <strong>Frankfurt, Allemagne</strong>, dans l&apos;Union Européenne. Ce traitement est conforme au Règlement Général sur la Protection des Données (RGPD).
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3">Durée de conservation</h2>
          <p className="text-[#334155] leading-relaxed">
            Vos données sont conservées aussi longtemps que votre compte est actif. Elles sont supprimées sur simple demande à <a href="mailto:contact@maimoo.fr" className="text-[#0A0A0A] hover:underline">contact@maimoo.fr</a>. En cas d&apos;inactivité prolongée, nous nous réservons le droit de supprimer les données après un préavis par email.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3">Vos droits</h2>
          <p className="text-[#334155] leading-relaxed mb-2">
            Conformément au RGPD, vous disposez des droits suivants sur vos données personnelles :
          </p>
          <ul className="list-disc pl-5 text-[#334155] space-y-1 leading-relaxed">
            <li>Droit d&apos;accès : obtenir une copie de vos données</li>
            <li>Droit de rectification : corriger des informations inexactes</li>
            <li>Droit à l&apos;effacement : demander la suppression de votre compte et de vos données</li>
            <li>Droit à la portabilité : recevoir vos données dans un format structuré</li>
          </ul>
          <p className="text-[#334155] mt-3">
            Pour exercer ces droits, contactez-nous à <a href="mailto:contact@maimoo.fr" className="text-[#0A0A0A] hover:underline">contact@maimoo.fr</a>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3">Partage des données</h2>
          <p className="text-[#334155] leading-relaxed">
            Maimoo ne vend, ne loue et ne partage aucune donnée personnelle à des tiers à des fins commerciales ou publicitaires.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[#0A0A0A] mb-3">Cookies</h2>
          <p className="text-[#334155] leading-relaxed">
            Maimoo utilise uniquement un cookie de session strictement nécessaire au fonctionnement de l&apos;authentification (Supabase Auth). Aucun cookie publicitaire, de pistage ou d&apos;analyse comportementale n&apos;est déposé sur votre appareil.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-100 px-6 py-6 text-center">
        <p className="text-xs text-[#94A3B8]">© 2026 Maimoo. Tous droits réservés.</p>
      </footer>
    </div>
  )
}
