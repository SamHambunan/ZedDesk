export interface AuthContentData {
  readonly brand: {
    readonly name: string
    readonly subtitle: string
  }
  readonly tabs: {
    readonly signin: string
    readonly signup: string
  }
  readonly signin: {
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly passwordLabel: string
    readonly passwordPlaceholder: string
    readonly submitText: string
    readonly submittingText: string
  }
  readonly signup: {
    readonly nameLabel: string
    readonly namePlaceholder: string
    readonly emailLabel: string
    readonly emailPlaceholder: string
    readonly passwordLabel: string
    readonly passwordPlaceholder: string
    readonly confirmPasswordLabel: string
    readonly confirmPasswordPlaceholder: string
    readonly submitText: string
    readonly submittingText: string
  }
  readonly footer: {
    readonly sessionSecurity: string
    readonly architectureNote: string
    readonly routingNote: string
  }
}

export const authContentData: AuthContentData = {
  brand: {
    name: 'ZedDesk',
    subtitle: 'Multi-tenant AI-Powered Helpdesk',
  },
  tabs: {
    signin: 'Sign In',
    signup: 'Create Account',
  },
  signin: {
    emailLabel: 'Email',
    emailPlaceholder: 'admin@domain.com',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••••••',
    submitText: 'Sign In to Central Hub',
    submittingText: 'Signing in...',
  },
  signup: {
    nameLabel: 'Name',
    namePlaceholder: 'Jane Doe',
    emailLabel: 'Email',
    emailPlaceholder: 'jane@company.com',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Min 8 characters',
    confirmPasswordLabel: 'Confirm Password',
    confirmPasswordPlaceholder: 'Verify password',
    submitText: 'Register',
    submittingText: 'Registering...',
  },
  footer: {
    sessionSecurity: 'Laravel Sanctum Encrypted Session',
    architectureNote: 'Adhering to ADR-0002 for decoupled identities across multi-tenant infrastructures.',
    routingNote: 'Row-level database scoping & subdomain routing ({org}.zeddesk.app)',
  },
}

export interface HubContentData {
  readonly brand: {
    readonly name: string
    readonly badge: string
  }
  readonly telemetry: {
    readonly operational: string
    readonly degraded: string
    readonly down: string
  }
  readonly nav: {
    readonly docs: string
    readonly help: string
  }
  readonly organizations: {
    readonly title: string
    readonly agentsLabel: string
    readonly launchWorkspace: string
    readonly createNew: string
  }
  readonly profile: {
    readonly defaultAvatarUrl: string
    readonly accountSettings: string
    readonly billingPlans: string
    readonly logout: string
  }
  readonly invitations: {
    readonly title: string
    readonly accept: string
    readonly decline: string
  }
}

export interface CreateOrganizationModalData {
  readonly title: string
  readonly orgNameLabel: string
  readonly orgNamePlaceholder: string
  readonly subdomainLabel: string
  readonly subdomainSuffix: string
  readonly subdomainPlaceholder: string
  readonly previewProtocol: string
  readonly previewPlaceholderDomain: string
  readonly validSubdomainMessage: string
  readonly invalidSubdomainMessage: string
  readonly reservedSubdomainMessage: string
  readonly minLengthMessage: string
  readonly infoCallout: {
    readonly title: string
    readonly role: string
    readonly prefix: string
    readonly suffix: string
  }
  readonly cancelButton: string
  readonly submitButton: string
  readonly submittingButton: string
  readonly reservedSlugs: readonly string[]
}

export const createOrgModalData: CreateOrganizationModalData = {
  title: 'Create New Organization',
  orgNameLabel: 'Organization Name',
  orgNamePlaceholder: 'Enter company or team name',
  subdomainLabel: 'Workspace Subdomain URL',
  subdomainSuffix: '.zeddesk.app',
  subdomainPlaceholder: 'acmecorp',
  previewProtocol: 'https://',
  previewPlaceholderDomain: 'https://[slug].zeddesk.app',
  validSubdomainMessage: 'Subdomain is valid and available',
  invalidSubdomainMessage: 'Subdomain can only contain lowercase alphanumeric characters and hyphens',
  reservedSubdomainMessage: 'This subdomain is reserved by the system',
  minLengthMessage: 'Subdomain must be at least 3 characters',
  infoCallout: {
    title: 'Admin Role Assignment',
    role: 'Owner',
    prefix: 'As the creator of this organization, you will automatically be assigned the ',
    suffix: ' role. You can invite team members and configure SSO after creation.',
  },
  cancelButton: 'Cancel',
  submitButton: 'Create Organization & Launch',
  submittingButton: 'Creating Organization...',
  reservedSlugs: [
    'api', 'admin', 'www', 'central', 'app', 'support', 'mail', 'billing',
    'help', 'test', 'dashboard', 'login', 'register', 'status', 'docs',
    'assets', 'static', 'cdn', 'auth', 'account', 'portal',
  ],
}

export const hubContentData: HubContentData = {
  brand: {
    name: 'ZedDesk',
    badge: 'AI',
  },
  telemetry: {
    operational: 'All Systems Operational',
    degraded: 'Systems Degraded',
    down: 'Systems Offline',
  },
  nav: {
    docs: 'Docs',
    help: 'Help',
  },
  organizations: {
    title: 'Your Organizations & Workspaces',
    agentsLabel: 'Agents',
    launchWorkspace: 'Launch Workspace',
    createNew: 'Create New Organization',
  },
  profile: {
    defaultAvatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDOPcEppQ7Ix_FTF35p0pkFKhPM0cTWkQ6ndLk35CFTizlCHq6AHCS-KTZOBbbRO2UDq-ruDk7lqqOE5delOtrzQ3mnCgRSLeF5oXfs-l0eu_3tNdhQPfgocTS1xFw4Mf75rDnekbEX59jsjr1yc-kUiKTHL_zAriFBgkdVHUu6K2pnXPsolRKHC3CDl-rXBQ7zvsr_-QJKiygHSjgSAD_1sKNiq4Z5DVjBBV1m7zVAIMlb32ckkfsCOjkon29qPVrLuGwFhE-RewM',
    accountSettings: 'Account Settings',
    billingPlans: 'Billing & Plans',
    logout: 'Log out',
  },
  invitations: {
    title: 'Invitation Pending',
    accept: 'Accept',
    decline: 'Decline',
  },
}

export interface WorkspaceActivityItem {
  readonly id: string | number
  readonly description: string
  readonly timestamp: string
  readonly highlight?: string
  readonly iconType: 'person' | 'group' | 'report' | 'default'
}

export interface WorkspaceShortcutTeam {
  readonly id: string | number
  readonly name: string
  readonly activeAgentsCount: number
  readonly openTicketsCount: number
  readonly iconType?: 'tier1' | 'billing' | 'custom'
}

export interface WorkspaceContentData {
  readonly brand: {
    readonly name: string
    readonly badge: string
    readonly searchPlaceholder: string
    readonly searchShortcut: string
    readonly copilotLabel: string
  }
  readonly nav: {
    readonly viewsTitle: string
    readonly overview: string
    readonly tickets: string
    readonly teams: string
    readonly invitations: string
    readonly knowledgeBase: string
    readonly settings: string
    readonly collapse: string
    readonly adminSectionTitle: string
    readonly orgSettings: string
    readonly teamManagement: string
  }
  readonly hero: {
    readonly title: string
    readonly inviteMember: string
  }
  readonly telemetry: {
    readonly totalMembers: string
    readonly totalMembersValue: string | number
    readonly totalMembersTrend: string
    readonly activeTeams: string
    readonly activeTeamsValue: string | number
    readonly openTickets: string
    readonly openTicketsValue: string | number
    readonly slaStatus: string
    readonly slaValue: string
  }
  readonly activity: {
    readonly title: string
    readonly items: readonly WorkspaceActivityItem[]
  }
  readonly routing: {
    readonly title: string
    readonly shortcuts: readonly WorkspaceShortcutTeam[]
    readonly pendingInvitationsLabel: string
    readonly pendingInvitationsCount: number
  }
  readonly errors: {
    readonly unauthenticatedTitle: string
    readonly unauthenticatedDesc: string
    readonly loginAtCentralHub: string
    readonly forbiddenTitle: string
    readonly forbiddenDesc: string
    readonly notFoundTitle: string
    readonly notFoundDesc: string
    readonly returnToCentralHub: string
  }
  readonly profile: {
    readonly defaultAvatarUrl: string
    readonly defaultOrgLogoUrl: string
  }
}

export const workspaceContentData: WorkspaceContentData = {
  brand: {
    name: 'ZedDesk',
    badge: 'AI',
    searchPlaceholder: 'Search...',
    searchShortcut: '⌘K',
    copilotLabel: 'AI Copilot',
  },
  nav: {
    viewsTitle: 'VIEWS',
    overview: 'Overview',
    tickets: 'Tickets Queue',
    teams: 'Teams & Routing',
    invitations: 'Members & Invites',
    knowledgeBase: 'Knowledge Base',
    settings: 'Settings',
    collapse: 'Collapse',
    adminSectionTitle: 'ADMINISTRATION',
    orgSettings: 'Organization Settings',
    teamManagement: 'Team Management',
  },
  hero: {
    title: 'Operational Overview',
    inviteMember: 'Invite Member',
  },
  telemetry: {
    totalMembers: 'Total Members',
    totalMembersValue: 14,
    totalMembersTrend: '+2 this week',
    activeTeams: 'Active Teams',
    activeTeamsValue: 3,
    openTickets: 'Open Tickets',
    openTicketsValue: 24,
    slaStatus: 'SLA Status',
    slaValue: '99.4%',
  },
  activity: {
    title: 'Recent Activity',
    items: [
      {
        id: '1',
        description: 'Sarah Jenkins joined the workspace.',
        timestamp: '2 hours ago',
        iconType: 'person',
      },
      {
        id: '2',
        description: 'Alex Chen assigned to',
        highlight: 'Support Tier 1',
        timestamp: '5 hours ago',
        iconType: 'group',
      },
      {
        id: '3',
        description: 'Weekly SLA report automatically generated.',
        timestamp: 'Yesterday at 18:00',
        iconType: 'report',
      },
    ],
  },
  routing: {
    title: 'Quick Routing',
    shortcuts: [
      {
        id: '1',
        name: 'Support Tier 1',
        activeAgentsCount: 12,
        openTicketsCount: 8,
        iconType: 'tier1',
      },
      {
        id: '2',
        name: 'Billing',
        activeAgentsCount: 4,
        openTicketsCount: 16,
        iconType: 'billing',
      },
    ],
    pendingInvitationsLabel: 'Pending Invitations',
    pendingInvitationsCount: 2,
  },
  errors: {
    unauthenticatedTitle: 'Authentication Required',
    unauthenticatedDesc: 'You must be logged in to access the workspace.',
    loginAtCentralHub: 'Log In at Central Hub',
    forbiddenTitle: 'Access Denied',
    forbiddenDesc: 'You are not an Organization Member of this Organization.',
    notFoundTitle: 'Organization Not Found',
    notFoundDesc: 'The organization subdomain does not exist.',
    returnToCentralHub: 'Return to Central Hub',
  },
  profile: {
    defaultAvatarUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBuDafyneHGqTh1IWuJutKIT5O59i6uRVcmEnhXbHvs6jvcjRDb5XeKeRpHd9weXzdAH9SVhVc50pouONbcN_1H8wVAABVV_Ndq6R4x9JmX3bGy2uFSX-67zPmdE6qrhcMxSgLmh-2AnlHVLk0Hb7_o9Bp2xr78rYK5QMmArNvsyrnmMNIFIIPlIZ8dxt9jQoantm7b8KiExsZpM8cwodgBY1yj0MY2PFY2ZDAMldacExFnKPmTejxZ_DuXHJV5j04M-Tw_0PSI-JE',
    defaultOrgLogoUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAEK6Rvz6oIKl6cPoSjZ0DlnsQOlUyikPZgYNYQjd-Lvk4MixqUs_0wl1L8VPaxpsN3-iib7sBoBXT0Ipk-4gXrWa285eAhGERIennj9-6F0CYqK-ZqTHihwJzjscDrskIPOV-juQmjkPIZJl81YNlkYSuApcJWTt7TY3Urlgfp5yB7CY3xBnA6uu5JPizEi5SOkt9RlAt9IZuhfMrupkGmP-qF524fdjpLi6mdYDqx2gTDOp7pyfmCjBXqL1N_89QybyemSeQsGfs',
  },
}


