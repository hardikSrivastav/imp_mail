"use client"

import { useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiClient } from "@/lib/api-client"

export default function DigestPage() {
  const [windowHours, setWindowHours] = useState<number>(12)
  const [threshold, setThreshold] = useState<number>(0.6)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Array<{ emailId: string; subject: string; sender: string; receivedAt: string; similarity: number }>>([])

  const runPreview = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await apiClient.computeDigest({ windowHours, threshold, dryRun: true })
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
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Digest Settings (Preview)</CardTitle>
                <CardDescription>Windowed, thread-first, thresholded</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Window (hours)</Label>
                    <Input type="number" value={windowHours} min={1} max={72} onChange={(e) => setWindowHours(parseInt(e.target.value || '12'))} />
                  </div>
                  <div>
                    <Label>Threshold</Label>
                    <Input type="number" step="0.01" min={0} max={1} value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value || '0.6'))} />
                  </div>
                </div>
                <Button onClick={runPreview} disabled={loading}>
                  {loading ? 'Computing…' : 'Preview Digest'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Results</CardTitle>
                <CardDescription>{results.length} threads</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {error && <div className="text-sm text-destructive">{error}</div>}
                {results.length === 0 && !loading && (
                  <div className="text-sm text-muted-foreground">No items in the current window</div>
                )}
                {results.map((r) => (
                  <div key={r.emailId} className="border rounded p-3">
                    <div className="text-sm font-medium">{r.subject || '(no subject)'}</div>
                    <div className="text-xs text-muted-foreground">{r.sender} · {new Date(r.receivedAt).toLocaleString()}</div>
                    <div className="text-xs">score: {r.similarity.toFixed(3)}</div>
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
