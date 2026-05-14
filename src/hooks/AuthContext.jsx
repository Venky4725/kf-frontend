import { createContext, useContext, useEffect, useState } from 'react'

import api from '../lib/api'

const AuthContext = createContext(null)


export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('kf_user')
      return raw ? JSON.parse(raw) : null
    } catch (err) {
      console.error('Failed to parse stored user:', err)
      localStorage.removeItem('kf_user')
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  async function hydrateCurrentUser() {
    const { data } = await api.get('/auth/me')
    setUser(data)
    localStorage.setItem('kf_user', JSON.stringify(data))
    return data
  }

  useEffect(() => {
    const token = localStorage.getItem('kf_token')
    if (!token) {
      setLoading(false)
      return
    }

    hydrateCurrentUser()
      .catch((err) => {
        console.error('Failed to hydrate user:', err)
        localStorage.removeItem('kf_token')
        localStorage.removeItem('kf_user')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('kf_token', data.access_token)
    
    // Store user from login response
    setUser(data.user)
    localStorage.setItem('kf_user', JSON.stringify(data.user))
    
    // Return the user data with must_change_password flag
    return {
      ...data.user,
      must_change_password: data.must_change_password
    }
  }

  function logout() {
    localStorage.removeItem('kf_token')
    localStorage.removeItem('kf_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: hydrateCurrentUser }}>
      {children}
    </AuthContext.Provider>
  )
}


export const useAuth = () => useContext(AuthContext)
