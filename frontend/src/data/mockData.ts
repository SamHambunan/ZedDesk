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

