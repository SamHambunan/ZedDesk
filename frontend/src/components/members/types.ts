// Shared types for the Members & Invitations module

export interface MemberUser {
  readonly id: number
  readonly name: string
  readonly email: string
  readonly avatar_url?: string | null
}

export interface Member {
  readonly id: number
  readonly organization_id: number
  readonly user_id: number
  readonly role: 'admin' | 'agent' | string
  readonly user?: MemberUser | null
  readonly teams?: string[]
  readonly joined_date?: string
  readonly status?: 'online' | 'offline'
}

export interface PendingInvitation {
  readonly id: number
  readonly email: string
  readonly role: 'admin' | 'agent' | string
  readonly token: string
  readonly expires_at: string
  readonly created_at?: string
  readonly invited_by?: {
    readonly id: number
    readonly name: string
    readonly email: string
  } | null
}
