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

  async bulkLabel(data: { user_id: string; important_email_ids: string[]; unimportant_email_ids: string[] }, onProgress?: (current: number, total: number) => void) {
    // Use existing single email importance update endpoint for each email
    const results = []
    let current = 0
    const total = data.important_email_ids.length + data.unimportant_email_ids.length
    
    // Update important emails
    for (const emailId of data.important_email_ids) {
      try {
        await this.updateEmailImportance(emailId, "important")
        results.push({ emailId, importance: "important", success: true })
      } catch (error) {
        results.push({ emailId, importance: "important", success: false, error: error instanceof Error ? error.message : "Unknown error" })
      }
      current++
      onProgress?.(current, total)
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Update unimportant emails
    for (const emailId of data.unimportant_email_ids) {
      try {
        await this.updateEmailImportance(emailId, "not_important")
        results.push({ emailId, importance: "not_important", success: true })
      } catch (error) {
        results.push({ emailId, importance: "not_important", success: false, error: error instanceof Error ? error.message : "Unknown error" })
      }
      current++
      onProgress?.(current, total)
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Also send to FastAPI for model training
    try {
      const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000"
      await fetch(`${fastApiUrl}/bulk-label`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: data.user_id,
          important_email_ids: data.important_email_ids,
          unimportant_email_ids: data.unimportant_email_ids
        })
      })
    } catch (error) {
      console.error('Failed to send labels to FastAPI for training:', error)
    }
    
    return { data: { results } }
  }

  async getClassificationResults(userId: string, emailIds: string[]) {
    // Call the FastAPI classify endpoint to get AI classification results
    const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000"
    
    try {
      const response = await fetch(`${fastApiUrl}/classify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          email_ids: emailIds,
          return_confidence: true
        })
      })

      if (!response.ok) {
        // Check if it's a 404 (model not found) or other error
        if (response.status === 404) {
          return {
            results: emailIds.map(emailId => ({
              email_id: emailId,
              is_important: false,
              confidence: 0.0,
              reasoning: "Model not trained yet - need more labeled examples"
            })),
            model_version: "not_trained",
            processed_at: new Date().toISOString()
          }
        }
        throw new Error(`Classification failed: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to get classification results:', error)
      // Return a mock response structure to prevent UI errors
      return {
        results: emailIds.map(emailId => ({
          email_id: emailId,
          is_important: false,
          confidence: 0.0,
          reasoning: "Classification service unavailable"
        })),
        model_version: "unavailable",
        processed_at: new Date().toISOString()
      }
    }
  }

  async getModelStats(userId: string) {
    // Get model training statistics from FastAPI
    const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000"
    
    try {
      const response = await fetch(`${fastApiUrl}/stats/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          return {
            user_id: userId,
            total_examples: 0,
            accuracy: null,
            last_trained: null,
            model_version: "not_trained"
          }
        }
        throw new Error(`Failed to get model stats: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to get model stats:', error)
      return null
    }
  }

  async resetModel(userId: string) {
    // Reset the model training data from FastAPI
    const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000"
    
    try {
      const response = await fetch(`${fastApiUrl}/reset/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to reset model: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to reset model:', error)
      throw error
    }
  }

  async getEmailsWithScores(userId: string, params: { offset?: number; limit?: number } = {}) {
    // Get emails and their AI classification scores
    const fastApiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000"
    
    try {
      // First get emails from the main API
      const emailsResponse = await this.getEmails(params)
      const emails = emailsResponse.data.emails || []
      const total = emailsResponse.data.pagination?.total || emailsResponse.data.total || emails.length
      
      if (emails.length === 0) {
        return { data: { emails: [], scores: [], total: 0 } }
      }

      // Get AI scores for these emails
      const emailIds = emails.map((email: any) => email.id)
      const scoresResponse = await fetch(`${fastApiUrl}/classify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          email_ids: emailIds,
          return_confidence: true
        })
      })

      if (scoresResponse.ok) {
        const scoresData = await scoresResponse.json()
        return {
          data: {
            emails,
            scores: scoresData.results || [],
            total
          }
        }
      } else {
        // If classification fails, return emails without scores
        return { data: { emails, scores: [], total } }
      }
    } catch (error) {
      console.error('Failed to get emails with scores:', error)
      // Return emails without scores if classification fails
      const emailsResponse = await this.getEmails(params)
      const emails = emailsResponse.data.emails || []
      const total = emailsResponse.data.pagination?.total || emailsResponse.data.total || emails.length
      return { data: { emails, scores: [], total } }
    }
  }

  // Preferences (prototype-based)
  async getPreferences() {
    return this.get("/api/preferences")
  }
  async savePreferences(options: { likedEmailIds: string[]; dislikedEmailIds: string[] }) {
    return this.put("/api/preferences", options)
  }
  async trainPreferences() {
    return this.post("/api/preferences/train")
  }
  async scoreEmailByPreferences(emailId: string) {
    return this.get(`/api/preferences/score/${emailId}`)
  }

  // Digest
  async computeDigest(options: { 
    windowHours?: number; 
    minItems?: number; 
    emailFilter?: 'all' | 'important'; 
    dryRun?: boolean;
    generateSummaries?: boolean;
    skipSummaries?: boolean;
  } = {}) {
    return this.post("/api/digest/send-now", options)
  }

  async getDigestSettings() {
    return this.get("/api/digest/settings")
  }

  async updateDigestSettings(options: { 
    enabled?: boolean; 
    times?: string[]; 
    timezone?: string;
    emailFilter?: 'all' | 'important';
    emailDelivery?: 'email' | 'none';
  }) {
    return this.put("/api/digest/settings", options)
  }

  async getDigestHistory(limit?: number) {
    const params = new URLSearchParams()
    if (limit) params.append('limit', limit.toString())
    return this.get(`/api/digest/history${params.toString() ? '?' + params.toString() : ''}`)
  }

  async getDigestById(digestId: string) {
    return this.get(`/api/digest/${digestId}`)
  }

  async testDigestEmail() {
    return this.post("/api/digest/test-email")
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
