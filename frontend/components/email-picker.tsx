"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { apiClient, type Email } from "@/lib/api-client"

interface EmailPickerProps {
  label: string
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function EmailPicker({ label, selectedIds, onChange }: EmailPickerProps) {
  const [query, setQuery] = useState("")
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await apiClient.getEmails({ limit: 50, q: query || undefined })
        if (!cancelled) setEmails(res.data.emails || [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load emails")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    const t = setTimeout(load, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="text-sm font-medium">{label}</div>
        <Input
          placeholder="Search emails (subject/sender)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="max-h-64 overflow-auto divide-y rounded border">
          {loading && emails.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">Loading…</div>
          )}
          {emails.map((e) => (
            <label key={e.id} className="flex items-start gap-2 p-2 hover:bg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={selectedSet.has(e.id)}
                onChange={() => toggle(e.id)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="text-sm font-medium line-clamp-1">{e.subject || "(no subject)"}</div>
                <div className="text-xs text-muted-foreground line-clamp-1">
                  {e.sender} · {e.receivedAt ? new Date(e.receivedAt).toLocaleString() : ""}
                </div>
              </div>
            </label>
          ))}
          {!loading && emails.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">No emails</div>
          )}
        </div>
        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div>{selectedIds.length} selected</div>
            <Button variant="ghost" size="sm" onClick={() => onChange([])}>
              Clear
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
