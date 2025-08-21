"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { InsightsNavigation } from "@/components/insights-navigation"
import { EmailCard } from "@/components/email-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { apiClient, type Email } from "@/lib/api-client"
import { RefreshCw, AlertTriangle } from "lucide-react"

export default function OutliersPage() {
  const [outliers, setOutliers] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [percent, setPercent] = useState(10)

  const fetchOutliers = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.getOutliers({ percent })
      // Handle different response formats
      const outliersData = response.data.results || response.data.emails || response.data || []
      setOutliers(outliersData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch outlier emails")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOutliers()
  }, [percent])

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar */}
        <div className="w-64 border-r bg-card">
          <Navigation />
        </div>

        {/* Main content */}
        <div className="flex-1 p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Insights</h1>
                <p className="text-muted-foreground mt-2">Analyze email patterns and similarity to your expectations</p>
              </div>
              <Button onClick={fetchOutliers} variant="outline" disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <InsightsNavigation />

            {/* Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Outlier Emails
                </CardTitle>
                <CardDescription>
                  Emails that are most different from your typical patterns - these might need special attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Label htmlFor="percent">Show top</Label>
                  <Select value={percent.toString()} onValueChange={(value) => setPercent(Number(value))}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="10">10%</SelectItem>
                      <SelectItem value="15">15%</SelectItem>
                      <SelectItem value="20">20%</SelectItem>
                      <SelectItem value="25">25%</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">most unusual emails</span>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <p className="text-destructive">{error}</p>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Loading outlier emails...
              </div>
            )}

            {!loading && !error && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    Found {outliers.length} outlier emails ({percent}% most unusual)
                  </h2>
                </div>

                <div className="space-y-3">
                  {outliers.length > 0 ? (
                    outliers.map((email) => <EmailCard key={email.id} email={email} />)
                  ) : (
                    <div className="text-center py-12">
                      <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No outlier emails found</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        This could mean your emails follow consistent patterns, or the analysis needs more data
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
