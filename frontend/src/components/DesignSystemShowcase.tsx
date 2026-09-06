import { useState } from 'react'
import {
  Button,
  Input,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Modal,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui'
import { Search, Shield } from 'lucide-react'

export function DesignSystemShowcase({ onBack }: { onBack?: () => void }) {
  const [clickCount, setClickCount] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoadingBtn, setIsLoadingBtn] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')

  return (
    <div className="min-h-screen bg-surface-canvas text-on-surface p-6 md:p-12 font-sans flex flex-col items-center">
      <div className="w-full max-w-5xl space-y-10">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border-subtle pb-6 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-indigo-glow animate-pulse" />
              <Badge variant="ai" dot>Kinetic Operational Dark</Badge>
              <Badge variant="positive">Foundation Live</Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Tactical UI Primitives & Design System
            </h1>
            <p className="text-xs md:text-sm text-on-surface-variant mt-1">
              Google Stitch Project: <code className="text-xs bg-surface-subpanel px-1.5 py-0.5 rounded text-secondary-light font-mono">projects/7294718395715951344</code> (DESIGN.md)
            </p>
          </div>

          {onBack && (
            <Button variant="secondary" size="compact" onClick={onBack}>
              ← Back to Central Hub
            </Button>
          )}
        </div>

        {/* 1. Tactical Buttons */}
        <Card>
          <CardHeader>
            <CardTitle>1. Tactical Action Buttons</CardTitle>
            <CardDescription>
              Engineered with 4px micro-radii, luminous focus rings, and top edge key-light highlights (<code className="text-xs text-secondary-light">inset 0 1px 0 rgba(255,255,255,0.20)</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={() => setClickCount((c) => c + 1)}
              >
                Primary CTA ({clickCount})
              </Button>

              <Button
                variant="ai"
                onClick={() => setClickCount((c) => c + 1)}
              >
                AI Copilot Action
              </Button>

              <Button
                variant="secondary"
                onClick={() => setClickCount((c) => c + 1)}
              >
                Secondary
              </Button>

              <Button
                variant="ghost"
                onClick={() => setClickCount((c) => c + 1)}
              >
                Ghost Action
              </Button>

              <Button
                variant="danger"
                onClick={() => setClickCount((c) => c + 1)}
              >
                Danger Action
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border-subtle">
              <Button
                variant="primary"
                size="compact"
                onClick={() => setClickCount((c) => c + 1)}
              >
                Compact (32px)
              </Button>

              <Button
                variant="primary"
                size="standard"
                onClick={() => setClickCount((c) => c + 1)}
              >
                Standard (36px)
              </Button>

              <Button
                variant="primary"
                size="lg"
                onClick={() => setClickCount((c) => c + 1)}
              >
                Large (40px)
              </Button>

              <Button
                variant="primary"
                isLoading={isLoadingBtn}
                onClick={() => {
                  setIsLoadingBtn(true)
                  setTimeout(() => setIsLoadingBtn(false), 1500)
                }}
              >
                {isLoadingBtn ? 'Simulating...' : 'Test Loading State'}
              </Button>

              <Button variant="primary" disabled>
                Disabled
              </Button>
            </div>
          </CardContent>
          <CardFooter>
            <span className="text-xs text-on-surface-variant font-mono">
              Total interactive button clicks: {clickCount}
            </span>
          </CardFooter>
        </Card>

        {/* 2. Inputs with Luminous Focus & Trailing Badge */}
        <Card>
          <CardHeader>
            <CardTitle>2. Form Inputs with Luminous Focus & Trailing Badges</CardTitle>
            <CardDescription>
              Dark slate background (<code className="text-xs text-secondary-light">#1E293B</code>), luminous focus ring (<code className="text-xs text-secondary-light">#4F46E5</code>), and keyboard shortcut badges.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Global Command Search"
              placeholder="Search tickets, customers, or teams..."
              leadingIcon={<Search className="w-4 h-4" />}
              trailingBadge="⌘K"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                if (e.target.value.length > 0 && e.target.value.length < 3) {
                  setInputError('Query must be at least 3 characters')
                } else {
                  setInputError('')
                }
              }}
              error={inputError}
              helperText={!inputError ? 'Type 3+ characters to simulate validation' : undefined}
            />

            <Input
              label="Organization Subdomain Slug"
              placeholder="acme-support"
              trailingBadge=".zeddesk.internal"
              defaultValue="acme"
            />

            <Input
              label="Disabled Control"
              placeholder="Read-only permissions"
              disabled
              defaultValue="agent@acme.test"
            />

            <Input
              label="Password Field"
              type="password"
              placeholder="••••••••••••"
              defaultValue="secret12345"
            />
          </CardContent>
        </Card>

        {/* 3. Status & Telemetry Badges */}
        <Card>
          <CardHeader>
            <CardTitle>3. Status & Telemetry Badges</CardTitle>
            <CardDescription>
              Uppercase label-caps (<code className="text-xs text-secondary-light">11px / font-semibold</code>) with 12% alpha fills and matching border tones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2.5 items-center">
              <Badge variant="positive" dot>Online (98%)</Badge>
              <Badge variant="positive">SLA Met</Badge>
              <Badge variant="warning" dot>Pending Review</Badge>
              <Badge variant="warning">Medium Confidence</Badge>
              <Badge variant="critical" dot>Urgent Escalation</Badge>
              <Badge variant="critical">SLA Breached</Badge>
              <Badge variant="neutral" dot>Neutral Sentiment</Badge>
              <Badge variant="neutral">Draft Ticket</Badge>
              <Badge variant="ai" dot>AI Copilot Active</Badge>
              <Badge variant="workflow" dot>n8n Webhook</Badge>
              <Badge variant="primary">Admin Tier</Badge>
            </div>
          </CardContent>
        </Card>

        {/* 4. High-Density Tabular Data */}
        <Card>
          <CardHeader>
            <CardTitle>4. High-Density Tabular Data (40px Row Ergonomics)</CardTitle>
            <CardDescription>
              Strict 40px row height, Inter tabular numbers (<code className="text-xs text-secondary-light">tabular-nums</code>), and subtle dividing borders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent / Identity</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Telemetry</TableHead>
                  <TableHead align="right">Resolved (30d)</TableHead>
                  <TableHead align="right">Avg First Response</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <div className="font-semibold text-white">Alice Walker</div>
                    <div className="text-[11px] text-on-surface-variant font-mono">alice@acme.test</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="primary">ADMIN</Badge>
                  </TableCell>
                  <TableCell>Tier 3 Escalations</TableCell>
                  <TableCell>
                    <Badge variant="positive" dot>Online</Badge>
                  </TableCell>
                  <TableCell numeric>1,842</TableCell>
                  <TableCell numeric>3m 12s</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell>
                    <div className="font-semibold text-white">Bob Builder</div>
                    <div className="text-[11px] text-on-surface-variant font-mono">bob@acme.test</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">AGENT</Badge>
                  </TableCell>
                  <TableCell>Customer Care</TableCell>
                  <TableCell>
                    <Badge variant="warning" dot>Away</Badge>
                  </TableCell>
                  <TableCell numeric>946</TableCell>
                  <TableCell numeric>8m 45s</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell>
                    <div className="font-semibold text-white">Carol Danvers</div>
                    <div className="text-[11px] text-on-surface-variant font-mono">carol@acme.test</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">AGENT</Badge>
                  </TableCell>
                  <TableCell>Billing & Subs</TableCell>
                  <TableCell>
                    <Badge variant="positive" dot>Online</Badge>
                  </TableCell>
                  <TableCell numeric>1,230</TableCell>
                  <TableCell numeric>4m 18s</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 5. Accessible Level 3 Modal Dialog */}
        <Card>
          <CardHeader>
            <CardTitle>5. Accessible Level 3 Modal Dialog</CardTitle>
            <CardDescription>
              Dialog with backdrop blur, keyboard ESC dismissal, focus trap, and outside-click dismissal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Button
              variant="primary"
              onClick={() => setIsModalOpen(true)}
            >
              Open Level 3 Modal
            </Button>
            <span className="text-xs text-on-surface-variant">
              Click or press Escape after opening to test keyboard handling.
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Invite Organization Member"
        description="Grant access to the tenant workspace with an assigned Role."
      >
        <div className="space-y-4">
          <Input
            label="Member Email Address"
            placeholder="support.agent@company.com"
            defaultValue="new.agent@acme.test"
          />

          <div className="space-y-1.5 text-left">
            <label className="text-xs font-medium text-on-surface-variant">
              Assigned Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="p-3 border border-primary-container bg-primary-container/10 rounded text-left transition-colors"
              >
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-accent-indigo-glow" /> Admin
                </div>
                <div className="text-[11px] text-on-surface-variant mt-1">Full management access</div>
              </button>
              <button
                type="button"
                className="p-3 border border-border-subtle hover:border-border-prominent bg-surface-subpanel rounded text-left transition-colors"
              >
                <div className="text-xs font-semibold text-white">Agent</div>
                <div className="text-[11px] text-on-surface-variant mt-1">Read & ticket response access</div>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border-subtle">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                alert('Member invitation dispatched!')
                setIsModalOpen(false)
              }}
            >
              Send Invitation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
