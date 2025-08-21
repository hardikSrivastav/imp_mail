"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { apiClient } from "@/lib/api-client"
import { Activity, AlertCircle } from "lucide-react"

export function HealthStatus() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkHealth = async () => {
      try {
        await apiClient.getHealth()
        setIsHealthy(true)
        setError(null)
      } catch (err) {
        setIsHealthy(false)
        setError(err instanceof Error ? err.message : "Health check failed")
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 30000) // Check every 30 seconds

    return () => clearInterval(interval)
  }, [])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health
            </CardTitle>
            <CardDescription>Backend API status</CardDescription>
          </div>
          <Badge variant={isHealthy ? "default" : isHealthy === false ? "destructive" : "secondary"}>
            {isHealthy === null ? "Checking" : isHealthy ? "Healthy" : "Unhealthy"}
          </Badge>
        </div>
      </CardHeader>
      {error && (
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
