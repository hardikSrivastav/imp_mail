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

  const {
    data: progress,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<IndexingProgress>({
    queryKey: ["indexing-progress"],
    queryFn: () => apiClient.getIndexingProgress().then((res) => res.data),
    refetchInterval: (q) =>
      q.state.data?.syncState?.currentSyncStatus === "syncing" ? 5000 : false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    placeholderData: (prev) => prev, // keep previous data to avoid flicker
  })

  useEffect(() => {
    if (progress) {
      setIsSyncing(progress.syncState.currentSyncStatus === "syncing")
    }
  }, [progress])

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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Sync Status</CardTitle>
            <CardDescription>Email indexing and synchronization</CardDescription>
          </div>
          <Badge variant={isSyncing ? "default" : "secondary"}>{isSyncing ? "Syncing" : "Idle"}</Badge>
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
                  <span className="font-medium">{Math.round((progress.statistics.indexingProgress || 0) * 100)}%</span>
                </div>
                <Progress value={(progress.statistics.indexingProgress || 0) * 100} />
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

        <div className="flex gap-2">
          <Button onClick={handleTriggerIncremental} disabled={isSyncing} variant="outline" size="sm">
            {isSyncing || isFetching ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Incremental Sync
          </Button>
          <Button onClick={handleTriggerSync} disabled={isSyncing} variant="outline" size="sm">
            {isSyncing || isFetching ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Full Sync
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
