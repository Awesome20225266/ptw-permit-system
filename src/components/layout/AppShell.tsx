// src/components/layout/AppShell.tsx
import React, { useState } from 'react'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  activePage: string
  onNavigate: (page: string) => void
  children: React.ReactNode
}

export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar
        activePage={activePage}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  )
}
