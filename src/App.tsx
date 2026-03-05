// src/App.tsx
import React, { useState, useEffect } from 'react'
import { useIsAuthenticated, useAuthStore, useAllowedPages, useUser } from '@/store/authStore'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { OperationPage } from '@/pages/OperationPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { ReconnectPage } from '@/pages/ReconnectPage'
import { S1Page } from '@/pages/S1Page'
import { S2Page } from '@/pages/S2Page'
import { S3Page } from '@/pages/S3Page'
import { SCBOTPage } from '@/pages/SCBOTPage'
import { RawAnalyserPage } from '@/pages/RawAnalyserPage'
import { CommentsPage, MetaViewerPage } from '@/pages/SecondaryPages'
import type { PageKey } from '@/types'

const PAGE_COMPONENTS: Record<PageKey, React.ComponentType> = {
  portfolio:    PortfolioPage,
  operation:    OperationPage,
  reconnect:    ReconnectPage,
  add_comments: CommentsPage,
  meta_viewer:  MetaViewerPage,
  s1:           S1Page,
  s2:           S2Page,
  s3:           S3Page,
  scb_ot:       SCBOTPage,
  raw_analyser: RawAnalyserPage,
}

export default function App() {
  const isAuthenticated = useIsAuthenticated()
  const user = useUser()
  const allowedPages = useAllowedPages()

  const defaultPage = (allowedPages[0] ?? 'portfolio') as PageKey
  const [activePage, setActivePage] = useState<PageKey>(defaultPage)

  useEffect(() => {
    if (allowedPages.length > 0) {
      setActivePage((p) =>
        allowedPages.includes(p) ? p : (allowedPages[0] as PageKey),
      )
    }
  }, [allowedPages])

  if (!isAuthenticated) {
    return <LoginPage />
  }

  // Token is set but user profile hasn't loaded yet — show a brief loading screen
  // instead of rendering a page component with no allowed_pages context.
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #070a14 0%, #0b1020 100%)' }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center font-extrabold text-xl"
            style={{ background: 'linear-gradient(135deg, #ffb300, #ff6b35)' }}
          >
            Z
          </div>
          <div className="flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-white/40 text-xs font-mono tracking-widest uppercase">Loading…</p>
        </div>
      </div>
    )
  }

  const PageComponent = PAGE_COMPONENTS[activePage] ?? PortfolioPage

  return (
    <AppShell activePage={activePage} onNavigate={(p) => setActivePage(p as PageKey)}>
      <PageComponent />
    </AppShell>
  )
}
