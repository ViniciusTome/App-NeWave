import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authContext'
import { api, ApiError } from '../services/api'

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Ao abrir o app, pergunta ao servidor se já existe uma sessão ativa.
  useEffect(() => {
    let cancelled = false

    api('/auth/me')
      .then(({ user }) => {
        if (!cancelled) setUser(user)
      })
      .catch((error) => {
        const notLoggedIn = error instanceof ApiError && error.status === 401
        if (!cancelled && !notLoggedIn) console.error('Erro ao verificar a sessão:', error)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const register = useCallback(async (name, email, password) => {
    try {
      await api('/auth/register', { method: 'POST', body: { name, email, password } })
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }, [])

  const login = useCallback(async (email, password, remember = false) => {
    try {
      const { user } = await api('/auth/login', {
        method: 'POST',
        body: { email, password, remember },
      })
      setUser(user)
      return { success: true, user }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error('Erro ao encerrar a sessão no servidor:', error)
    }
    setUser(null)
  }, [])

  const forgotPassword = useCallback(async (email) => {
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } })
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }, [])

  const resetPassword = useCallback(async (token, password) => {
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } })
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message, code: error.code }
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      register,
      login,
      logout,
      forgotPassword,
      resetPassword,
    }),
    [user, isLoading, register, login, logout, forgotPassword, resetPassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
