// Shared types for the Teams & Routing module

export interface TeamMemberUser {
  id: number
  name: string
  email: string
}

export interface TeamMember {
  id: number
  organization_id: number
  user_id: number
  role: string
  user?: TeamMemberUser | null
}

export interface Team {
  id: number
  organization_id: number
  name: string
  description: string | null
  created_at?: string
  updated_at?: string
  members: TeamMember[]
}

export interface OrganizationMember {
  id: number
  organization_id: number
  user_id: number
  role: string
  user?: TeamMemberUser | null
}
