'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, style, children, ...props }, ref) => {
    const primaryStyle = variant === 'primary' ? {
      background: '#0A0A0A',
      ...style,
    } : style

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        style={primaryStyle}
        className={clsx(
          'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'text-white hover:opacity-90 active:scale-[0.98]': variant === 'primary',
            'bg-white text-[#0A0A0A] border border-[#E5E5E5] hover:bg-[#F5F5F5] active:scale-[0.98]': variant === 'secondary',
            'text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#F5F5F5] active:scale-[0.98]': variant === 'ghost',
            'bg-[#DC2626] text-white hover:bg-[#B91C1C] active:scale-[0.98]': variant === 'danger',
          },
          {
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-4 py-2.5 text-sm': size === 'md',
            'px-6 py-3 text-base': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {children}
          </span>
        ) : children}
      </button>
    )
  }
)

Button.displayName = 'Button'
