'use client'

import { use } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { CheckCircle2, Users, FileText, ArrowRight, Upload } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { Button } from '@/components/ui/Button'

function DonePageContent({ id }: { id: string }) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const created = Number(searchParams.get('created') ?? 0)
  const skipped = Number(searchParams.get('skipped') ?? 0)
  const contacts = Number(searchParams.get('contacts') ?? 0)
  const notes = Number(searchParams.get('notes') ?? 0)

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Import terminé" />
      <div className="flex-1 p-4 md:p-8 max-w-2xl mx-auto w-full">

        <Breadcrumb items={[
          { label: 'MAIMO', href: '/app/dashboard' },
          { label: 'Import Excel', href: '/app/import' },
          { label: 'Terminé' },
        ]} />

        {/* Success icon */}
        <div className="flex flex-col items-center py-10 text-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
            style={{ background: 'linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)', boxShadow: '0 0 0 8px rgba(16,185,129,0.08)' }}
          >
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight mb-2">Import réussi !</h1>
          <p className="text-slate-500 text-sm">
            Vos comptes ont été créés et indexés pour la recherche IA.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div
            className="rounded-2xl p-5 flex flex-col gap-1"
            style={{ background: 'white', border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 2px 8px rgba(30,39,97,0.06)' }}
          >
            <span className="text-3xl font-bold text-[#1E2761]">{created}</span>
            <span className="text-xs text-slate-500 font-medium">Entreprises créées</span>
          </div>

          <div
            className="rounded-2xl p-5 flex flex-col gap-1"
            style={{ background: 'white', border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 2px 8px rgba(30,39,97,0.06)' }}
          >
            <span className="text-3xl font-bold text-slate-400">{skipped}</span>
            <span className="text-xs text-slate-500 font-medium">Ignorées (doublons)</span>
          </div>

          <div
            className="rounded-2xl p-5 flex flex-col gap-1"
            style={{ background: 'white', border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 2px 8px rgba(30,39,97,0.06)' }}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <Users className="w-4 h-4 text-[#4C6EF5]" />
              <span className="text-3xl font-bold text-[#1E2761]">{contacts}</span>
            </div>
            <span className="text-xs text-slate-500 font-medium">Contacts créés</span>
          </div>

          <div
            className="rounded-2xl p-5 flex flex-col gap-1"
            style={{ background: 'white', border: '1px solid rgba(30,39,97,0.08)', boxShadow: '0 2px 8px rgba(30,39,97,0.06)' }}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <FileText className="w-4 h-4 text-[#4C6EF5]" />
              <span className="text-3xl font-bold text-[#1E2761]">{notes}</span>
            </div>
            <span className="text-xs text-slate-500 font-medium">Notes générées</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={() => router.push('/app/portfolio')}
            size="lg"
            className="w-full"
          >
            Voir mon portefeuille
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>

          <Button
            onClick={() => router.push('/app/import')}
            variant="ghost"
            size="lg"
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            Importer un autre fichier
          </Button>
        </div>

      </div>
    </div>
  )
}

export default function DonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={null}>
      <DonePageContent id={id} />
    </Suspense>
  )
}
