"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { apiClient } from "@/lib/api-client"
import { Activity, AlertCircle } from "lucide-react"

interface HealthPoint {
  timestamp: number
  isHealthy: boolean
  responseTime?: number
}

export function HealthStatus() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [healthHistory, setHealthHistory] = useState<HealthPoint[]>([])
  const [responseTime, setResponseTime] = useState<number | null>(null)

  useEffect(() => {
    const checkHealth = async () => {
      const startTime = Date.now()
      try {
        await apiClient.getHealth()
        const endTime = Date.now()
        const responseTimeMs = endTime - startTime
        
        setIsHealthy(true)
        setError(null)
        setResponseTime(responseTimeMs)
        
        // Add to health history
        const newHealthPoint: HealthPoint = {
          timestamp: Date.now(),
          isHealthy: true,
          responseTime: responseTimeMs
        }
        
        setHealthHistory(prev => {
          const updated = [...prev, newHealthPoint]
          // Keep only last 20 data points
          return updated.slice(-20)
        })
      } catch (err) {
        setIsHealthy(false)
        setError(err instanceof Error ? err.message : "Health check failed")
        setResponseTime(null)
        
        // Add to health history
        const newHealthPoint: HealthPoint = {
          timestamp: Date.now(),
          isHealthy: false
        }
        
        setHealthHistory(prev => {
          const updated = [...prev, newHealthPoint]
          // Keep only last 20 data points
          return updated.slice(-20)
        })
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
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        
        {responseTime !== null && (
          <div className="text-sm text-muted-foreground">
            Response time: {responseTime}ms
          </div>
        )}
        
        {/* Health Timeline */}
        {healthHistory.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Health Timeline (Last 20 checks)</div>
            <div className="flex items-center gap-1 h-8">
              {healthHistory.map((point, index) => {
                const timeAgo = Math.round((Date.now() - point.timestamp) / 1000 / 60) // minutes ago
                return (
                  <div
                    key={index}
                    className={`flex-1 h-full rounded-sm transition-colors ${
                      point.isHealthy 
                        ? 'bg-green-500' 
                        : 'bg-red-500'
                    }`}
                    title={`${point.isHealthy ? 'Healthy' : 'Unhealthy'} - ${timeAgo} minutes ago${point.responseTime ? ` (${point.responseTime}ms)` : ''}`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>20 min ago</span>
              <span>Now</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
