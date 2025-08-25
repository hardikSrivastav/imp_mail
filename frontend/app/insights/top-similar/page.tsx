"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { InsightsNavigation } from "@/components/insights-navigation"
import { EmailContent } from "@/components/email-content"
import { SimilarityBadge } from "@/components/similarity-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { apiClient, type SimilarityResult } from "@/lib/api-client"
import { RefreshCw, Eye, EyeOff } from "lucide-react"

export default function TopSimilarPage() {
  const [results, setResults] = useState<SimilarityResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [percent, setPercent] = useState(10)
  const [includeHtml, setIncludeHtml] = useState(false)
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set())

  const fetchTopSimilar = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.getTopSimilar({ percent, includeHtml })
      setResults(response.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch top similar emails")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTopSimilar()
  }, [percent, includeHtml])

  const toggleEmailExpansion = (emailId: string) => {
    const newExpanded = new Set(expandedEmails)
    if (newExpanded.has(emailId)) {
      newExpanded.delete(emailId)
    } else {
      newExpanded.add(emailId)
    }
    setExpandedEmails(newExpanded)
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex">
        {/* Navigation component - handles both mobile and desktop */}
        <Navigation />

        {/* Main content */}
        <div className="flex-1 p-4 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-4 lg:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold">Insights</h1>
                <p className="text-muted-foreground mt-2 text-sm lg:text-base">Analyze email patterns and similarity to your expectations</p>
              </div>
              <Button onClick={fetchTopSimilar} variant="outline" disabled={loading} className="w-full sm:w-auto">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <InsightsNavigation />

            {/* Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg lg:text-xl">Top Similar Emails</CardTitle>
                <CardDescription className="text-sm">Emails that most closely match your expectations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="percent" className="text-sm">Show top</Label>
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
                    <span className="text-sm text-muted-foreground">of emails</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch id="include-html" checked={includeHtml} onCheckedChange={setIncludeHtml} />
                    <Label htmlFor="include-html" className="text-sm">Include email content</Label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <p className="text-destructive text-sm">{error}</p>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                <span className="text-sm lg:text-base">Loading similar emails...</span>
              </div>
            )}

            {!loading && !error && results && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg lg:text-xl font-semibold">
                    Found {results.count} similar emails ({percent}% of total)
                  </h2>
                </div>

                <div className="space-y-4">
                  {results.results.map((result) => {
                    const html = (result as any).html || (result.email as any).htmlContent || null
                    return (
                    <Card key={result.email.id} className="overflow-hidden">
                      <CardContent className="p-0">
                        <div className="p-3 lg:p-4">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                                <h3 className="font-medium text-sm lg:text-base break-words">{result.email.subject}</h3>
                                <SimilarityBadge similarity={result.similarity} />
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs lg:text-sm text-muted-foreground mb-2 gap-1 sm:gap-0">
                                <span className="truncate">{result.email.sender}</span>
                                <span>{new Date(result.email.receivedAt).toLocaleString()}</span>
                              </div>
                            </div>

                            {html && (
                              <Button variant="ghost" size="sm" onClick={() => toggleEmailExpansion(result.email.id)} className="w-full sm:w-auto">
                                {expandedEmails.has(result.email.id) ? (
                                  <>
                                    <EyeOff className="h-4 w-4 mr-2" />
                                    Hide Content
                                  </>
                                ) : (
                                  <>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Show Content
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>

                        {html && expandedEmails.has(result.email.id) && (
                          <div className="border-t bg-muted/20 p-3 lg:p-4">
                            <EmailContent
                              html={html}
                              subject={result.email.subject}
                              sender={result.email.sender}
                              receivedAt={result.email.receivedAt}
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )})}
                </div>

                {results.results.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground text-sm lg:text-base">No similar emails found</p>
                    <p className="text-xs lg:text-sm text-muted-foreground mt-2">
                      Try adjusting the percentage or make sure your expectations are set up
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
