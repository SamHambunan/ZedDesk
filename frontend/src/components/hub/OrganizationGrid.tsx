import React from 'react'
import { Plus } from 'lucide-react'
import { OrganizationCard, type HubOrganizationItem } from './OrganizationCard'
import { hubContentData } from '../../data/mockData'

export interface OrganizationGridProps {
  readonly organizations: readonly HubOrganizationItem[]
  readonly isLoading?: boolean
  readonly onCreateNew?: () => void
  readonly onLaunch?: (org: HubOrganizationItem) => void
  readonly className?: string
}

export const OrganizationGrid: React.FC<OrganizationGridProps> = ({
  organizations,
  isLoading = false,
  onCreateNew,
  onLaunch,
  className = '',
}) => {
  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      <h1 className="font-headline-sm text-headline-sm text-text-primary font-semibold text-left">
        {hubContentData.organizations.title}
      </h1>

      <div className="flex flex-col gap-3">
        {isLoading ? (
          <div className="bg-surface-subpanel border border-border-subtle rounded-xl p-8 text-center text-text-secondary font-body-default">
            Loading workspaces...
          </div>
        ) : organizations.length === 0 ? (
          <div className="bg-surface-subpanel border border-border-subtle rounded-xl p-8 text-center text-text-secondary font-body-default">
            No workspaces found. Create your first organization below to get started.
          </div>
        ) : (
          organizations.map((org) => (
            <OrganizationCard
              key={org.id || org.slug}
              organization={org}
              onLaunch={onLaunch}
            />
          ))
        )}

        {/* Create New Button */}
        {onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            aria-label="+ Create New Organization"
            className="w-full bg-surface-panel border border-dashed border-border-prominent rounded-xl p-5 flex items-center justify-center gap-2 text-text-secondary hover:text-text-primary hover:border-accent-glow/50 hover:bg-surface-subpanel/50 transition-all mt-2 group cursor-pointer"
          >
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="font-title-md text-title-md font-medium">
              {hubContentData.organizations.createNew}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

export default OrganizationGrid
