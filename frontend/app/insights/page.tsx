"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/protected-route"

export default function InsightsPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to top-similar by default
    router.replace("/insights/top-similar")
  }, [router])

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Redirecting to insights...</div>
      </div>
    </ProtectedRoute>
  )
}
