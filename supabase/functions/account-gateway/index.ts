import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const projectUrl = Deno.env.get('SUPABASE_URL')!
// Supabase now injects the current secret-key map by default. Keep the legacy
// service-role variable as a fallback for projects that still expose it.
const secretMap = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
const serviceKey = secretMap.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')
const publishableMap = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
const publishableKey = publishableMap.default ?? Deno.env.get('SUPABASE_ANON_KEY')
const admin = createClient(projectUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const authClient = createClient(projectUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } })
const internalEmail = (username: string) => `${username.toLowerCase()}@accounts.worldmuseum.invalid`
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase()
const validPassword = (value: unknown) => typeof value === 'string' && /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,32}$/.test(value)

async function profileForUsername(username: string) {
  const { data, error } = await admin.from('profiles').select('id,username,role,security_question,must_change_password').eq('username', username).maybeSingle()
  if (error) throw error
  return data
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const body = await request.json()
    const action = String(body.action ?? '')
    const username = normalized(body.username)

    if (action === 'login') {
      if (!/^[a-z0-9]+$/.test(username) || !body.password) return json({ error: 'Enter your ID and password.', code: 'INVALID_INPUT' }, 400)
      const { data: locked, error: lockError } = await admin.rpc('wm_login_is_locked', { p_username: username })
      if (lockError) throw lockError
      if (locked) return json({ error: 'Too many failed attempts. Try again in 15 minutes.', code: 'LOGIN_LOCKED' }, 429)

      const profile = await profileForUsername(username)
      if (!profile) {
        await admin.rpc('wm_record_login_failure', { p_username: username })
        return json({ error: 'ID not found. Check your ID or use the ID help option.', code: 'ID_NOT_FOUND' }, 404)
      }
      const { data, error } = await authClient.auth.signInWithPassword({ email: internalEmail(username), password: String(body.password) })
      if (error || !data.session) {
        const { data: lockUntil } = await admin.rpc('wm_record_login_failure', { p_username: username })
        if (lockUntil && new Date(lockUntil).getTime() > Date.now()) return json({ error: 'Too many failed attempts. Try again in 15 minutes.', code: 'LOGIN_LOCKED' }, 429)
        return json({ error: 'Incorrect password. Try again or choose Find Password.', code: 'BAD_PASSWORD' }, 401)
      }
      await admin.rpc('wm_clear_login_failures', { p_username: username })
      return json({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        must_change_password: Boolean(profile.must_change_password),
      })
    }

    if (action === 'signup') {
      if (!/^[a-z0-9]+$/.test(username) || username.length > 32) return json({ error: 'Use English letters and numbers for your ID (up to 32 characters).' }, 400)
      if (!validPassword(body.password)) return json({ error: 'Password must be 6–32 characters and include a letter and a number.' }, 400)
      const question = String(body.question ?? '').trim()
      const answer = String(body.answer ?? '').replace(/\s+/g, '').toLowerCase()
      if (!question || !answer) return json({ error: 'Choose a security question and enter its answer.' }, 400)
      const { data: available, error: availabilityError } = await admin.rpc('world_museum_username_available', { candidate: username })
      if (availabilityError) throw availabilityError
      if (!available) return json({ error: 'Username already taken.' }, 409)
      const { data: created, error: createError } = await authClient.auth.signUp({
        email: internalEmail(username),
        password: String(body.password),
        user_metadata: { username, security_question: question },
      })
      if (createError || !created.user) return json({ error: createError?.message ?? 'Could not create account.' }, 400)
      const { error: profileError } = await admin.rpc('wm_create_student_profile', {
        p_user_id: created.user.id,
        p_username: username,
        p_question: question,
        p_answer: answer,
      })
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id)
        if (/duplicate|unique/i.test(profileError.message)) return json({ error: 'Username already taken.' }, 409)
        throw profileError
      }
      return json({ success: true })
    }

    if (action === 'question') {
      if (!/^[a-z0-9]+$/.test(username)) return json({ error: 'Enter your ID first.' }, 400)
      const { data, error } = await admin.rpc('wm_recovery_question', { p_username: username })
      if (error) throw error
      if (!data) return json({ error: 'ID not found.', code: 'ID_NOT_FOUND' }, 404)
      return json({ question: data })
    }

    if (action === 'reset-password') {
      if (!/^[a-z0-9]+$/.test(username) || !validPassword(body.newPassword)) return json({ error: 'Enter your ID and a valid new password.' }, 400)
      const { data: verified, error: verifyError } = await admin.rpc('wm_verify_recovery_answer', { p_username: username, p_answer: String(body.answer ?? '') })
      if (verifyError) throw verifyError
      if (verified !== 'verified') {
        if (verified === 'locked') return json({ error: 'Security answer locked after too many attempts. Contact the teacher.' , code: 'ANSWER_LOCKED' }, 429)
        return json({ error: verified === 'not_found' ? 'ID not found.' : 'That answer does not match. You can contact the teacher for help.', code: verified === 'not_found' ? 'ID_NOT_FOUND' : 'ANSWER_INCORRECT' }, 400)
      }
      const profile = await profileForUsername(username)
      if (!profile) return json({ error: 'ID not found.' }, 404)
      const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, { password: String(body.newPassword) })
      if (updateError) throw updateError
      await admin.from('profiles').update({ must_change_password: false }).eq('id', profile.id)
      return json({ success: true })
    }

    if (action === 'send-recovery-request') {
      const profile = await profileForUsername(username)
      if (!profile) return json({ error: 'ID not found.' }, 404)
      const { data: allowed, error: allowedError } = await admin.rpc('wm_recovery_email_allowed', { p_username: username })
      if (allowedError) throw allowedError
      if (!allowed) return json({ error: 'A request was already sent for this account within the last hour.' }, 429)
      const { data: destination, error: emailError } = await admin.from('site_settings').select('setting_value').eq('setting_key', 'support_email').single()
      if (emailError) throw emailError
      const mailerUrl = Deno.env.get('GOOGLE_APPS_SCRIPT_URL')
      const mailerSecret = Deno.env.get('GOOGLE_APPS_SCRIPT_SECRET')
      if (!mailerUrl || !mailerSecret) return json({ error: 'Email delivery is not configured yet.', code: 'MAIL_NOT_CONFIGURED' }, 503)
      const sent = await fetch(mailerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: mailerSecret,
          to: destination.setting_value,
          username,
          securityQuestion: profile.security_question,
        }),
      })
      const delivery = await sent.json().catch(() => null)
      if (!sent.ok || delivery?.success !== true) {
        console.error('Google mailer rejected recovery request', { status: sent.status, delivery })
        return json({ error: 'Could not send the email request. Please call the teacher.' }, 502)
      }
      await admin.rpc('wm_mark_recovery_email_sent', { p_username: username })
      return json({ success: true, message: 'Request sent. The teacher will review it within one hour.' })
    }

    if (action === 'admin-reset') {
      const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
      if (!token) return json({ error: 'Sign in as the administrator first.' }, 401)
      const { data: authData, error: authError } = await admin.auth.getUser(token)
      if (authError || !authData.user) return json({ error: 'Your session has expired. Sign in again.' }, 401)
      const { data: actor } = await admin.from('profiles').select('username,role').eq('id', authData.user.id).maybeSingle()
      if (actor?.username !== 'admin1' || actor.role !== 'teacher') return json({ error: 'Administrator access required.' }, 403)
      const target = await profileForUsername(normalized(body.targetUsername))
      if (!target || target.role === 'teacher') return json({ error: 'Student account not found.' }, 404)
      const { error: updateError } = await admin.auth.admin.updateUserById(target.id, { password: target.username })
      if (updateError) throw updateError
      const { error: flagError } = await admin.from('profiles').update({ must_change_password: true }).eq('id', target.id)
      if (flagError) throw flagError
      return json({ success: true, temporaryPassword: target.username })
    }

    if (action === 'change-password') {
      const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
      if (!token || !validPassword(body.newPassword)) return json({ error: 'Sign in and enter a valid new password.' }, 401)
      const { data: authData, error: authError } = await admin.auth.getUser(token)
      if (authError || !authData.user) return json({ error: 'Your session has expired. Sign in again.' }, 401)
      const { error: updateError } = await admin.auth.admin.updateUserById(authData.user.id, { password: String(body.newPassword) })
      if (updateError) throw updateError
      await admin.from('profiles').update({ must_change_password: false }).eq('id', authData.user.id)
      return json({ success: true })
    }

    return json({ error: 'Unknown account action.' }, 400)
  } catch (error) {
    console.error('account-gateway failure', error)
    return json({ error: 'The account service encountered a problem. Please try again.' }, 500)
  }
})
