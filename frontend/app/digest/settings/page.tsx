"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiClient } from "@/lib/api-client"

export default function DigestSettingsPage() {
  const [enabled, setEnabled] = useState(true)
  const [times, setTimes] = useState<string[]>(["11:00","21:00"])
  const [timezone, setTimezone] = useState("Asia/Kolkata")
  const [emailFilter, setEmailFilter] = useState<'all' | 'important'>('all')
  const [emailDelivery, setEmailDelivery] = useState<'email' | 'none'>('email')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
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
        setEmailFilter(d.emailFilter || 'all')
        setEmailDelivery(d.emailDelivery || 'email')
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

  const addTime = () => {
    if (times.length < 2) {
      setTimes([...times, "12:00"])
    }
  }
  const removeTime = (i: number) => setTimes(times.filter((_, idx) => idx !== i))

  const save = async () => {
    try {
      setSaving(true)
      setError(null)
      setMessage(null)
      await apiClient.updateDigestSettings({ enabled, times, timezone, emailFilter, emailDelivery })
      setMessage("Saved")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const testEmail = async () => {
    try {
      setTesting(true)
      setError(null)
      setMessage(null)
      await apiClient.testDigestEmail()
      setMessage("Test email sent successfully!")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send test email")
    } finally {
      setTesting(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex">
        {/* Navigation component - handles both mobile and desktop */}
        <Navigation />
        
        <div className="flex-1 p-4 lg:p-8">
          <div className="max-w-3xl mx-auto space-y-4 lg:space-y-6">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold">Digest Settings</h1>
              <p className="text-muted-foreground mt-2 text-sm lg:text-base">Configure when to receive relevant thread digests</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg lg:text-xl">Preferences</CardTitle>
                <CardDescription className="text-sm">Enable and schedule your digests</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && <div className="text-sm text-destructive">{error}</div>}
                {message && <div className="text-sm text-green-600">{message}</div>}

                <div className="flex items-center justify-between">
                  <Label className="text-sm lg:text-base">Enable digest</Label>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm lg:text-base">Times (24h, HH:MM) - Max 2 per day</Label>
                  <div className="space-y-2">
                    {times.map((t, i) => (
                      <div key={i} className="flex flex-col sm:flex-row gap-2">
                        <Input value={t} onChange={(e) => updateTime(i, e.target.value)} placeholder="11:00" className="max-w-[160px]" />
                        {times.length > 1 && (
                          <Button type="button" variant="ghost" onClick={() => removeTime(i)} className="w-full sm:w-auto">
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {times.length < 2 && (
                    <Button type="button" variant="outline" onClick={addTime} className="w-full sm:w-auto">Add time</Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm lg:text-base">Timezone</Label>
                  <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Kolkata" className="max-w-[260px]" />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm lg:text-base">Email Filter</Label>
                  <Select value={emailFilter} onValueChange={(value: 'all' | 'important') => setEmailFilter(value)}>
                    <SelectTrigger className="max-w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All emails</SelectItem>
                      <SelectItem value="important">Important emails only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Choose whether to include all emails or only those marked as important in your digest.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm lg:text-base">Email Delivery</Label>
                  <Select value={emailDelivery} onValueChange={(value: 'email' | 'none') => setEmailDelivery(value)}>
                    <SelectTrigger className="max-w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Send via email</SelectItem>
                      <SelectItem value="none">Archive only (no email)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Choose whether to receive digest emails or just archive them for viewing in the app.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={save} disabled={saving || loading} className="w-full sm:w-auto">
                    {saving ? 'Saving…' : 'Save Settings'}
                  </Button>
                  {emailDelivery === 'email' && (
                    <Button onClick={testEmail} variant="outline" disabled={testing || loading} className="w-full sm:w-auto">
                      {testing ? 'Sending…' : 'Test Email'}
                    </Button>
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
