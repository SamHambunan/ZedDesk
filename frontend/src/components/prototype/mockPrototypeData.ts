export interface PrototypeTeamCapacity {
  id: number
  name: string
  routingCategory: string
  capacityPercent: number
  capacityStatus: 'nominal' | 'warning' | 'critical'
  openTicketsCount: number
  slaNominalPercent: number
  assignedAgents: {
    id: number
    name: string
    initials: string
    role: 'admin' | 'agent'
    avatarBg: string
  }[]
  overflowCount: number
}

export interface PrototypeTriageTicket {
  id: number
  ticketNumber: string
  title: string
  customerEmail: string
  customerName: string
  urgency: 'P0' | 'P1' | 'P2' | 'P3'
  urgencyLabel: string
  urgencyColor: 'critical' | 'warning' | 'neutral'
  status: 'unassigned' | 'investigating' | 'awaiting_customer'
  timeAgo: string
  laneRecommendation: string
}

export interface PrototypePendingInvite {
  id: number
  email: string
  role: 'admin' | 'agent'
  expiresIn: string
  token: string
}

export interface PrototypeServiceHealth {
  name: string
  status: 'connected' | 'operational' | 'degraded'
  latency: string
  engine: string
}

export const PROTOTYPE_TEAMS: PrototypeTeamCapacity[] = [
  {
    id: 1,
    name: 'Tier-1 Support',
    routingCategory: 'Hardware, Auth & Ingestion',
    capacityPercent: 78,
    capacityStatus: 'warning',
    openTicketsCount: 14,
    slaNominalPercent: 99.2,
    assignedAgents: [
      { id: 101, name: 'Jane Doe', initials: 'JD', role: 'admin', avatarBg: 'bg-[#8B5CF6]/30 text-[#C4B5FD]' },
      { id: 102, name: 'Sam Chen', initials: 'SC', role: 'agent', avatarBg: 'bg-[#1E2026] text-[#8890A0]' },
      { id: 103, name: 'Alex Kim', initials: 'AK', role: 'agent', avatarBg: 'bg-[#1E2026] text-[#8890A0]' },
      { id: 104, name: 'Maya Lin', initials: 'ML', role: 'agent', avatarBg: 'bg-[#1E2026] text-[#8890A0]' },
    ],
    overflowCount: 2,
  },
  {
    id: 2,
    name: 'Billing & Operations',
    routingCategory: 'Invoicing, Subscriptions, Refunds',
    capacityPercent: 42,
    capacityStatus: 'nominal',
    openTicketsCount: 6,
    slaNominalPercent: 100,
    assignedAgents: [
      { id: 105, name: 'Tom Bradley', initials: 'TB', role: 'agent', avatarBg: 'bg-[#1E2026] text-[#8890A0]' },
      { id: 106, name: 'Elena Diaz', initials: 'ED', role: 'agent', avatarBg: 'bg-[#1E2026] text-[#8890A0]' },
    ],
    overflowCount: 0,
  },
  {
    id: 3,
    name: 'Critical Escalations',
    routingCategory: 'P0 Security, SAML & Core Infrastructure',
    capacityPercent: 92,
    capacityStatus: 'critical',
    openTicketsCount: 4,
    slaNominalPercent: 94.1,
    assignedAgents: [
      { id: 107, name: 'Sam Hambunan', initials: 'SH', role: 'admin', avatarBg: 'bg-[#8B5CF6]/30 text-[#C4B5FD]' },
      { id: 101, name: 'Jane Doe', initials: 'JD', role: 'admin', avatarBg: 'bg-[#8B5CF6]/30 text-[#C4B5FD]' },
      { id: 108, name: 'Riley Vance', initials: 'RV', role: 'agent', avatarBg: 'bg-[#1E2026] text-[#8890A0]' },
    ],
    overflowCount: 1,
  },
]

export const PROTOTYPE_TRIAGE_TICKETS: PrototypeTriageTicket[] = [
  {
    id: 1048,
    ticketNumber: '#1048',
    title: 'Cannot access SSO SAML gateway from London office',
    customerEmail: 'sarah.connor@acme.com',
    customerName: 'Sarah Connor',
    urgency: 'P0',
    urgencyLabel: 'Critical',
    urgencyColor: 'critical',
    status: 'unassigned',
    timeAgo: '3m ago',
    laneRecommendation: 'Critical Escalations',
  },
  {
    id: 1047,
    ticketNumber: '#1047',
    title: 'Invoice currency mismatch for enterprise seat expansion',
    customerEmail: 'billing-ops@corp.io',
    customerName: 'Marcus Wright',
    urgency: 'P1',
    urgencyLabel: 'High',
    urgencyColor: 'warning',
    status: 'unassigned',
    timeAgo: '14m ago',
    laneRecommendation: 'Billing & Operations',
  },
  {
    id: 1045,
    ticketNumber: '#1045',
    title: 'Password reset webhook delivery delayed beyond 15m',
    customerEmail: 'dev-team@client.net',
    customerName: 'Kyle Reese',
    urgency: 'P2',
    urgencyLabel: 'Normal',
    urgencyColor: 'neutral',
    status: 'unassigned',
    timeAgo: '29m ago',
    laneRecommendation: 'Tier-1 Support',
  },
  {
    id: 1041,
    ticketNumber: '#1041',
    title: 'Clarification regarding webhook signing secret rotation cadence',
    customerEmail: 'alex@partner.org',
    customerName: 'Alex Mercer',
    urgency: 'P3',
    urgencyLabel: 'Low',
    urgencyColor: 'neutral',
    status: 'unassigned',
    timeAgo: '1h ago',
    laneRecommendation: 'Tier-1 Support',
  },
]

export const PROTOTYPE_PENDING_INVITES: PrototypePendingInvite[] = [
  {
    id: 1,
    email: 'marcus.vance@acme.com',
    role: 'admin',
    expiresIn: '4 days',
    token: 'inv_vance_8829a',
  },
  {
    id: 2,
    email: 'elena.rostova@acme.com',
    role: 'agent',
    expiresIn: '6 days',
    token: 'inv_rostova_4120b',
  },
]

export const PROTOTYPE_SERVICES: PrototypeServiceHealth[] = [
  { name: 'PostgreSQL 16', status: 'connected', latency: '1.2ms', engine: 'Row-level multi-tenant DB' },
  { name: 'Redis 7 Cache', status: 'connected', latency: '0.4ms', engine: 'Session & queue store' },
  { name: 'API Gateway', status: 'operational', latency: '14ms', engine: 'PHP 8.4 / Laravel 11' },
]
