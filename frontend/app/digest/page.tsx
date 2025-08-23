"use client"

import { useState, useEffect } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { apiClient } from "@/lib/api-client"
import Link from "next/link"

export default function DigestPage() {
  const [loading, setLoading] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Array<{ emailId: string; subject: string; sender: string; receivedAt: string; similarity: number }>>([])
  const [digestSettings, setDigestSettings] = useState<{ emailFilter: 'all' | 'important'; windowHours?: number } | null>(null)

  // Load digest settings on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setSettingsLoading(true)
        const res = await apiClient.getDigestSettings()
        const settings = res.data
        setDigestSettings({
          emailFilter: settings.emailFilter || 'all',
          windowHours: 12 // Default window hours
        })
      } catch (e) {
        console.error('Failed to load digest settings:', e)
        // Use defaults if settings can't be loaded
        setDigestSettings({
          emailFilter: 'all',
          windowHours: 12
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
        windowHours: digestSettings.windowHours
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
        <div className="w-64 border-r bg-card">
          <Navigation />
        </div>
        <div className="flex-1 p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Digest</h1>
                <p className="text-muted-foreground mt-2">Preview relevant threads for a recent window</p>
              </div>
              <div className="flex gap-2">
                <Link href="/digest/history">
                  <Button variant="outline">View History</Button>
                </Link>
                <Link href="/digest/settings">
                  <Button variant="outline">Settings</Button>
                </Link>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Digest Preview</CardTitle>
                <CardDescription>
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
                <div className="flex gap-2">
                  <Button 
                    onClick={runPreview} 
                    disabled={loading || settingsLoading || !digestSettings}
                  >
                    {loading ? 'Computing…' : settingsLoading ? 'Loading settings…' : 'Preview Digest'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => window.location.reload()}
                    disabled={loading || settingsLoading}
                    title="Refresh to load latest settings"
                  >
                    Refresh
                  </Button>
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
                <CardTitle>Results</CardTitle>
                <CardDescription>
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
                  <div key={r.emailId} className="border rounded p-3">
                    <div className="text-sm font-medium">{r.subject || '(no subject)'}</div>
                    <div className="text-xs text-muted-foreground">{r.sender} · {new Date(r.receivedAt).toLocaleString()}</div>
                    <div className="text-xs">relevance: {r.similarity.toFixed(3)}</div>
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
