"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { apiClient } from "@/lib/api-client"
import Link from "next/link"

interface DigestHistoryItem {
  id: string
  sentAt: string
  threadsCount: number
  emailFilter: string
  deliveryMethod: string
  windowHours: number
  threshold: number
}

export default function DigestHistoryPage() {
  const [history, setHistory] = useState<DigestHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await apiClient.getDigestHistory(50)
        setHistory(res.data.history || [])
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load digest history")
      } finally {
        setLoading(false)
      }
    }
    loadHistory()
  }, [])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getFilterBadgeColor = (filter: string) => {
    return filter === 'important' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
  }

  const getDeliveryBadgeColor = (method: string) => {
    return method === 'email' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex">
        {/* Navigation component - handles both mobile and desktop */}
        <Navigation />
        
        <div className="flex-1 p-4 lg:p-8">
          <div className="max-w-4xl mx-auto space-y-4 lg:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold">Digest History</h1>
                <p className="text-muted-foreground mt-2 text-sm lg:text-base">View your past email digests</p>
              </div>
              <Link href="/digest/settings">
                <Button variant="outline" className="w-full sm:w-auto">Settings</Button>
              </Link>
            </div>

            {error && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-destructive">{error}</div>
                </CardContent>
              </Card>
            )}

            {loading ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Loading digest history...</div>
                </CardContent>
              </Card>
            ) : history.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <h3 className="text-lg font-medium mb-2">No digest history</h3>
                    <p className="text-muted-foreground mb-4 text-sm lg:text-base">
                      You haven't received any digests yet. Configure your digest settings to start receiving them.
                    </p>
                    <Link href="/digest/settings">
                      <Button className="w-full sm:w-auto">Configure Digest</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {history.map((digest) => (
                  <Card key={digest.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                            <h3 className="font-medium text-sm lg:text-base">
                              {formatDate(digest.sentAt)}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              <Badge className={getFilterBadgeColor(digest.emailFilter)}>
                                {digest.emailFilter === 'important' ? 'Important Only' : 'All Emails'}
                              </Badge>
                              <Badge className={getDeliveryBadgeColor(digest.deliveryMethod)}>
                                {digest.deliveryMethod === 'email' ? 'Emailed' : 'Archived'}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs lg:text-sm text-muted-foreground">
                            <span>{digest.threadsCount} thread{digest.threadsCount !== 1 ? 's' : ''}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>{digest.windowHours}h window</span>
                            <span className="hidden sm:inline">•</span>
                            <span>{(digest.threshold * 100).toFixed(0)}% threshold</span>
                          </div>
                        </div>
                        <Link href={`/digest/history/${digest.id}`}>
                          <Button variant="outline" size="sm" className="w-full sm:w-auto">
                            View Details
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
