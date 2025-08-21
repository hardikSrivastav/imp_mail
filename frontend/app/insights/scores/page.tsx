"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { InsightsNavigation } from "@/components/insights-navigation"
import { SimilarityBadge } from "@/components/similarity-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiClient } from "@/lib/api-client"
import { RefreshCw, Search, BarChart3 } from "lucide-react"
import Link from "next/link"

interface EmailScore {
  id: string
  subject: string
  sender: string
  receivedAt: string
  similarity: number
  importance?: string
}

export default function ScoresPage() {
  const [scores, setScores] = useState<EmailScore[]>([])
  const [filteredScores, setFilteredScores] = useState<EmailScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const fetchScores = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.getPrototypeScores()
      // Handle different response formats
      const scoresData = response.data.scores || response.data.emails || response.data || []
      setScores(scoresData)
      setFilteredScores(scoresData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch similarity scores")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchScores()
  }, [])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredScores(scores)
    } else {
      const filtered = scores.filter(
        (score) =>
          score.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          score.sender.toLowerCase().includes(searchQuery.toLowerCase()),
      )
      setFilteredScores(filtered)
    }
  }, [searchQuery, scores])

  const getScoreStats = () => {
    if (scores.length === 0) return { avg: 0, high: 0, low: 0 }

    const similarities = scores.map((s) => s.similarity)
    const avg = similarities.reduce((a, b) => a + b, 0) / similarities.length
    const high = Math.max(...similarities)
    const low = Math.min(...similarities)

    return { avg, high, low }
  }

  const stats = getScoreStats()

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
              <Button onClick={fetchScores} variant="outline" disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <InsightsNavigation />

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Emails</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{scores.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Average Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{Math.round(stats.avg * 100)}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Highest Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{Math.round(stats.high * 100)}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Lowest Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{Math.round(stats.low * 100)}%</div>
                </CardContent>
              </Card>
            </div>

            {/* Main content */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Similarity Scores
                </CardTitle>
                <CardDescription>
                  Diagnostic view of how each email scores against your expectations prototype
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by subject or sender..."
                      className="pl-10"
                    />
                  </div>

                  {error && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                      <p className="text-destructive">{error}</p>
                    </div>
                  )}

                  {loading && (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                      Loading similarity scores...
                    </div>
                  )}

                  {!loading && !error && (
                    <div className="space-y-2">
                      {filteredScores.length > 0 ? (
                        filteredScores
                          .sort((a, b) => b.similarity - a.similarity)
                          .map((score) => (
                            <Link key={score.id} href={`/emails/${score.id}`}>
                              <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-medium truncate">{score.subject}</h3>
                                  <div className="flex items-center justify-between text-sm text-muted-foreground mt-1">
                                    <span className="truncate">{score.sender}</span>
                                    <span>{new Date(score.receivedAt).toLocaleDateString()}</span>
                                  </div>
                                </div>
                                <div className="ml-4">
                                  <SimilarityBadge similarity={score.similarity} />
                                </div>
                              </div>
                            </Link>
                          ))
                      ) : (
                        <div className="text-center py-12">
                          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                          <p className="text-muted-foreground">
                            {searchQuery ? "No emails match your search" : "No similarity scores available"}
                          </p>
                          <p className="text-sm text-muted-foreground mt-2">
                            {searchQuery
                              ? "Try adjusting your search query"
                              : "Make sure your expectations are set up and emails are classified"}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
