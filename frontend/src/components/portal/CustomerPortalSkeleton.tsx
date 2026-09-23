import React from 'react'

export const CustomerPortalSkeleton: React.FC = () => {
  return (
    <div data-testid="portal-skeleton" className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="border-b border-border-subtle pb-5 space-y-2">
        <div className="h-7 w-64 bg-surface-container-high rounded" />
        <div className="h-4 w-96 bg-surface-container rounded" />
      </div>

      {/* Form Fields skeleton */}
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 bg-surface-container rounded" />
            <div className="h-10 w-full bg-surface-subpanel rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 bg-surface-container rounded" />
            <div className="h-10 w-full bg-surface-subpanel rounded-lg" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <div className="h-3.5 w-20 bg-surface-container rounded" />
            <div className="h-10 w-full bg-surface-subpanel rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3.5 w-16 bg-surface-container rounded" />
            <div className="h-10 w-full bg-surface-subpanel rounded-lg" />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="h-3.5 w-32 bg-surface-container rounded" />
          <div className="h-28 w-full bg-surface-subpanel rounded-lg" />
        </div>

        {/* Dropzone skeleton */}
        <div className="h-24 w-full bg-surface-canvas/50 border border-dashed border-border-prominent rounded-lg" />

        {/* Button skeleton */}
        <div className="h-11 w-full bg-surface-container-high rounded-lg" />
      </div>
    </div>
  )
}
