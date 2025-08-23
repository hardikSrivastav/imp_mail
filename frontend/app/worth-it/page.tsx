"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SearchBox } from "@/components/search-box"
import { PaginationControls } from "@/components/pagination-controls"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
// Icons removed
import Link from "next/link"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface EmailWithScore {
  email: any
  score?: {
    email_id: string
    is_important: boolean
    confidence: number
    reasoning?: string
  }
}

export default function WorthItPage() {
  const { user } = useAuth()
  const [emailsWithScores, setEmailsWithScores] = useState<EmailWithScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [totalEmails, setTotalEmails] = useState(0)
  const [scoreFilter, setScoreFilter] = useState<string>("all")
  const [modelStats, setModelStats] = useState<any>(null)

  const fetchEmailsWithScores = async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      setError(null)

      const offset = (currentPage - 1) * itemsPerPage
      const params: any = { offset, limit: itemsPerPage }

      const hasQuery = Boolean(searchQuery.trim())
      let response

      if (hasQuery) {
        // For search, get emails first then get scores
        const searchResponse = await apiClient.searchEmails({ 
          query: searchQuery.trim(), 
          offset, 
          limit: itemsPerPage, 
          useSemanticSearch: true, 
          combineResults: true 
        })
        const emails = searchResponse.data.results?.map((r: any) => r.email) || []
        const totalResults = searchResponse.data.total || emails.length
        
        if (emails.length > 0) {
          const emailIds = emails.map((email: any) => email.id)
          const scoresResponse = await apiClient.getClassificationResults(user.id, emailIds)
          const scores = scoresResponse?.results || []
          
          const combined = emails.map((email: any) => ({
            email,
            score: scores.find((s: any) => s.email_id === email.id)
          }))
          
          setEmailsWithScores(combined)
          setTotalEmails(totalResults)
        } else {
          setEmailsWithScores([])
          setTotalEmails(0)
        }
      } else {
        // Get emails with scores
        response = await apiClient.getEmailsWithScores(user.id, params)
        const emails = response.data.emails || []
        const scores = response.data.scores || []
        const total = response.data.total || emails.length
        
        const combined = emails.map((email: any) => ({
          email,
          score: scores.find((s: any) => s.email_id === email.id)
        }))
        
        setEmailsWithScores(combined)
        setTotalEmails(total)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch emails")
    } finally {
      setLoading(false)
    }
  }

  const loadModelStats = async () => {
    if (!user?.id) return
    
    try {
      const stats = await apiClient.getModelStats(user.id)
      setModelStats(stats)
    } catch (error) {
      console.error('Failed to load model stats:', error)
    }
  }



  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setCurrentPage(1)
  }

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (user?.id) {
        fetchEmailsWithScores()
      }
    }, 300) // 300ms delay

    return () => clearTimeout(timeoutId)
  }, [searchQuery, currentPage, itemsPerPage, user?.id])

  // Remove the old useEffect that was causing double calls
  useEffect(() => {
    if (user?.id) {
      loadModelStats()
    }
  }, [user?.id])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1)
  }

  const handleImportanceChange = async (id: string, importance: "important" | "not_important" | "unclassified") => {
    try {
      await apiClient.updateEmailImportance(id, importance)
      // Refresh the data to show updated importance
      await fetchEmailsWithScores()
    } catch (err) {
      console.error("Failed to update email importance:", err)
    }
  }

  const getScoreColor = (confidence: number, isImportant: boolean) => {
    if (confidence >= 0.8) {
      return isImportant ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
    } else if (confidence >= 0.6) {
      return isImportant ? "bg-yellow-100 text-yellow-800" : "bg-orange-100 text-orange-800"
    } else {
      return "bg-gray-100 text-gray-800"
    }
  }

  // Score icons removed for cleaner UI

  const filteredEmails = emailsWithScores.filter(item => {
    if (scoreFilter === "all") return true
    if (scoreFilter === "high_confidence" && item.score) {
      return item.score.confidence >= 0.8
    }
    if (scoreFilter === "important" && item.score) {
      return item.score.is_important
    }
    if (scoreFilter === "not_important" && item.score) {
      return !item.score.is_important
    }
    return true
  })

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar */}
        <div className="w-64 border-r bg-card">
          <Navigation />
        </div>

        {/* Main content */}
        <div className="flex-1 p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Emails</h1>
                <p className="text-muted-foreground mt-2">
                  Manage your emails with AI-powered importance classification
                </p>
              </div>
              <Button onClick={fetchEmailsWithScores} disabled={loading} variant="outline">
                {loading && <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                Refresh
              </Button>
            </div>


            {/* Search and filters */}
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <SearchBox
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={handleSearch}
                  placeholder="Search emails by subject, sender, or content..."
                />
              </div>
              <div className="w-48">
                <Select value={scoreFilter} onValueChange={setScoreFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by score" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All emails</SelectItem>
                    <SelectItem value="high_confidence">High confidence (≥80%)</SelectItem>
                    <SelectItem value="important">Predicted important</SelectItem>
                    <SelectItem value="not_important">Predicted not important</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Error state */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <p className="text-destructive">{error}</p>
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Loading emails with AI scores...
              </div>
            )}

            {/* Email list */}
            {!loading && !error && (
              <>
                <div className="space-y-3">
                  {filteredEmails.length > 0 ? (
                    filteredEmails.map((item) => (
                      <Card key={item.email.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <Link href={`/emails/${item.email.id}`} className="flex-1 min-w-0">
                              <div className="space-y-2">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <h3 className="font-medium truncate">
                                    {item.email.subject || "(no subject)"}
                                  </h3>
                                  {/* Show stored importance from SQLite */}
                                  {item.email.importance === 'important' && (
                                    <Badge className="bg-green-600 hover:bg-green-700">
                                      Important
                                    </Badge>
                                  )}
                                  {item.email.importance === 'not_important' && (
                                    <Badge variant="secondary">Not Important</Badge>
                                  )}
                                  {item.email.importance === 'unclassified' && (
                                    <Badge variant="outline">Unclassified</Badge>
                                  )}
                                  {/* Show AI prediction as secondary info */}
                                  {item.score && (
                                    <Badge variant="outline" className="text-xs">
                                      AI: {item.score.is_important ? "Important" : "Not Important"} ({(item.score.confidence * 100).toFixed(0)}%)
                                    </Badge>
                                  )}
                                </div>
                                
                                <div className="flex items-center justify-between text-sm text-muted-foreground">
                                  <span className="truncate">{item.email.sender}</span>
                                  <span className="shrink-0">
                                    {item.email.receivedAt ? new Date(item.email.receivedAt).toLocaleString() : ""}
                                  </span>
                                </div>

                                {/* Reasoning text removed for cleaner UI */}
                              </div>
                            </Link>

                            {/* Importance management dropdown */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  •••
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleImportanceChange(item.email.id, "important")}>
                                  Mark Important
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleImportanceChange(item.email.id, "not_important")}>
                                  Mark Not Important
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleImportanceChange(item.email.id, "unclassified")}>
                                  Mark Unclassified
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">No emails found</p>
                      {searchQuery && (
                        <p className="text-sm text-muted-foreground mt-2">Try adjusting your search query or filters</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Pagination */}
                {filteredEmails.length > 0 && (
                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={totalEmails}
                    itemsPerPage={itemsPerPage}
                    onPageChange={handlePageChange}
                    onItemsPerPageChange={handleItemsPerPageChange}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
