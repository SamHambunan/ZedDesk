import React from 'react'
import { InvitationCard, type InvitationCardProps } from './InvitationCard'

export type InvitationAcceptanceCardProps = InvitationCardProps

export const InvitationAcceptanceCard: React.FC<InvitationAcceptanceCardProps> = (props) => {
  return <InvitationCard {...props} />
}

InvitationAcceptanceCard.displayName = 'InvitationAcceptanceCard'

export default InvitationAcceptanceCard
