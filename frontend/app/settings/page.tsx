"use client"

import { useEffect, useState } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { SyncStatusBar } from "@/components/sync-status-bar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { apiClient } from "@/lib/api-client"
// Icons removed

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const [modelStats, setModelStats] = useState<any>(null)

  useEffect(() => {
    const loadModelStats = async () => {
      if (!user?.id) return
      
      try {
        const stats = await apiClient.getModelStats(user.id)
        setModelStats(stats)
      } catch (error) {
        console.error('Failed to load model stats:', error)
      }
    }

    loadModelStats()
  }, [user?.id])

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex">
        {/* Navigation component - handles both mobile and desktop */}
        <Navigation />

        {/* Main content */}
        <div className="flex-1 p-4 lg:p-8">
          <div className="max-w-4xl mx-auto space-y-6 lg:space-y-8">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold">Settings</h1>
              <p className="text-muted-foreground mt-2 text-sm lg:text-base">Manage your account, monitor system status, and application preferences</p>
            </div>

            {/* Sync Status Section */}
            <SyncStatusBar />

            {/* AI Model Training Status */}
            {modelStats && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                    AI Model Training Status
                  </CardTitle>
                  <CardDescription className="text-sm">Current status of your personalized email classification model</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total examples:</span>
                      <span className="ml-2 font-medium">{modelStats.total_examples}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Model status:</span>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                        modelStats.total_examples >= 10 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {modelStats.total_examples >= 10 ? 'Trained' : 'Training'}
                      </span>
                    </div>
                    {modelStats.last_trained && (
                      <div>
                        <span className="text-muted-foreground">Last trained:</span>
                        <span className="ml-2 font-medium">
                          {new Date(modelStats.last_trained).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {modelStats.model_version && modelStats.model_version !== "not_trained" && (
                      <div>
                        <span className="text-muted-foreground">Model version:</span>
                        <span className="ml-2 font-medium">{modelStats.model_version}</span>
                      </div>
                    )}
                  </div>
                  {modelStats.total_examples < 10 && (
                    <div className="mt-3 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
                      <strong>Training in progress:</strong> You need at least 10 labeled examples to train the AI model. 
                      You have {modelStats.total_examples}/10 examples. Use the <strong>Bulk Label</strong> page to add more examples.
                    </div>
                  )}
                  {modelStats.total_examples >= 10 && (
                    <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                      <strong>Model trained!</strong> Your AI model is ready and actively classifying emails.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Account Information Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
                  Account Information
                </CardTitle>
                <CardDescription className="text-sm">Your current account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {user && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                      <span className="text-muted-foreground text-sm">Email</span>
                      <span className="font-medium text-sm break-all">{user.email}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                      <span className="text-muted-foreground text-sm">Name</span>
                      <span className="font-medium text-sm">{user.name}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                      <span className="text-muted-foreground text-sm">User ID</span>
                      <span className="font-medium text-sm break-all">{user.id}</span>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <Button onClick={logout} variant="destructive" className="w-full">
                    Sign Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
