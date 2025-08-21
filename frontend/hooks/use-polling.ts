"use client"

import { useEffect, useRef, useState } from "react"

interface UsePollingOptions {
  interval: number
  enabled: boolean
}

export function usePolling<T>(fetchFn: () => Promise<T>, options: UsePollingOptions) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const result = await fetchFn()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (options.enabled) {
      // Fetch immediately
      fetchData()

      // Set up polling
      intervalRef.current = setInterval(fetchData, options.interval)

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [options.enabled, options.interval])

  return { data, error, isLoading, refetch: fetchData }
}
