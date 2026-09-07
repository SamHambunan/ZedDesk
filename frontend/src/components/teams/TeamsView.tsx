import React from 'react'
import type { Team } from './types'
import { TeamCard } from './TeamCard'

export interface TeamsViewProps {
  readonly teams: Team[]
  readonly isLoading?: boolean
  readonly error?: string | null
}

export const TeamsView: React.FC<TeamsViewProps> = ({
  teams,
  isLoading = false,
  error,
}) => {
  return (
    <div data-testid="teams-view" className="flex flex-col gap-6">
      {/* View Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-5 border-b border-border-subtle">
        <div>
          <h2 className="text-headline-md font-headline-md text-text-primary">
            Teams &amp; Routing
          </h2>
          <p className="text-body-default font-body-default text-text-secondary mt-1">
            Functional teams for ticket routing and agent collaboration.
          </p>
        </div>
        <span className="text-label-caps font-label-caps uppercase px-3 py-1 rounded-full border border-sentiment-positive/30 bg-sentiment-positive/10 text-sentiment-positive">
          Agent View — Read-Only
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent-glow border-t-transparent rounded-full animate-spin" />
            <span className="text-body-default text-text-secondary">Loading teams...</span>
          </div>
        </div>
      ) : error ? (
        <div className="px-4 py-3 bg-sentiment-negative/10 border border-sentiment-negative/30 rounded-lg text-sentiment-negative text-body-default font-body-default">
          {error}
        </div>
      ) : teams.length === 0 ? (
        <div
          data-testid="no-teams-message"
          className="flex flex-col items-center justify-center py-16 text-text-muted"
        >
          <p className="text-body-default">No teams configured in this organization.</p>
        </div>
      ) : (
        <div data-testid="teams-list" className="flex flex-col gap-4">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              isAdmin={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default TeamsView
