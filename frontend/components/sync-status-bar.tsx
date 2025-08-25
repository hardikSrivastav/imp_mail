"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { apiClient, type IndexingProgress } from "@/lib/api-client"
import { RefreshCw, Play, AlertCircle } from "lucide-react"

export function SyncStatusBar() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null)
  const [autoInterval, setAutoInterval] = useState<number>(5)

  const {
    data: progress,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<IndexingProgress>({
    queryKey: ["indexing-progress"],
    queryFn: () => apiClient.getIndexingProgress().then((res) => res.data),
    refetchInterval: (q) => {
      const status = q.state.data?.syncState?.currentSyncStatus
      return status === "syncing" ? 5000 : 30000 // poll every 30s when idle to pick up auto-sync
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    placeholderData: (prev) => prev, // keep previous data to avoid flicker
  })

  useEffect(() => {
    if (progress) {
      setIsSyncing(progress.syncState.currentSyncStatus === "syncing")
    }
  }, [progress])

  useEffect(() => {
    // Load auto sync settings once
    (async () => {
      try {
        const res = await apiClient.getAutoSyncSettings()
        setAutoEnabled(Boolean((res.data as any).enabled))
        setAutoInterval(Number((res.data as any).intervalMinutes || 5))
      } catch {}
    })()
  }, [])

  const handleTriggerIncremental = async () => {
    try {
      setError(null)
      await apiClient.triggerIncrementalIndexing()
      setIsSyncing(true)
      refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger indexing")
    }
  }

  const handleTriggerSync = async () => {
    try {
      setError(null)
      await apiClient.triggerSyncIndexing()
      setIsSyncing(true)
      refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger sync")
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Sync Status</CardTitle>
            <CardDescription className="text-sm">Email indexing and synchronization</CardDescription>
          </div>
          <Badge variant={isSyncing ? "default" : "secondary"} className="self-start sm:self-auto">{isSyncing ? "Syncing" : "Idle"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {progress && (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Emails</span>
              <span className="font-medium">{progress.statistics?.totalEmails?.toLocaleString() || '0'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Vectorized</span>
              <span className="font-medium">{progress.statistics?.vectorizedEmails?.toLocaleString() || '0'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Indexed</span>
              <span className="font-medium">{progress.syncState.totalEmailsIndexed?.toLocaleString() || '0'}</span>
            </div>

            {progress.statistics?.indexingProgress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{Math.round(progress.statistics.indexingProgress || 0)}%</span>
                </div>
                <Progress value={progress.statistics.indexingProgress || 0} />
              </div>
            )}

            {progress.syncState.lastSyncAt && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Sync</span>
                <span className="font-medium">{new Date(progress.syncState.lastSyncAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {!progress && !isLoading && (
          <div className="text-sm text-muted-foreground">
            No sync data available
          </div>
        )}

        {isLoading && (
          <div className="text-sm text-muted-foreground">
            Loading sync status...
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error || "Failed to load sync status"}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleTriggerIncremental} disabled={isSyncing} variant="outline" size="sm" className="w-full sm:w-auto">
            {isSyncing || isFetching ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Incremental Sync
          </Button>
          <Button onClick={handleTriggerSync} disabled={isSyncing} variant="outline" size="sm" className="w-full sm:w-auto">
            {isSyncing || isFetching ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Full Sync
          </Button>
          {autoEnabled !== null && (
            <Button
              onClick={async () => {
                try {
                  const next = !autoEnabled
                  setAutoEnabled(next)
                  await apiClient.updateAutoSyncSettings({ enabled: next })
                } catch (e) {
                  setAutoEnabled(!autoEnabled)
                }
              }}
              variant={autoEnabled ? "default" : "outline"}
              size="sm"
              className="w-full sm:w-auto"
            >
              {autoEnabled ? 'Auto Sync: On' : 'Auto Sync: Off'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
