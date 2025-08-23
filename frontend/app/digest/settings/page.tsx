"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { apiClient } from "@/lib/api-client"

export default function DigestSettingsPage() {
  const [enabled, setEnabled] = useState(true)
  const [times, setTimes] = useState<string[]>(["11:00","21:00"])
  const [timezone, setTimezone] = useState("Asia/Kolkata")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await apiClient.getDigestSettings()
        const d = res.data
        setEnabled(Boolean(d.enabled))
        setTimes(Array.isArray(d.times) && d.times.length ? d.times : ["11:00","21:00"])
        setTimezone(d.timezone || "Asia/Kolkata")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load settings")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const updateTime = (index: number, value: string) => {
    const next = [...times]
    next[index] = value
    setTimes(next)
  }

  const addTime = () => setTimes([...times, "12:00"])
  const removeTime = (i: number) => setTimes(times.filter((_, idx) => idx !== i))

  const save = async () => {
    try {
      setSaving(true)
      setError(null)
      setMessage(null)
      await apiClient.updateDigestSettings({ enabled, times, timezone })
      setMessage("Saved")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex">
        <div className="w-64 border-r bg-card">
          <Navigation />
        </div>
        <div className="flex-1 p-8">
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-bold">Digest Settings</h1>
              <p className="text-muted-foreground mt-2">Configure when to receive relevant thread digests</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>Enable and schedule your digests</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && <div className="text-sm text-destructive">{error}</div>}
                {message && <div className="text-sm text-green-600">{message}</div>}

                <div className="flex items-center justify-between">
                  <Label>Enable digest</Label>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>

                <div className="space-y-2">
                  <Label>Times (24h, HH:MM)</Label>
                  <div className="space-y-2">
                    {times.map((t, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={t} onChange={(e) => updateTime(i, e.target.value)} placeholder="11:00" className="max-w-[160px]" />
                        {times.length > 1 && (
                          <Button type="button" variant="ghost" onClick={() => removeTime(i)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" onClick={addTime}>Add time</Button>
                </div>

                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Kolkata" className="max-w-[260px]" />
                </div>

                <Button onClick={save} disabled={saving || loading}>{saving ? 'Saving…' : 'Save Settings'}</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
