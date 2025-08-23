"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EmailPicker } from "@/components/email-picker"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"

export default function BulkLabelPage() {
  const { user } = useAuth()
  const [importantIds, setImportantIds] = useState<string[]>([])
  const [unimportantIds, setUnimportantIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [classificationResults, setClassificationResults] = useState<any>(null)
  const [modelStats, setModelStats] = useState<any>(null)

  const canSubmit = importantIds.length > 0 || unimportantIds.length > 0

  const handleSubmit = async () => {
    if (!user?.id) {
      setError("User not authenticated")
      return
    }

    if (importantIds.length === 0 && unimportantIds.length === 0) {
      setError("Please select at least one email to label")
      return
    }

    const totalEmails = importantIds.length + unimportantIds.length
    if (totalEmails > 50) {
      const confirmed = window.confirm(`You're about to label ${totalEmails} emails. This may take a while. Continue?`)
      if (!confirmed) {
        return
      }
    }

    try {
      setIsSubmitting(true)
      setError(null)
      setSuccess(null)
      setProgress({ current: 0, total: importantIds.length + unimportantIds.length })

      const response = await apiClient.bulkLabel({
        user_id: user.id,
        important_email_ids: importantIds,
        unimportant_email_ids: unimportantIds
      }, (current, total) => {
        setProgress({ current, total })
      })

      // Count successful updates
      const successfulUpdates = response.data.results.filter((r: any) => r.success).length
      const failedUpdates = response.data.results.filter((r: any) => !r.success).length
      
      if (failedUpdates > 0) {
        setError(`${successfulUpdates} emails updated successfully, ${failedUpdates} failed`)
      } else {
        const totalExamples = modelStats?.total_examples || 0
        const newTotal = totalExamples + successfulUpdates
        const trainingStatus = newTotal >= 10 ? "Model will be trained automatically!" : `Need ${10 - newTotal} more examples to train`
        setSuccess(`Successfully labeled ${successfulUpdates} emails. ${trainingStatus}`)
      }
      
      // Clear selections after submission
      setImportantIds([])
      setUnimportantIds([])

      // Get classification results for unlabeled emails to demonstrate model learning
      if (modelStats?.total_examples >= 10) {
        try {
          // Get some emails and filter for unclassified ones
          const allEmails = await apiClient.getEmails({ 
            offset: 0, 
            limit: 50
          })
          
          if (allEmails.data.emails?.length > 0) {
            // Filter for unclassified emails
            const unclassifiedEmails = allEmails.data.emails.filter((email: any) => 
              email.importance === "unclassified" || !email.importance
            ).slice(0, 10)
            
            if (unclassifiedEmails.length > 0) {
              const unclassifiedIds = unclassifiedEmails.map((email: any) => email.id)
              const classificationData = await apiClient.getClassificationResults(user.id, unclassifiedIds)
              if (classificationData) {
                setClassificationResults(classificationData)
              }
            }
          }
        } catch (error) {
          console.error('Failed to get classification results for unlabeled emails:', error)
        }
      }
      
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit bulk labels")
    } finally {
      setIsSubmitting(false)
      setProgress(null)
    }
  }

  const [isResetting, setIsResetting] = useState(false)

  const handleReset = async () => {
    if (!user?.id) return

    const confirmed = window.confirm(
      "This will completely reset your AI model training data. All labeled examples will be lost and the model will need to be retrained from scratch. Are you sure you want to continue?"
    )

    if (!confirmed) return

    try {
      setIsResetting(true)
      setError(null)
      setSuccess(null)

      // Reset the model in FastAPI
      await apiClient.resetModel(user.id)

      // Clear frontend state
      setImportantIds([])
      setUnimportantIds([])
      setClassificationResults(null)
      setModelStats(null)

      // Reload model stats to show reset state
      const stats = await apiClient.getModelStats(user.id)
      setModelStats(stats)

      setSuccess("Model training data has been reset successfully. You can now start fresh with new labeled examples.")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to reset model")
    } finally {
      setIsResetting(false)
    }
  }

  // Load model stats on component mount
  useEffect(() => {
    if (user?.id) {
      apiClient.getModelStats(user.id).then(stats => {
        setModelStats(stats)
      }).catch(error => {
        console.error('Failed to load model stats:', error)
      })
    }
  }, [user?.id])

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar */}
        <div className="w-64 border-r bg-card">
          <Navigation />
        </div>

        {/* Main content */}
        <div className="flex-1 p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            <div>
              <h1 className="text-3xl font-bold">Bulk Email Labeling</h1>
              <p className="text-muted-foreground mt-2">
                Select emails and label them as important or unimportant in bulk. This will help train the AI classifier.
              </p>
            </div>

            {/* Status messages */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg p-3">
                {success}
              </div>
            )}

            {/* Progress indicator */}
            {progress && (
              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Processing {progress.current} of {progress.total} emails...
              </div>
            )}

            {/* Selection summary */}
            {(importantIds.length > 0 || unimportantIds.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Selection Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{importantIds.length}</span>
                      <span className="text-muted-foreground">important emails</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{unimportantIds.length}</span>
                      <span className="text-muted-foreground">unimportant emails</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{importantIds.length + unimportantIds.length}</span>
                      <span className="text-muted-foreground">total selected</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Email selection */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Important Emails
                  </CardTitle>
                  <CardDescription>
                    Select emails that are important to you
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EmailPicker 
                    label="Important emails" 
                    selectedIds={importantIds} 
                    onChange={setImportantIds} 
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Unimportant Emails
                  </CardTitle>
                  <CardDescription>
                    Select emails that are not important to you
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EmailPicker 
                    label="Unimportant emails" 
                    selectedIds={unimportantIds} 
                    onChange={setUnimportantIds} 
                  />
                </CardContent>
              </Card>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={handleReset}
                disabled={isSubmitting || isResetting}
                className="min-w-[100px]"
              >
                {isResetting ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Resetting...
                  </>
                ) : (
                  "Reset Model"
                )}
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={!canSubmit || isSubmitting || isResetting}
                className="min-w-[120px]"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Labels
                  </>
                )}
              </Button>
            </div>

            {/* Classification Results */}
            {classificationResults && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    AI Predictions for Unclassified Emails
                    {classificationResults.model_version === "not_trained" && (
                      <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded">
                        Model Not Trained
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {classificationResults.model_version === "not_trained" 
                      ? "Your model needs more training examples before it can classify emails. Continue labeling emails to train the AI."
                      : "The AI classifier's predictions for unclassified emails in your inbox. These predictions help you see how well the model learned from your labeled examples."
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {classificationResults.results?.map((result: any) => (
                      <div key={result.email_id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            {result.email_id.length > 20 ? `${result.email_id.substring(0, 20)}...` : result.email_id}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Confidence: {(result.confidence * 100).toFixed(1)}%
                            {result.reasoning && (
                              <div className="mt-1 text-xs italic">
                                Reasoning: {result.reasoning}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            result.is_important 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {result.is_important ? 'Important' : 'Not Important'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Classification Summary */}
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm font-medium mb-2">Classification Summary</div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">Total classified:</span>
                        <span className="ml-2 font-medium">{classificationResults.results?.length || 0}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Average confidence:</span>
                        <span className="ml-2 font-medium">
                          {classificationResults.results?.length > 0 
                            ? ((classificationResults.results.reduce((sum: number, r: any) => sum + r.confidence, 0) / classificationResults.results.length) * 100).toFixed(1)
                            : '0'
                          }%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Predicted important:</span>
                        <span className="ml-2 font-medium">
                          {classificationResults.results?.filter((r: any) => r.is_important).length || 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Predicted not important:</span>
                        <span className="ml-2 font-medium">
                          {classificationResults.results?.filter((r: any) => !r.is_important).length || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {classificationResults.model_version && (
                    <div className="mt-4 text-xs text-muted-foreground">
                      Model version: {classificationResults.model_version}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
