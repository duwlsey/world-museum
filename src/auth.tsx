import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Role = 'teacher' | 'author' | 'student'
export type User = { id: string; nickname: string; role: Role; question?: string; mustChangePassword?: boolean }
type ProfileRow = { id: string; username: string; role: Role; security_question: string; must_change_password: boolean }
type AccountResponse = { access_token?: string; refresh_token?: string; must_change_password?: boolean; question?: string; success?: boolean; message?: string; temporaryPassword?: string }
type AuthContextValue = {
  user: User | null
  accounts: User[]
  login: (id: string, password: string) => Promise<string | null>
  signup: (user: User, password: string, answer: string) => Promise<string | null>
  isUsernameAvailable: (id: string) => Promise<boolean>
  setAuthor: (id: string) => Promise<string | null>
  resetPassword: (id: string) => Promise<string | null>
  getSecurityQuestion: (id: string) => Promise<{ question?: string; error?: string }>
  resetWithSecurityAnswer: (id: string, answer: string, newPassword: string) => Promise<string | null>
  sendRecoveryRequest: (id: string) => Promise<string | null>
  changePassword: (newPassword: string) => Promise<string | null>
  logout: () => Promise<void>
}
const AuthContext = createContext<AuthContextValue | null>(null)

// Supabase Auth requires an email address. This reserved, non-deliverable domain
// lets the museum keep its intentionally minimal username-only signup form.
const profileToUser = (profile: ProfileRow): User => ({
  id: profile.username,
  nickname: profile.username === 'admin1' ? '관리자 선생님' : profile.username === 'admin2' ? '선생님' : profile.username,
  role: profile.role,
  question: profile.security_question,
  mustChangePassword: profile.must_change_password,
})

async function invokeAccount(body: Record<string, unknown>): Promise<{ data: AccountResponse | null; error: string | null; code?: string }> {
  const { data, error } = await supabase.functions.invoke<AccountResponse>('account-gateway', { body })
  if (!error) return { data, error: null }
  let payload: { error?: string; code?: string } | null = null
  const context = (error as { context?: unknown }).context
  if (context instanceof Response) {
    try { payload = await context.json() as { error?: string; code?: string } } catch { /* use the SDK message */ }
  }
  return { data: null, error: payload?.error ?? error.message, code: payload?.code }
}

async function getProfile(authUserId: string): Promise<User | null> {
  const { data, error } = await supabase.from('profiles').select('id,username,role,security_question,must_change_password').eq('id', authUserId).maybeSingle()
  if (error || !data) return null
  return profileToUser(data as ProfileRow)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<User[]>([])

  useEffect(() => {
    let active = true
    let sessionRevision = 0
    const applySession = async (session: Session | null) => {
      const revision = ++sessionRevision
      if (!session?.user) {
        if (active) setUser(null)
        return
      }
      const next = await getProfile(session.user.id)
      if (active && revision === sessionRevision) setUser(next)
    }
    void supabase.auth.getSession().then(({ data }) => applySession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer Supabase calls until after the auth callback has completed.
      queueMicrotask(() => { void applySession(session) })
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (user?.id !== 'admin1') return
    void supabase.from('profiles').select('id,username,role,security_question,must_change_password').order('created_at').then(({ data, error }) => {
      if (!error && data) setAccounts((data as ProfileRow[]).filter((account) => account.role !== 'teacher').map(profileToUser))
    })
  }, [user])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    accounts,
    async login(id, password) {
      const username = id.trim().toLowerCase()
      if (!username || !password) return 'Enter your ID and password.'
      const result = await invokeAccount({ action: 'login', username, password })
      if (result.error) return result.error
      if (!result.data?.access_token || !result.data.refresh_token) return 'The account service returned an incomplete sign-in response.'
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({ access_token: result.data.access_token, refresh_token: result.data.refresh_token })
      if (sessionError || !sessionData.user) return sessionError?.message ?? 'Could not start your session.'
      const profile = await getProfile(sessionData.user.id)
      if (!profile) {
        await supabase.auth.signOut()
        return 'Your account profile could not be loaded. Please contact the teacher.'
      }
      setUser(profile)
      return null
    },
    async signup(nextUser, password, answer) {
      const username = nextUser.id.trim().toLowerCase()
      if (!/^[a-z0-9]+$/.test(username)) return 'ID must use English letters and numbers only.'
      if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,32}$/.test(password)) return 'Password must be 6–32 characters and include at least one letter and one number.'
      if (!nextUser.question || !answer.trim()) return 'Complete every field before creating your account.'
      const created = await invokeAccount({ action: 'signup', username, password, question: nextUser.question, answer: answer.replace(/\s+/g, '') })
      if (created.error) return created.error
      const signIn = await invokeAccount({ action: 'login', username, password })
      if (signIn.error) return signIn.error
      if (!signIn.data?.access_token || !signIn.data.refresh_token) return 'Account created, but sign-in did not complete. Please log in.'
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({ access_token: signIn.data.access_token, refresh_token: signIn.data.refresh_token })
      if (sessionError || !sessionData.user) return sessionError?.message ?? 'Account created, but sign-in did not complete.'
      const profile = await getProfile(sessionData.user.id)
      if (!profile) return 'Account created, but its profile is not ready. Please log in again shortly.'
      setUser(profile)
      return null
    },
    async isUsernameAvailable(id) {
      const username = id.trim().toLowerCase()
      if (!/^[a-z0-9]+$/.test(username)) return false
      const { data, error } = await supabase.rpc('world_museum_username_available', { candidate: username })
      return !error && Boolean(data)
    },
    async setAuthor(id) {
      if (user?.id !== 'admin1') return 'Only the administrator can change author roles.'
      const { data: target } = await supabase.from('profiles').select('role').eq('username', id).maybeSingle()
      if (!target) return 'Account not found.'
      const { error } = await supabase.from('profiles').update({ role: target.role === 'author' ? 'student' : 'author' }).eq('username', id)
      if (error) return error.message
      const { data } = await supabase.from('profiles').select('id,username,role,security_question,must_change_password').order('created_at')
      if (data) setAccounts((data as ProfileRow[]).filter((account) => account.role !== 'teacher').map(profileToUser))
      return null
    },
    async resetPassword(id) {
      if (user?.id !== 'admin1') { window.alert('Only the administrator can reset passwords.'); return 'Only the administrator can reset passwords.' }
      const result = await invokeAccount({ action: 'admin-reset', targetUsername: id })
      if (result.error) { window.alert(result.error); return result.error }
      const message = result.data?.temporaryPassword ? 'Temporary password set to the account ID. The student must change it at next sign-in.' : 'Password reset failed.'
      window.alert(message)
      return result.data?.temporaryPassword ? null : message
    },
    async getSecurityQuestion(id) {
      const result = await invokeAccount({ action: 'question', username: id.trim().toLowerCase() })
      return result.error ? { error: result.error } : { question: result.data?.question }
    },
    async resetWithSecurityAnswer(id, answer, newPassword) {
      const result = await invokeAccount({ action: 'reset-password', username: id.trim().toLowerCase(), answer, newPassword })
      return result.error
    },
    async sendRecoveryRequest(id) {
      const result = await invokeAccount({ action: 'send-recovery-request', username: id.trim().toLowerCase() })
      return result.error ?? result.data?.message ?? null
    },
    async changePassword(newPassword) {
      const result = await invokeAccount({ action: 'change-password', newPassword })
      if (result.error) return result.error
      if (user) setUser({ ...user, mustChangePassword: false })
      return null
    },
    async logout() {
      await supabase.auth.signOut()
      setUser(null)
    },
  }), [user, accounts])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider is required')
  return value
}
