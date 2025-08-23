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
  // Importance filtering removed - now in Worth It page

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

      setEmails(emailsData)
      setTotalEmails(hasQuery ? (response.data.results?.length || emailsData.length) : (response.data.pagination?.total ?? emailsData.length))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch emails")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmails()
  }, [currentPage, itemsPerPage, searchQuery])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setCurrentPage(1)
  }

  // Importance management moved to Worth It page

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

            {/* Search */}
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <SearchBox
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={handleSearch}
                  placeholder="Search emails by subject, sender, or content..."
                />
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
                      <EmailCard key={email.id} email={email} />
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">No emails found</p>
                      {searchQuery && (
                        <p className="text-sm text-muted-foreground mt-2">Try adjusting your search query</p>
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
