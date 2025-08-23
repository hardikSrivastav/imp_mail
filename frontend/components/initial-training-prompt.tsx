"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EmailPicker } from "@/components/email-picker"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle, Mail, Sparkles } from "lucide-react"

interface InitialTrainingPromptProps {
  onComplete: () => void
}

export function InitialTrainingPrompt({ onComplete }: InitialTrainingPromptProps) {
  const { user } = useAuth()
  const [importantIds, setImportantIds] = useState<string[]>([])
  const [unimportantIds, setUnimportantIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

  const minRequired = 5
  const canSubmit = importantIds.length >= minRequired && unimportantIds.length >= minRequired

  const handleSubmit = async () => {
    if (!user?.id) {
      setError("User not authenticated")
      return
    }

    if (importantIds.length < minRequired || unimportantIds.length < minRequired) {
      setError(`Please select at least ${minRequired} important and ${minRequired} unimportant emails`)
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
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
        setError(`${successfulUpdates} emails labeled successfully, ${failedUpdates} failed. Please try again.`)
      } else {
        // Success! The model should now be trained
        onComplete()
      }
      
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit initial training data")
    } finally {
      setIsSubmitting(false)
      setProgress(null)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">Welcome to Intelligent Email Filtering!</h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            To get started, we need you to help train our AI by selecting some examples of important and unimportant emails from your inbox.
          </p>
        </div>

        {/* Instructions */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Initial Training Setup
            </CardTitle>
            <CardDescription>
              Please select at least <strong>{minRequired} important</strong> and <strong>{minRequired} unimportant</strong> emails to train your personal AI classifier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-sm font-medium">
                  1
                </div>
                <div>
                  <h4 className="font-medium">Select Important Emails</h4>
                  <p className="text-sm text-muted-foreground">Choose emails that are valuable and require your attention</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-medium">
                  2
                </div>
                <div>
                  <h4 className="font-medium">Select Unimportant Emails</h4>
                  <p className="text-sm text-muted-foreground">Choose emails that are not relevant or low priority</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 bg-purple-100 text-purple-800 rounded-full flex items-center justify-center text-sm font-medium">
                  3
                </div>
                <div>
                  <h4 className="font-medium">Train Your AI</h4>
                  <p className="text-sm text-muted-foreground">We'll use these examples to train your personal classifier</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status messages */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Progress indicator */}
        {progress && (
          <Alert>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <AlertDescription>
              Processing {progress.current} of {progress.total} emails...
            </AlertDescription>
          </Alert>
        )}

        {/* Selection summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Training Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${importantIds.length >= minRequired ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="font-medium">Important Emails</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{importantIds.length}</span>
                  <span className="text-sm text-muted-foreground">/ {minRequired} required</span>
                  {importantIds.length >= minRequired && <CheckCircle className="h-4 w-4 text-green-500" />}
                </div>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${unimportantIds.length >= minRequired ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="font-medium">Unimportant Emails</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{unimportantIds.length}</span>
                  <span className="text-sm text-muted-foreground">/ {minRequired} required</span>
                  {unimportantIds.length >= minRequired && <CheckCircle className="h-4 w-4 text-green-500" />}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Email selection */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                Important Emails
                <span className="text-sm font-normal text-muted-foreground">
                  ({importantIds.length}/{minRequired}+ required)
                </span>
              </CardTitle>
              <CardDescription>
                Select emails that are valuable, urgent, or require your attention
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
              <CardTitle className="flex items-center gap-2 text-gray-700">
                Unimportant Emails
                <span className="text-sm font-normal text-muted-foreground">
                  ({unimportantIds.length}/{minRequired}+ required)
                </span>
              </CardTitle>
              <CardDescription>
                Select emails that are spam, newsletters, or low priority
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
        <div className="flex justify-center gap-4">
          <Button 
            onClick={onComplete}
            variant="outline"
            size="lg"
            disabled={isSubmitting}
          >
            Skip for Now
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!canSubmit || isSubmitting}
            size="lg"
            className="min-w-[200px]"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Training AI...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Start Training AI
              </>
            )}
          </Button>
        </div>

        {/* Footer note */}
        <div className="text-center text-sm text-muted-foreground">
          <p>Don't worry, you can always add more training examples later in the Bulk Labeling section.</p>
        </div>
      </div>
    </div>
  )
}
