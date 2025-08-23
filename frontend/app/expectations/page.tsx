"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { ExpectationsForm } from "@/components/expectations-form"
import { ConfirmActionModal } from "@/components/confirm-action-modal"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { apiClient, type Expectations } from "@/lib/api-client"
import { RefreshCw, RotateCcw, Zap } from "lucide-react"

export default function ExpectationsPage() {
  const [expectations, setExpectations] = useState<Expectations | null>(null)
  const [savedExamples, setSavedExamples] = useState<{ important: string[]; notImportant: string[] }>({ important: [], notImportant: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showResetModal, setShowResetModal] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isClassifying, setIsClassifying] = useState(false)

  const fetchExpectations = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.getExpectations()
      const server = (response.data as any)?.expectations
      const selectedExampleEmailIds = (response.data as any)?.selectedExampleEmailIds
      
      if (server) {
        setExpectations({ title: server.title, description: server.description, examples: [] })
        const savedExamplesData = {
          important: server.examples?.important || [],
          notImportant: server.examples?.notImportant || [],
        }
        setSavedExamples(savedExamplesData)
        // Pass down selected ids so pickers can pre-check boxes via component props
        setExpectations(prev => {
          const next: any = prev ? { ...prev } : { title: server.title, description: server.description, examples: [] }
          next.__selectedImportantIds = selectedExampleEmailIds?.important || []
          next.__selectedNotImportantIds = selectedExampleEmailIds?.notImportant || []
          return next
        })
      } else {
        setExpectations(null)
        setSavedExamples({ important: [], notImportant: [] })
      }
    } catch (err) {
      // If expectations don't exist yet, that's okay
      if (err instanceof Error && err.message.includes("404")) {
        setExpectations(null)
      } else {
        setError(err instanceof Error ? err.message : "Failed to fetch expectations")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchExpectations()
  }, [])

  const handleSaveExpectations = async (newExpectations: Expectations) => {
    // API call is handled inside the form to include selected email IDs.
    setExpectations(newExpectations)
  }

  const handleTriggerClassification = async () => {
    try {
      setIsClassifying(true)
      await apiClient.batchClassify()
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Failed to trigger classification")
    } finally {
      setIsClassifying(false)
    }
  }

  const handleResetClassifications = async () => {
    try {
      setIsResetting(true)
      await apiClient.resetClassifications()
      setShowResetModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset classifications")
    } finally {
      setIsResetting(false)
    }
  }

  const handleManualClassification = async () => {
    try {
      setIsClassifying(true)
      await apiClient.batchClassify()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger classification")
    } finally {
      setIsClassifying(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background flex">
          <div className="w-64 border-r bg-card">
            <Navigation />
          </div>
          <div className="flex-1 p-8">
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              Loading expectations...
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar */}
        <div className="w-64 border-r bg-card">
          <Navigation />
        </div>

        {/* Main content */}
        <div className="flex-1 p-8">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Expectations</h1>
                <p className="text-muted-foreground mt-2">
                  Define what makes an email important to improve AI classification
                </p>
              </div>
              <Button onClick={fetchExpectations} variant="outline" disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <p className="text-destructive">{error}</p>
              </div>
            )}

            <ExpectationsForm
              expectations={expectations}
              savedExamples={savedExamples}
              onSave={handleSaveExpectations}
              onTriggerClassification={handleTriggerClassification}
              isLoading={loading}
            />

            {/* Classification Controls */}
            <Card>
              <CardHeader>
                <CardTitle>Classification Controls</CardTitle>
                <CardDescription>Manage how your emails are classified based on your expectations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <Button
                    onClick={handleManualClassification}
                    disabled={isClassifying || !expectations}
                    variant="default"
                  >
                    {isClassifying ? (
                      <>
                        <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Classifying...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Classify Emails
                      </>
                    )}
                  </Button>

                  <Button onClick={() => setShowResetModal(true)} disabled={isResetting} variant="outline">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Classifications
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    <strong>Classify Emails:</strong> Run AI classification on unclassified emails using your current
                    expectations
                  </p>
                  <p>
                    <strong>Reset Classifications:</strong> Mark all emails as unclassified to start fresh
                  </p>
                </div>

                {!expectations && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline">Note</Badge>
                    Save your expectations first to enable email classification
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmActionModal
        open={showResetModal}
        onOpenChange={setShowResetModal}
        title="Reset All Classifications?"
        description="This will mark all your emails as unclassified. You can re-classify them later using your expectations. This action cannot be undone."
        actionLabel="Reset Classifications"
        onConfirm={handleResetClassifications}
        variant="destructive"
      />
    </ProtectedRoute>
  )
}
