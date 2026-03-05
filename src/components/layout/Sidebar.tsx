// src/components/layout/Sidebar.tsx
import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuthStore, useUser, useAllowedPages } from '@/store/authStore'
import { useLangStore, LANGUAGES, tl } from '@/store/languageStore'

interface NavItem {
  key: string
  label: string
  icon: string
  group: string
}

const ALL_NAV: NavItem[] = [
  { key: 'portfolio',    label: 'Portfolio Analytics',  icon: '📊', group: 'Analytics' },
  { key: 'operation',    label: 'Operation Theatre',    icon: '🏥', group: 'Analytics' },
  { key: 'reconnect',    label: 'Re Connect',           icon: '🔌', group: 'Analytics' },
  { key: 'add_comments', label: 'Add Comments',         icon: '📝', group: 'Analytics' },
  { key: 'meta_viewer',  label: 'Meta Viewer',          icon: '🧭', group: 'Analytics' },
  { key: 'scb_ot',       label: 'SCB OT',               icon: '⚡', group: 'Analytics' },
  { key: 'raw_analyser', label: 'Raw Analyser',         icon: '📈', group: 'Analytics' },
  { key: 's1',           label: 'S1 — Receiver',        icon: '📋', group: 'Permit' },
  { key: 's2',           label: 'S2 — Forwarding',      icon: '📤', group: 'Permit' },
  { key: 's3',           label: 'S3 — Approval',        icon: '✅', group: 'Permit' },
]

interface SidebarProps {
  activePage: string
  onNavigate: (page: string) => void
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ activePage, onNavigate, collapsed, onToggle }: SidebarProps) {
  const user = useUser()
  const allowedPages = useAllowedPages()
  const logout = useAuthStore((s) => s.logout)
  const { lang, setLang, viewMode, toggleViewMode } = useLangStore()

  const visible = ALL_NAV.filter((n, i, arr) =>
    allowedPages.includes(n.key) && arr.findIndex(x => x.key === n.key) === i
  )
  const groups = [...new Set(visible.map((n) => n.group))]

  return (
    <aside
      className={cn(
        'flex flex-col h-screen flex-shrink-0 select-none sidebar-bg',
        'transition-all duration-300 ease-in-out overflow-hidden',
        collapsed ? 'w-[60px]' : 'w-56',
      )}
    >
      {/* Logo + hamburger */}
      <div className={cn(
        'flex items-center border-b border-white/10 flex-shrink-0',
        collapsed ? 'justify-center px-0 py-4' : 'px-4 pt-5 pb-4 gap-2.5',
      )}>
        {!collapsed && (
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-navy-900 font-extrabold text-sm shadow-amber-glow flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #ffb300, #ff6b35)' }}
          >
            Z
          </div>
        )}
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="font-display text-white text-base leading-tight">Zel-EYE</p>
            <p className="text-white/40 text-[10px] font-mono tracking-widest uppercase">OI · Solar Ops</p>
          </div>
        )}

        {/* Hamburger button */}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex flex-col gap-[5px] items-center justify-center rounded-lg transition-all duration-150',
            'text-white/50 hover:text-white hover:bg-white/10',
            collapsed ? 'w-10 h-10 p-2.5' : 'w-8 h-8 p-2 flex-shrink-0',
          )}
        >
          <span
            className={cn(
              'block h-[2px] bg-current rounded-full transition-all duration-300',
              collapsed ? 'w-5' : 'w-4',
            )}
          />
          <span
            className={cn(
              'block h-[2px] bg-current rounded-full transition-all duration-300',
              collapsed ? 'w-3' : 'w-4',
            )}
          />
          <span
            className={cn(
              'block h-[2px] bg-current rounded-full transition-all duration-300',
              collapsed ? 'w-5' : 'w-4',
            )}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-1.5">
        {groups.map((group) => (
          <div key={group}>
            {!collapsed && (
              <p className="sidebar-section-label px-2">{group}</p>
            )}
            {collapsed && <div className="h-2" />}
            {visible
              .filter((n) => n.group === group)
              .map((item) => (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'nav-item w-full text-left transition-all duration-150',
                    collapsed ? 'justify-center px-0 py-2.5' : '',
                    activePage === item.key && 'active',
                  )}
                >
                  <span className="text-base leading-none flex-shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </button>
              ))}
          </div>
        ))}
      </nav>

      {/* Viewport toggle (📱 Mobile / 🖥 Desktop) */}
      {!collapsed && (
        <div className="px-3 pb-1 flex-shrink-0">
          <button
            onClick={toggleViewMode}
            title={viewMode === 'desktop' ? 'Switch to Mobile View' : 'Switch to Desktop View'}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150',
              viewMode === 'mobile'
                ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5',
            )}
          >
            <span className="text-sm leading-none flex-shrink-0">
              {viewMode === 'mobile' ? '📱' : '🖥️'}
            </span>
            <span className="truncate">
              {viewMode === 'mobile' ? tl('Mobile View', lang) : tl('Desktop View', lang)}
            </span>
          </button>
        </div>
      )}
      {collapsed && (
        <div className="flex justify-center pb-1 flex-shrink-0">
          <button
            onClick={toggleViewMode}
            title={viewMode === 'mobile' ? 'Switch to Desktop View' : 'Switch to Mobile View'}
            className={cn(
              'w-10 h-8 flex items-center justify-center rounded-lg text-base transition-all duration-150',
              viewMode === 'mobile' ? 'text-amber-300 bg-amber-500/20' : 'text-white/30 hover:text-white/60 hover:bg-white/5',
            )}
          >
            {viewMode === 'mobile' ? '📱' : '🖥️'}
          </button>
        </div>
      )}

      {/* Language selector */}
      {!collapsed && (
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg">
            <span className="text-white/30 text-xs">🌐</span>
            <select
              className="flex-1 bg-transparent text-white/50 text-[11px] font-medium border-none outline-none cursor-pointer hover:text-white/80 transition-colors"
              value={lang}
              onChange={(e) => setLang(e.target.value as typeof lang)}
              title="Select language"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-navy-900 text-white">
                  {l.native} ({l.name})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {collapsed && (
        <div className="flex justify-center pb-1 flex-shrink-0" title="Language">
          <span className="text-white/30 text-sm">🌐</span>
        </div>
      )}

      {/* User footer */}
      <div className="px-1.5 py-3 border-t border-white/10 flex-shrink-0">
        <div className={cn(
          'flex items-center rounded-lg hover:bg-white/5 transition-colors',
          collapsed ? 'justify-center p-2' : 'gap-2.5 px-2 py-2',
        )}>
          <div
            className="h-7 w-7 rounded-full flex items-center justify-center text-navy-900 font-extrabold text-xs flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #ffb300, #ff6b35)' }}
            title={collapsed ? (user?.username ?? 'user') : undefined}
          >
            {user?.username?.[0]?.toUpperCase() ?? '?'}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{user?.username ?? 'user'}</p>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="text-white/30 hover:text-white transition-colors text-xs leading-none"
              >
                ⏻
              </button>
            </>
          )}
          {collapsed && (
            <button
              onClick={logout}
              title="Sign out"
              className="sr-only"
            >
              ⏻
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={logout}
            title="Sign out"
            className="flex items-center justify-center w-full mt-1 py-1.5 text-white/30 hover:text-red-400 transition-colors text-xs"
          >
            ⏻
          </button>
        )}
      </div>
    </aside>
  )
}
