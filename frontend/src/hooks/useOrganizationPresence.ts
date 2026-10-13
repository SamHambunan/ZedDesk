import { useState, useEffect } from 'react'
import type { ILiveClient, PresenceMember } from '../lib/live-client'

/**
 * Subscribes to live organization presence when not already provided via props.
 * Defer/skip subscriptions when explicit propOnlineMembers are provided to prevent redundant renders.
 */
export function useOrganizationPresence(
  liveClient?: ILiveClient,
  propOnlineMembers?: readonly PresenceMember[]
): readonly PresenceMember[] {
  const [liveOnlineMembers, setLiveOnlineMembers] = useState<readonly PresenceMember[]>([])
  const isPropProvided = propOnlineMembers !== undefined

  useEffect(() => {
    if (isPropProvided || !liveClient?.subscribeToOrganizationPresence) {
      setLiveOnlineMembers([])
      return
    }

    const unsub = liveClient.subscribeToOrganizationPresence((members) => {
      setLiveOnlineMembers(members)
    })

    return () => {
      unsub()
    }
  }, [liveClient, isPropProvided])

  return propOnlineMembers ?? liveOnlineMembers
}
