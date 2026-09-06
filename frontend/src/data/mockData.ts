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
