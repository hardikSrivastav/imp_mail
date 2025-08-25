"use client"

import { useState, useEffect } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { apiClient } from "@/lib/api-client"
import Link from "next/link"

export default function DigestPage() {
  const [loading, setLoading] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Array<{ 
    emailId: string; 
    subject: string; 
    sender: string; 
    receivedAt: string; 
    similarity: number;
    summary?: string;
  }>>([])
  const [digestSettings, setDigestSettings] = useState<{ 
    emailFilter: 'all' | 'important'; 
    windowHours?: number;
    generateSummaries?: boolean;
  } | null>(null)
  const [includeSummaries, setIncludeSummaries] = useState(true)

  // Load digest settings on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setSettingsLoading(true)
        const res = await apiClient.getDigestSettings()
        const settings = res.data
        setDigestSettings({
          emailFilter: settings.emailFilter || 'all',
          windowHours: 12, // Default window hours
          generateSummaries: true // Default to generating summaries
        })
      } catch (e) {
        console.error('Failed to load digest settings:', e)
        // Use defaults if settings can't be loaded
        setDigestSettings({
          emailFilter: 'all',
          windowHours: 12,
          generateSummaries: true
        })
      } finally {
        setSettingsLoading(false)
      }
    }
    loadSettings()
  }, [])

  const runPreview = async () => {
    if (!digestSettings) return
    
    try {
      setLoading(true)
      setError(null)
      const res = await apiClient.computeDigest({ 
        dryRun: true,
        emailFilter: digestSettings.emailFilter,
        windowHours: digestSettings.windowHours,
        generateSummaries: includeSummaries,
        skipSummaries: !includeSummaries
      })
      const data = res.data as any
      setResults(data.results || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compute digest")
    } finally {
      setLoading(false)
    }
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
                <h1 className="text-2xl lg:text-3xl font-bold">Digest</h1>
                <p className="text-muted-foreground mt-2 text-sm lg:text-base">Preview relevant threads for a recent window</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link href="/digest/history">
                  <Button variant="outline" className="w-full sm:w-auto">View History</Button>
                </Link>
                <Link href="/digest/settings">
                  <Button variant="outline" className="w-full sm:w-auto">Settings</Button>
                </Link>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg lg:text-xl">Digest Preview</CardTitle>
                <CardDescription className="text-sm">
                  Preview your personalized email digest based on current settings
                  {digestSettings && (
                    <span className="block mt-1 text-xs">
                      Filter: <span className="font-medium">
                        {digestSettings.emailFilter === 'important' ? 'Important emails only' : 'All emails'}
                      </span>
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="include-summaries"
                      checked={includeSummaries}
                      onCheckedChange={setIncludeSummaries}
                    />
                    <Label htmlFor="include-summaries" className="text-sm">Include summaries</Label>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button 
                      onClick={runPreview} 
                      disabled={loading || settingsLoading || !digestSettings}
                      className="w-full sm:w-auto"
                    >
                      {loading ? 'Computing…' : settingsLoading ? 'Loading settings…' : 'Preview Digest'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => window.location.reload()}
                      disabled={loading || settingsLoading}
                      title="Refresh to load latest settings"
                      className="w-full sm:w-auto"
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
                {digestSettings?.emailFilter === 'important' && (
                  <p className="text-sm text-muted-foreground">
                    This preview will only show emails that have been classified as important by your AI model.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg lg:text-xl">Results</CardTitle>
                <CardDescription className="text-sm">
                  {results.length} relevant threads found
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {error && <div className="text-sm text-destructive">{error}</div>}
                {results.length === 0 && !loading && digestSettings && (
                  <div className="text-sm text-muted-foreground">
                    {digestSettings.emailFilter === 'important' 
                      ? "No important emails found in the current window. Try training your AI model with more examples or check if you have emails classified as important."
                      : "No relevant threads found"
                    }
                  </div>
                )}
                {results.map((r) => (
                  <div key={r.emailId} className="border rounded p-3 lg:p-4 space-y-2">
                    <div className="text-sm font-medium break-words">{r.subject || '(no subject)'}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.sender} · {new Date(r.receivedAt).toLocaleString()} · relevance: {r.similarity.toFixed(3)}
                    </div>
                    {r.summary && (
                      <div className="text-sm text-foreground bg-muted/30 rounded p-2 mt-2">
                        {r.summary}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
