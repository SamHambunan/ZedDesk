import React from 'react'
import type {
  TicketItem,
  TicketCustomer,
  PresetFilter,
} from './types'
import {
  MOCK_TEAMS,
  MOCK_MEMBERS,
  MOCK_TAGS_POOL,
} from './mockData'
import { TicketCockpit } from './TicketCockpit'

export type { TicketCustomer }

export interface TicketQueueViewProps {
  readonly apiUrl?: string
  readonly token?: string | null
  readonly userRole?: 'admin' | 'agent'
  readonly currentUserId?: number
  readonly tickets?: readonly TicketItem[]
  readonly initialTicketNumber?: number | string
  readonly initialPreset?: PresetFilter
}

export const TicketQueueView: React.FC<TicketQueueViewProps> = ({
  apiUrl,
  token,
  userRole = 'agent',
  currentUserId = 2,
  tickets,
  initialTicketNumber,
  initialPreset,
}) => {
  return (
    <div
      data-testid="tickets-queue-view"
      className="w-full h-full flex flex-col relative select-text"
    >
      <TicketCockpit.Provider
        apiUrl={apiUrl}
        token={token}
        tickets={tickets}
        teams={MOCK_TEAMS}
        members={MOCK_MEMBERS}
        allTags={MOCK_TAGS_POOL}
        currentUserId={currentUserId}
        userRole={userRole}
        initialTicketNumber={initialTicketNumber}
        initialPreset={initialPreset}
      >
        <TicketCockpit.Frame>
          <TicketCockpit.SubRail />
          <TicketCockpit.Queue />
          <TicketCockpit.Detail />
          <TicketCockpit.Inspector />
        </TicketCockpit.Frame>
      </TicketCockpit.Provider>
    </div>
  )
}

export default TicketQueueView

