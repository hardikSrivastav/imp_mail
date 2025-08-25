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
  const [offset, setOffset] = useState(0)
  const [totalEmails, setTotalEmails] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        
        if (query.trim()) {
          // Use semantic search when there's a query
          const res = await apiClient.searchEmails({
            query: query.trim(),
            offset: 0,
            limit: 50,
            useSemanticSearch: true,
            combineResults: true
          })
          if (!cancelled) {
            const emailsData = res.data.results?.map((r: any) => r.email) || []
            setEmails(emailsData)
            setTotalEmails(res.data.results?.length || 0)
            setHasMore((emailsData.length || 0) === 50)
            setOffset(0)
          }
        } else {
          // Use regular pagination when no query
          const res = await apiClient.getEmails({ 
            offset: 0, 
            limit: 50 
          })
          if (!cancelled) {
            setEmails(res.data.emails || [])
            setTotalEmails(res.data.total || 0)
            setHasMore((res.data.emails?.length || 0) === 50)
            setOffset(0)
          }
        }
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

  const loadMore = async () => {
    if (loading || !hasMore) return
    
    try {
      setLoading(true)
      const newOffset = offset + 50
      
      if (query.trim()) {
        const res = await apiClient.searchEmails({
          query: query.trim(),
          offset: newOffset,
          limit: 50,
          useSemanticSearch: true,
          combineResults: true
        })
        const emailsData = res.data.results?.map((r: any) => r.email) || []
        setEmails(prev => [...prev, ...emailsData])
        setHasMore((emailsData.length || 0) === 50)
      } else {
        const res = await apiClient.getEmails({ 
          offset: newOffset, 
          limit: 50 
        })
        setEmails(prev => [...prev, ...(res.data.emails || [])])
        setHasMore((res.data.emails?.length || 0) === 50)
      }
      
      setOffset(newOffset)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more emails")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <div className="text-sm font-medium">{label}</div>
        
        {/* Search controls */}
        <div className="space-y-2">
          <Input
            placeholder="Search emails (subject/sender/content)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() && (
            <div className="text-xs text-muted-foreground">
              AI-powered semantic search
            </div>
          )}
        </div>
        
        {error && <div className="text-sm text-destructive">{error}</div>}
        
        {/* Email list */}
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
            <div className="p-3 text-sm text-muted-foreground">
              {query.trim() ? "No emails found" : "No emails"}
            </div>
          )}
        </div>
        
        {/* Pagination and selection info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <>
                <span>{selectedIds.length} selected</span>
                <span>•</span>
              </>
            )}
            <span>Showing {emails.length} of {totalEmails > 0 ? totalEmails : "many"} emails</span>
          </div>
          <div className="flex items-center gap-2">
            {hasMore && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={loadMore}
                disabled={loading}
              >
                {loading ? "Loading..." : "Load More"}
              </Button>
            )}
            {selectedIds.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => onChange([])}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
