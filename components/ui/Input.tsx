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
          <label htmlFor={id} className="text-sm font-medium text-[#0A0A0A]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={clsx(
            'w-full px-4 py-2.5 rounded-xl border text-[#0A0A0A] placeholder-[#9B9B9B] text-sm transition-all duration-150',
            'focus:outline-none focus:ring-[3px] focus:ring-[rgba(0,0,0,0.08)] focus:border-[#0A0A0A]',
            error ? 'border-red-400 bg-red-50' : 'border-[#E5E5E5] bg-white',
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
