import React, { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto rounded-lg border border-border-subtle bg-surface-panel">
      <table
        ref={ref}
        className={cn('w-full caption-bottom text-xs text-on-surface border-collapse', className)}
        {...props}
      />
    </div>
  )
)
Table.displayName = 'Table'

export const TableHeader = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn('bg-surface-subpanel/50 border-b border-border-subtle', className)}
      {...props}
    />
  )
)
TableHeader.displayName = 'TableHeader'

export const TableBody = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn('divide-y divide-border-subtle [&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
)
TableBody.displayName = 'TableBody'

export const TableFooter = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn('border-t border-border-subtle bg-surface-subpanel font-medium text-on-surface', className)}
      {...props}
    />
  )
)
TableFooter.displayName = 'TableFooter'

export const TableRow = forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'h-10 transition-colors hover:bg-surface-container-high/60 border-b border-border-subtle data-[state=selected]:bg-surface-container-high',
        className
      )}
      {...props}
    />
  )
)
TableRow.displayName = 'TableRow'

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right'
}

export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, align = 'left', ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 px-4 align-middle text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider select-none',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className
      )}
      {...props}
    />
  )
)
TableHead.displayName = 'TableHead'

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean
  align?: 'left' | 'center' | 'right'
}

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, numeric = false, align, ...props }, ref) => {
    const alignment = align || (numeric ? 'right' : 'left')

    return (
      <td
        ref={ref}
        className={cn(
          'h-10 px-4 align-middle text-xs text-on-surface',
          numeric && 'tabular-nums font-mono',
          alignment === 'right' && 'text-right',
          alignment === 'center' && 'text-center',
          alignment === 'left' && 'text-left',
          className
        )}
        {...props}
      />
    )
  }
)
TableCell.displayName = 'TableCell'

export const TableCaption = forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption
      ref={ref}
      className={cn('mt-3 text-xs text-on-surface-variant', className)}
      {...props}
    />
  )
)
TableCaption.displayName = 'TableCaption'
