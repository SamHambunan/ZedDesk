import React from 'react'
import { UserPlus, Users, CheckCircle2, Activity } from 'lucide-react'
import type { WorkspaceActivityItem } from '../../data/mockData'

export interface RecentActivityFeedProps {
  readonly title?: string
  readonly activities?: readonly WorkspaceActivityItem[]
  readonly testId?: string
  readonly className?: string
}

export const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({
  title = 'Recent Activity',
  activities = [],
  testId = 'recent-activity-feed',
  className = '',
}) => {
  const renderIcon = (type: WorkspaceActivityItem['iconType']) => {
    switch (type) {
      case 'person':
        return <UserPlus className="w-3 h-3 text-text-secondary" />
      case 'group':
        return <Users className="w-3 h-3 text-accent-glow" />
      case 'report':
        return <CheckCircle2 className="w-3 h-3 text-sentiment-positive" />
      default:
        return <Activity className="w-3 h-3 text-text-secondary" />
    }
  }

  return (
    <div
      data-testid={testId}
      className={`bg-surface-subpanel rounded-xl border border-border-subtle shadow-keylight p-6 flex flex-col h-[400px] ${className}`}
    >
      <h2 className="text-title-md font-title-md text-text-primary mb-4 font-semibold">
        {title}
      </h2>

      <div className="flex-1 overflow-y-auto pr-2 space-y-4">
        {activities.map((item, index) => {
          const isLast = index === activities.length - 1

          return (
            <div key={item.id} className="flex gap-4 relative">
              {/* Timeline Connecting Line */}
              {!isLast && (
                <div
                  aria-hidden="true"
                  className="absolute left-[11px] top-6 bottom-[-16px] w-[1px] bg-border-prominent"
                />
              )}

              {/* Node Icon */}
              <div className="w-6 h-6 rounded-full bg-surface-container-high border border-border-subtle z-10 flex items-center justify-center shrink-0">
                {renderIcon(item.iconType)}
              </div>

              {/* Content */}
              <div className="pb-2">
                <p className="text-body-default font-body-default text-text-primary">
                  {item.description}
                  {item.highlight && (
                    <>
                      {' '}
                      <span className="text-accent-glow font-mono-data text-[12px] bg-accent-glow/10 px-1 py-0.5 rounded">
                        {item.highlight}
                      </span>
                    </>
                  )}
                </p>
                <p className="text-body-compact font-body-compact text-text-muted mt-0.5">
                  {item.timestamp}
                </p>
              </div>
            </div>
          )
        })}

        {activities.length === 0 && (
          <p className="text-body-compact text-text-muted italic py-4">No recent activity</p>
        )}
      </div>
    </div>
  )
}

export default RecentActivityFeed
