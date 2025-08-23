const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000"

class ApiClient {
  private baseURL: string

  constructor(baseURL: string) {
    this.baseURL = baseURL
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseURL}${endpoint}`

    // Get token from localStorage
    const token = localStorage.getItem("jwt_token")

    const config: RequestInit = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
        // Add Authorization header for all requests except health and OAuth start
        ...(token && !endpoint.includes("/health") && !endpoint.includes("/api/auth/login")
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },
    }

    try {
      const response = await fetch(url, config)

      // Handle 401 responses globally
      if (response.status === 401) {
        localStorage.removeItem("jwt_token")
        window.location.href = "/login"
        throw new Error("Unauthorized")
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Request failed" }))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }

      // Handle empty responses
      const contentType = response.headers.get("content-type")
      if (contentType && contentType.includes("application/json")) {
        return { data: await response.json(), status: response.status }
      }

      return { data: null, status: response.status }
    } catch (error) {
      console.error("API request failed:", error)
      throw error
    }
  }

  async get(endpoint: string, options?: RequestInit) {
    return this.request(endpoint, { ...options, method: "GET" })
  }

  async post(endpoint: string, data?: any, options?: RequestInit) {
    return this.request(endpoint, {
      ...options,
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put(endpoint: string, data?: any, options?: RequestInit) {
    return this.request(endpoint, {
      ...options,
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete(endpoint: string, options?: RequestInit) {
    return this.request(endpoint, { ...options, method: "DELETE" })
  }

  // Health check
  async getHealth() {
    return this.get("/health")
  }

  // Authentication methods
  async getAuthStatus() {
    return this.get("/api/auth/status")
  }

  async logout() {
    return this.post("/api/auth/logout")
  }

  // Indexing operations
  async getIndexingProgress() {
    return this.get("/api/indexing/progress")
  }

  async triggerIncrementalIndexing() {
    return this.post("/api/indexing/incremental")
  }

  async triggerFullIndexing() {
    return this.post("/api/indexing/full")
  }

  async triggerSyncIndexing() {
    return this.post("/api/indexing/sync")
  }

  // Auto sync settings
  async getAutoSyncSettings() {
    return this.get("/api/indexing/auto-sync/settings")
  }
  async updateAutoSyncSettings(options: { enabled?: boolean; intervalMinutes?: number }) {
    return this.put("/api/indexing/auto-sync/settings", options)
  }

  // Email operations
  async getEmails(params: { offset?: number; limit?: number; q?: string } = {}) {
    const searchParams = new URLSearchParams()
    if (params.offset !== undefined) searchParams.set("offset", params.offset.toString())
    if (params.limit !== undefined) searchParams.set("limit", params.limit.toString())
    if (params.q) searchParams.set("q", params.q)

    const query = searchParams.toString()
    return this.get(`/api/emails${query ? `?${query}` : ""}`)
  }

  async getEmail(id: string) {
    return this.get(`/api/emails/${id}`)
  }

  async searchEmails(params: { query: string; offset?: number; limit?: number; useSemanticSearch?: boolean; combineResults?: boolean }) {
    const searchParams = new URLSearchParams()
    searchParams.set("search", params.query)
    if (params.offset !== undefined) searchParams.set("offset", String(params.offset))
    if (params.limit !== undefined) searchParams.set("limit", String(params.limit))
    if (params.useSemanticSearch !== undefined) searchParams.set("useSemanticSearch", String(params.useSemanticSearch))
    if (params.combineResults !== undefined) searchParams.set("combineResults", String(params.combineResults))
    return this.get(`/api/emails/search?${searchParams.toString()}`)
  }

  async updateEmailImportance(id: string, importance: "important" | "not_important" | "unclassified") {
    return this.put(`/api/emails/${id}/importance`, { importance })
  }

  // Filter expectations
  async getExpectations() {
    return this.get("/api/filter/expectations")
  }

  async saveExpectations(
    expectations: {
      title: string
      description: string
      examples: string[]
    },
    options?: { selectedImportantEmailIds?: string[]; selectedNotImportantEmailIds?: string[] }
  ) {
    return this.post("/api/filter/expectations", { ...expectations, ...(options || {}) })
  }

  // Similarity insights
  async getTopSimilar(params: { percent?: number; includeHtml?: boolean } = {}) {
    const searchParams = new URLSearchParams()
    if (params.percent !== undefined) searchParams.set("percent", params.percent.toString())
    if (params.includeHtml !== undefined) searchParams.set("includeHtml", params.includeHtml.toString())

    const query = searchParams.toString()
    return this.get(`/api/filter/top-similar${query ? `?${query}` : ""}`)
  }

  async getOutliers(params: { percent?: number; limit?: number } = {}) {
    const searchParams = new URLSearchParams()
    if (params.percent !== undefined) searchParams.set("percent", params.percent.toString())
    if (params.limit !== undefined) searchParams.set("limit", params.limit.toString())

    const query = searchParams.toString()
    return this.get(`/api/filter/outliers${query ? `?${query}` : ""}`)
  }

  async getPrototypeScores() {
    return this.get("/api/filter/scores")
  }

  // Classification controls
  async resetClassifications() {
    return this.post("/api/filter/reset")
  }

  async batchClassify() {
    // Backend route is /api/filter/batch
    return this.post("/api/filter/batch")
  }

  // Digest
  async computeDigest(options: { windowHours?: number; minItems?: number; threshold?: number; dryRun?: boolean } = {}) {
    return this.post("/api/digest/send-now", options)
  }

  async getDigestSettings() {
    return this.get("/api/digest/settings")
  }

  async updateDigestSettings(options: { enabled?: boolean; times?: string[]; timezone?: string }) {
    return this.put("/api/digest/settings", options)
  }
}

export const apiClient = new ApiClient(API_BASE_URL)

export interface User {
  id: string
  email: string
  name: string
}

export interface Email {
  id: string
  subject: string
  sender: string
  receivedAt: string
  importance?: "important" | "not_important" | "unclassified"
  similarity?: number
  html?: string
}

export interface IndexingProgress {
  userId: string
  syncState: {
    lastSyncAt?: string
    totalEmailsIndexed: number
    isInitialSyncComplete: boolean
    currentSyncStatus: "idle" | "syncing"
    lastError?: string
  }
  statistics: {
    totalEmails: number
    vectorizedEmails: number
    indexingProgress: number
  }
}

export interface Expectations {
  title: string
  description: string
  examples: string[]
}

export interface SimilarityResult {
  count: number
  results: Array<{
    email: Email
    similarity: number
    html?: string
  }>
}

export interface ApiError {
  message: string
  status?: number
}
