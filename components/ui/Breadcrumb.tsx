'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  href?: string
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-slate-400 mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-[#2563EB] transition-colors duration-150 font-medium"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-[#0F172A] font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
