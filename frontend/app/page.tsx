"use client"

import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { InitialTrainingPrompt } from "@/components/initial-training-prompt"

export default function HomePage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [modelStats, setModelStats] = useState<any>(null)
  const [checkingTraining, setCheckingTraining] = useState(false)
  const [showTrainingPrompt, setShowTrainingPrompt] = useState(false)

  const checkTrainingStatus = async () => {
    if (!user?.id) return
    
    try {
      setCheckingTraining(true)
      const stats = await apiClient.getModelStats(user.id)
      setModelStats(stats)
      
      // If user has no training examples or model is not trained, show training prompt
      if (!stats || stats.total_examples === 0 || stats.model_version === "not_trained") {
        setShowTrainingPrompt(true)
      } else {
        // User has training data, proceed to main app
        router.push("/worth-it")
      }
    } catch (error) {
      console.error('Failed to check training status:', error)
      // On error, assume no training and show prompt
      setShowTrainingPrompt(true)
    } finally {
      setCheckingTraining(false)
    }
  }

  const handleTrainingComplete = () => {
    setShowTrainingPrompt(false)
    // Refresh training status and navigate
    checkTrainingStatus()
  }

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        checkTrainingStatus()
      } else {
        router.push("/login")
      }
    }
  }, [user, isLoading, router])

  // Also check when user navigates back to home page
  useEffect(() => {
    if (user?.id && !checkingTraining && !showTrainingPrompt) {
      checkTrainingStatus()
    }
  }, [user?.id])

  if (isLoading || checkingTraining) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">
          {isLoading ? "Loading..." : "Checking training status..."}
        </div>
      </div>
    )
  }

  if (showTrainingPrompt) {
    return <InitialTrainingPrompt onComplete={handleTrainingComplete} />
  }

  return null
}
