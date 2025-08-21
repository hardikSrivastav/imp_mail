"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { EmailContent } from "@/components/email-content"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { apiClient, type Email } from "@/lib/api-client"
import { ArrowLeft, MoreHorizontal, Star, StarOff, Minus, RefreshCw } from "lucide-react"

export default function EmailDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [email, setEmail] = useState<Email | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const emailId = params.id as string

  useEffect(() => {
    const fetchEmail = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await apiClient.getEmail(emailId)
        setEmail(response.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch email")
      } finally {
        setLoading(false)
      }
    }

    if (emailId) {
      fetchEmail()
    }
  }, [emailId])

  const handleImportanceChange = async (importance: "important" | "not_important" | "unclassified") => {
    if (!email) return

    try {
      await apiClient.updateEmailImportance(email.id, importance)
      setEmail({ ...email, importance })
    } catch (err) {
      console.error("Failed to update email importance:", err)
    }
  }

  const getImportanceBadge = (importance?: string) => {
    switch (importance) {
      case "important":
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            Important
          </Badge>
        )
      case "not_important":
        return <Badge variant="secondary">Not Important</Badge>
      case "unclassified":
      default:
        return <Badge variant="outline">Unclassified</Badge>
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
              Loading email...
            </div>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (error || !email) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background flex">
          <div className="w-64 border-r bg-card">
            <Navigation />
          </div>
          <div className="flex-1 p-8">
            <div className="max-w-4xl mx-auto">
              <Button onClick={() => router.back()} variant="ghost" className="mb-6">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <p className="text-destructive">{error || "Email not found"}</p>
              </div>
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
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <Button onClick={() => router.back()} variant="ghost">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to emails
              </Button>

              <div className="flex items-center gap-3">
                {getImportanceBadge(email.importance)}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreHorizontal className="h-4 w-4 mr-2" />
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleImportanceChange("important")}>
                      <Star className="h-4 w-4 mr-2" />
                      Mark Important
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleImportanceChange("not_important")}>
                      <StarOff className="h-4 w-4 mr-2" />
                      Mark Not Important
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleImportanceChange("unclassified")}>
                      <Minus className="h-4 w-4 mr-2" />
                      Mark Unclassified
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <EmailContent
              html={email.html}
              subject={email.subject}
              sender={email.sender}
              receivedAt={email.receivedAt}
            />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
