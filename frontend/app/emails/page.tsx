"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { EmailCard } from "@/components/email-card"
import { SearchBox } from "@/components/search-box"
import { PaginationControls } from "@/components/pagination-controls"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiClient, type Email } from "@/lib/api-client"
import { RefreshCw } from "lucide-react"

export default function EmailsPage() {
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [totalEmails, setTotalEmails] = useState(0)
  const [importanceFilter, setImportanceFilter] = useState<string>("all")

  const fetchEmails = async () => {
    try {
      setLoading(true)
      setError(null)

      const offset = (currentPage - 1) * itemsPerPage
      const params: any = { offset, limit: itemsPerPage }

      const hasQuery = Boolean(searchQuery.trim())
      const response = hasQuery
        ? await apiClient.searchEmails({ query: searchQuery.trim(), offset, limit: itemsPerPage, useSemanticSearch: true, combineResults: true })
        : await apiClient.getEmails(params)
      const emailsData = hasQuery ? (response.data.results?.map((r: any) => r.email) || []) : (response.data.emails || [])

      // Filter by importance if needed
      let filteredEmails = emailsData
      if (importanceFilter !== "all") {
        filteredEmails = emailsData.filter((email: Email) => email.importance === importanceFilter)
      }

      setEmails(filteredEmails)
      setTotalEmails(hasQuery ? (response.data.results?.length || filteredEmails.length) : (response.data.pagination?.total ?? filteredEmails.length))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch emails")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmails()
  }, [currentPage, itemsPerPage, searchQuery, importanceFilter])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setCurrentPage(1)
  }

  const handleImportanceChange = async (id: string, importance: "important" | "not_important" | "unclassified") => {
    try {
      await apiClient.updateEmailImportance(id, importance)
      // Update local state
      setEmails(emails.map((email) => (email.id === id ? { ...email, importance } : email)))
    } catch (err) {
      console.error("Failed to update email importance:", err)
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1)
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
              <div>
                <h1 className="text-3xl font-bold">Emails</h1>
                <p className="text-muted-foreground mt-2">Manage and filter your emails</p>
              </div>
              <Button onClick={fetchEmails} disabled={loading} variant="outline">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
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
                <Select value={importanceFilter} onValueChange={setImportanceFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by importance" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All emails</SelectItem>
                    <SelectItem value="important">Important</SelectItem>
                    <SelectItem value="not_important">Not important</SelectItem>
                    <SelectItem value="unclassified">Unclassified</SelectItem>
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
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Loading emails...
              </div>
            )}

            {/* Email list */}
            {!loading && !error && (
              <>
                <div className="space-y-3">
                  {emails.length > 0 ? (
                    emails.map((email) => (
                      <EmailCard key={email.id} email={email} onImportanceChange={handleImportanceChange} />
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
                {emails.length > 0 && (
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
