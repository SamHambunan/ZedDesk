// Shared types for the Public Invitation Acceptance module

export interface PublicInvitationData {
  readonly email: string
  readonly role: 'admin' | 'agent' | string
  readonly organization_name: string
  readonly organization_slug: string
  readonly expires_at: string
  readonly token?: string
  readonly status?: string
}

export interface AuthenticatedUser {
  readonly id: number
  readonly name: string
  readonly email: string
}

export interface AcceptSuccessData {
  readonly organizationName: string
  readonly role: string
  readonly slug: string
}
