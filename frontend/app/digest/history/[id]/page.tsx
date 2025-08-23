"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import Link from "next/link"

interface DigestItem {
  emailId: string
  subject: string
  sender: string
  receivedAt: string
  similarity: number
  summary?: string
}

interface DigestDetails {
  digest: {
    id: string
    sentAt: string
    threadsCount: number
    emailFilter: string
    deliveryMethod: string
    windowHours: number
    threshold: number
  }
  emails: DigestItem[]
}

export default function DigestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const digestId = params.id as string

  const [digestDetails, setDigestDetails] = useState<DigestDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDigest = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await apiClient.getDigestById(digestId)
        setDigestDetails(res.data)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load digest details")
      } finally {
        setLoading(false)
      }
    }

    if (digestId) {
      loadDigest()
    }
  }, [digestId])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
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

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background flex">
          <div className="w-64 border-r bg-card">
            <Navigation />
          </div>
          <div className="flex-1 p-8">
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Loading digest details...</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (error) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background flex">
          <div className="w-64 border-r bg-card">
            <Navigation />
          </div>
          <div className="flex-1 p-8">
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-destructive">{error}</div>
                  <Button onClick={() => router.back()} className="mt-4">
                    Go Back
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (!digestDetails) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background flex">
          <div className="w-64 border-r bg-card">
            <Navigation />
          </div>
          <div className="flex-1 p-8">
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Digest not found</div>
                  <Button onClick={() => router.back()} className="mt-4">
                    Go Back
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex">
        <div className="w-64 border-r bg-card">
          <Navigation />
        </div>
        <div className="flex-1 p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
              <Link href="/digest/history">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to History
                </Button>
              </Link>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Digest Details</CardTitle>
                <CardDescription>
                  {formatDate(digestDetails.digest.sentAt)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Threads</div>
                    <div className="text-2xl font-bold">{digestDetails.digest.threadsCount}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Window</div>
                    <div className="text-2xl font-bold">{digestDetails.digest.windowHours}h</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Threshold</div>
                    <div className="text-2xl font-bold">{(digestDetails.digest.threshold * 100).toFixed(0)}%</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Filter & Delivery</div>
                    <div className="flex flex-col gap-1">
                      <Badge className={getFilterBadgeColor(digestDetails.digest.emailFilter)} variant="secondary">
                        {digestDetails.digest.emailFilter === 'important' ? 'Important Only' : 'All Emails'}
                      </Badge>
                      <Badge className={getDeliveryBadgeColor(digestDetails.digest.deliveryMethod)} variant="secondary">
                        {digestDetails.digest.deliveryMethod === 'email' ? 'Emailed' : 'Archived'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Email Threads ({digestDetails.emails.length})</CardTitle>
                <CardDescription>
                  {digestDetails.emails.length === 0 
                    ? "No emails in this digest" 
                    : "Emails included in this digest, ordered by relevance"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {digestDetails.emails.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No emails met the criteria for this digest.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {digestDetails.emails.map((email) => (
                      <div key={email.emailId} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="space-y-1 flex-1">
                            <h3 className="font-medium text-sm">
                              {email.subject || '(No Subject)'}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{email.sender}</span>
                              <span>•</span>
                              <span>{formatShortDate(email.receivedAt)}</span>
                              {email.similarity > 0 && (
                                <>
                                  <span>•</span>
                                  <Badge variant="outline" className="text-xs">
                                    {(email.similarity * 100).toFixed(1)}% relevant
                                  </Badge>
                                </>
                              )}
                            </div>
                          </div>
                          <Link href={`/emails/${email.emailId}`}>
                            <Button variant="outline" size="sm">
                              View Email
                            </Button>
                          </Link>
                        </div>
                        {email.summary && (
                          <div className="mt-3 p-3 bg-muted rounded-md">
                            <div className="text-sm font-medium mb-1">AI Summary</div>
                            <div className="text-sm text-muted-foreground">{email.summary}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
