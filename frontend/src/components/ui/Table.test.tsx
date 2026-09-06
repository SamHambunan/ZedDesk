import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './Table'

describe('Table Primitive', () => {
  it('renders high-density 40px tabular data structure with tabular numbers', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Tickets Resolved</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-testid="test-row">
            <TableCell>Alice Smith</TableCell>
            <TableCell>Admin</TableCell>
            <TableCell numeric>1,248</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()

    // Table rows have high-density 40px min-height
    const row = screen.getByTestId('test-row')
    expect(row.className).toContain('h-10')
    expect(row.className).toContain('border-b')
    expect(row.className).toContain('border-border-subtle')

    // Table head uses uppercase label-caps
    const headerCell = screen.getByText('User')
    expect(headerCell.className).toContain('uppercase')
    expect(headerCell.className).toContain('text-[11px]')

    // Numeric table cell uses tabular numbers
    const numericCell = screen.getByText('1,248')
    expect(numericCell.className).toContain('tabular-nums')
  })
})
