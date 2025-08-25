"use client"

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react"
import { apiClient, type User } from "./api-client"

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string) => Promise<void>
  logout: () => void
  isLoading: boolean
  refreshAuth: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const checkAuthStatus = async (authToken: string) => {
    try {
      const response = await apiClient.getAuthStatus()
      setUser(response.data)
      setToken(authToken)
    } catch (error) {
      // Token is invalid, clear it
      localStorage.removeItem("jwt_token")
      localStorage.removeItem("user")
      setToken(null)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const refreshAuth = useCallback(() => {
    const storedToken = localStorage.getItem("jwt_token")
    const storedUser = localStorage.getItem("user")
    
    console.log("refreshAuth called:", { storedToken: !!storedToken, storedUser: !!storedUser })
    
    if (storedToken) {
      setToken(storedToken)
      
      // If we have stored user data, use it immediately
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser)
          console.log("Setting user from localStorage:", user)
          setUser(user)
          setIsLoading(false)
          return
        } catch (error) {
          console.error("Failed to parse stored user:", error)
          localStorage.removeItem("user")
        }
      }
      
      // Otherwise, verify the token with the backend
      console.log("Verifying token with backend...")
      checkAuthStatus(storedToken)
    } else {
      console.log("No stored token found")
      setToken(null)
      setUser(null)
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshAuth()
  }, [])

  // Listen for storage changes (when token is set by callback page)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "jwt_token" && e.newValue) {
        refreshAuth()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  const login = async (email: string) => {
    try {
      // Call the backend to initiate OAuth flow
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000"}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Login failed')
      }

      const data = await response.json()
      
      // Redirect to OAuth URL
      window.location.href = data.authUrl

    } catch (error) {
      console.error("Login error:", error)
      throw error
    }
  }

  const logout = async () => {
    try {
      if (token) {
        await apiClient.logout()
      }
    } catch (error) {
      console.error("Logout error:", error)
    } finally {
      localStorage.removeItem("jwt_token")
      localStorage.removeItem("user")
      setToken(null)
      setUser(null)
      window.location.href = "/login"
    }
  }

  return <AuthContext.Provider value={{ user, token, login, logout, isLoading, refreshAuth }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
