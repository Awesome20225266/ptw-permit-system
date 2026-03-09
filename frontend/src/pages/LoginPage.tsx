// src/pages/LoginPage.tsx
import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/lib/queryClient'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { setToken, setUser } = useAuthStore()

  const loginMutation = useMutation({
    mutationFn: () => authApi.login({ username, password }),
    onSuccess: (data) => {
      // Wipe every cached query so the new user never sees a previous
      // user's site list, work orders, or any other user-scoped data.
      queryClient.clear()
      // Clear any saved S1 filter state so a new user starts with a blank filter
      // (prevents a previous user's site selection being auto-applied).
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('s1_filters'))
          .forEach((k) => localStorage.removeItem(k))
      } catch { /* ignore storage errors */ }
      setToken(data.access_token)
      authApi.me().then((user) => setUser(user)).catch(() => {})
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (username && password) loginMutation.mutate()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950"
      style={{ background: 'linear-gradient(135deg, #070a14 0%, #0b1020 100%)' }}>
      <div className="w-full max-w-sm px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex h-14 w-14 rounded-2xl items-center justify-center text-navy-900 font-extrabold text-2xl shadow-lg mb-4"
            style={{ background: 'linear-gradient(135deg, #ffb300, #ff6b35)' }}
          >
            Z
          </div>
          <h1 className="text-white font-display text-3xl leading-tight">Zel-EYE: OI</h1>
          <p className="text-white/40 text-sm mt-1 font-mono tracking-widest uppercase">Solar Operations Intelligence</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white/60 text-xs font-semibold uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-colors text-sm"
                placeholder="Enter username"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-white/60 text-xs font-semibold uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-colors text-sm"
                placeholder="Enter password"
                required
                autoComplete="current-password"
              />
            </div>

            {loginMutation.isError && (
              <div className="rounded-lg px-3 py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                Invalid credentials. Please try again.
              </div>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending || !username || !password}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-navy-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #ffb300, #ff6b35)' }}
            >
              {loginMutation.isPending ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          © 2026 Zelestra · Solar Intelligence Platform
        </p>
      </div>
    </div>
  )
}
