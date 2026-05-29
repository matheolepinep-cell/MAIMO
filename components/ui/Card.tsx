import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white rounded-2xl border p-4 transition-all duration-200',
        onClick && 'cursor-pointer hover:-translate-y-0.5 active:scale-[0.99]',
        className
      )}
      style={{
        borderColor: 'rgba(30,39,97,0.08)',
        boxShadow: onClick
          ? '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.06)'
          : '0 1px 3px rgba(30,39,97,0.06)',
      }}
      onMouseEnter={onClick ? (e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(30,39,97,0.10), 0 8px 24px rgba(30,39,97,0.08)'
      } : undefined}
      onMouseLeave={onClick ? (e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(30,39,97,0.06), 0 4px 16px rgba(30,39,97,0.06)'
      } : undefined}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
