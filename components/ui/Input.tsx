import { type InputHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-[#0F172A]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={clsx(
            'w-full px-4 py-2.5 rounded-xl border text-[#0F172A] placeholder-[#94A3B8] text-sm transition-all duration-150',
            'focus:outline-none focus:ring-[3px] focus:ring-[rgba(76,110,245,0.15)] focus:border-[#4C6EF5]',
            error ? 'border-red-400 bg-red-50' : 'border-[rgba(30,39,97,0.12)] bg-[rgba(240,244,255,0.8)]',
            className
          )}
          {...props}
        />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    )
  }
)

Input.displayName = 'Input'
