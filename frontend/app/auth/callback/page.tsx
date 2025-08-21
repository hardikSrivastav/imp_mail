"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refreshAuth } = useAuth()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check if we have a token directly from the backend redirect
        const token = searchParams.get("token")
        const userParam = searchParams.get("user")
        const error = searchParams.get("error")

        if (error) {
          setError(`OAuth error: ${error}`)
          setStatus("error")
          return
        }

        if (token && userParam) {
          // Backend redirected with token directly
          try {
            const user = JSON.parse(decodeURIComponent(userParam))
            console.log("Setting token and user in localStorage:", { token: token.substring(0, 20) + "...", user })
            localStorage.setItem("jwt_token", token)
            localStorage.setItem("user", JSON.stringify(user))
            
            // Refresh auth context to update the state
            console.log("Calling refreshAuth...")
            refreshAuth()
            
            setStatus("success")
            
            // Redirect to dashboard after a short delay
            setTimeout(() => {
              console.log("Redirecting to dashboard...")
              router.push("/dashboard")
            }, 2000)
            return
          } catch (parseError) {
            console.error("Failed to parse user data:", parseError)
            setError("Invalid user data received")
            setStatus("error")
            return
          }
        }

        // Fallback: handle authorization code exchange (for direct API calls)
        const code = searchParams.get("code")
        const state = searchParams.get("state")

        if (!code) {
          setError("Missing authorization code or token")
          setStatus("error")
          return
        }

        // Exchange the authorization code for a JWT token
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000"}/api/auth/callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code, state }),
          credentials: "include"
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || "Failed to complete authentication")
        }

        const data = await response.json()
        
        // Store the JWT token
        localStorage.setItem("jwt_token", data.token)
        if (data.user) {
          localStorage.setItem("user", JSON.stringify(data.user))
        }
        
        // Refresh auth context to update the state
        refreshAuth()
        
        setStatus("success")
        
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          router.push("/dashboard")
        }, 2000)

      } catch (err) {
        console.error("Callback error:", err)
        setError(err instanceof Error ? err.message : "Authentication failed")
        setStatus("error")
      }
    }

    handleCallback()
  }, [searchParams, router, refreshAuth])

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p className="text-center">Completing authentication...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-destructive">Authentication Failed</CardTitle>
            <CardDescription>There was an error completing your login</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button 
              onClick={() => router.push("/login")} 
              className="w-full"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-green-600">Authentication Successful!</CardTitle>
          <CardDescription>You have been successfully logged in</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="mb-4">Redirecting to dashboard...</p>
          <Button 
            onClick={() => router.push("/dashboard")} 
            className="w-full"
          >
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
