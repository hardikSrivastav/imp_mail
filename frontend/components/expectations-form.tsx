"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Expectations } from "@/lib/api-client"
import { Plus, X, Save, AlertCircle } from "lucide-react"

interface ExpectationsFormProps {
  expectations: Expectations | null
  onSave: (expectations: Expectations) => Promise<void>
  onTriggerClassification?: () => Promise<void>
  isLoading?: boolean
}

export function ExpectationsForm({ expectations, onSave, onTriggerClassification, isLoading }: ExpectationsFormProps) {
  const [title, setTitle] = useState(expectations?.title || "")
  const [description, setDescription] = useState(expectations?.description || "")
  const [examples, setExamples] = useState<string[]>(expectations?.examples || [""])
  const [showClassificationDialog, setShowClassificationDialog] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addExample = () => {
    setExamples([...examples, ""])
  }

  const removeExample = (index: number) => {
    if (examples.length > 1) {
      setExamples(examples.filter((_, i) => i !== index))
    }
  }

  const updateExample = (index: number, value: string) => {
    const newExamples = [...examples]
    newExamples[index] = value
    setExamples(newExamples)
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setError(null)

      // Validation
      if (!title.trim()) {
        setError("Title is required")
        return
      }
      if (!description.trim()) {
        setError("Description is required")
        return
      }

      const filteredExamples = examples.filter((example) => example.trim())
      if (filteredExamples.length === 0) {
        setError("At least one example is required")
        return
      }

      const expectationsData: Expectations = {
        title: title.trim(),
        description: description.trim(),
        examples: filteredExamples,
      }

      await onSave(expectationsData)

      // Show classification dialog if we have the trigger function
      if (onTriggerClassification) {
        setShowClassificationDialog(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expectations")
    } finally {
      setIsSaving(false)
    }
  }

  const handleTriggerClassification = async () => {
    if (onTriggerClassification) {
      try {
        await onTriggerClassification()
        setShowClassificationDialog(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to trigger classification")
      }
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Email Expectations</CardTitle>
          <CardDescription>
            Define what types of emails are important to you. This helps the AI classify your emails more accurately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., What I consider important"
              disabled={isLoading || isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the kinds of emails you want to prioritize..."
              rows={4}
              disabled={isLoading || isSaving}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Examples</Label>
              <Button type="button" variant="outline" size="sm" onClick={addExample} disabled={isLoading || isSaving}>
                <Plus className="h-4 w-4 mr-2" />
                Add Example
              </Button>
            </div>

            <div className="space-y-3">
              {examples.map((example, index) => (
                <div key={index} className="flex gap-2">
                  <div className="flex-1">
                    <Textarea
                      value={example}
                      onChange={(e) => updateExample(index, e.target.value)}
                      placeholder={`Example ${index + 1}: Describe an important email...`}
                      rows={3}
                      disabled={isLoading || isSaving}
                    />
                  </div>
                  {examples.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeExample(index)}
                      disabled={isLoading || isSaving}
                      className="mt-1"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={isLoading || isSaving}>
              {isSaving ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Expectations
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showClassificationDialog} onOpenChange={setShowClassificationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-run Email Classification?</AlertDialogTitle>
            <AlertDialogDescription>
              Your expectations have been saved successfully. Would you like to re-classify your existing emails based
              on these new expectations? This will help improve the accuracy of your email filtering.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Skip for now</AlertDialogCancel>
            <AlertDialogAction onClick={handleTriggerClassification}>Yes, re-classify emails</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
