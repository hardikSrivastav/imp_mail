"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { SyncStatusBar } from "@/components/sync-status-bar"
import { HealthStatus } from "@/components/health-status"
import { Navigation } from "@/components/navigation"

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar */}
        <div className="w-64 border-r bg-card">
          <Navigation />
        </div>

        {/* Main content */}
        <div className="flex-1 p-8">
          <div className="max-w-4xl mx-auto space-y-8">
            <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground mt-2">Monitor your email filtering system and sync status</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <HealthStatus />
              <SyncStatusBar />
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="bg-card rounded-lg border p-6">
                <h3 className="font-semibold mb-2">Quick Actions</h3>
                <p className="text-sm text-muted-foreground mb-4">Common tasks and shortcuts</p>
                <div className="space-y-2">
                  <a href="/emails" className="block text-sm text-primary hover:underline">
                    View all emails →
                  </a>
                  <a href="/expectations" className="block text-sm text-primary hover:underline">
                    Update expectations →
                  </a>
                  <a href="/insights" className="block text-sm text-primary hover:underline">
                    View insights →
                  </a>
                </div>
              </div>

              <div className="bg-card rounded-lg border p-6">
                <h3 className="font-semibold mb-2">Recent Activity</h3>
                <p className="text-sm text-muted-foreground">No recent activity to display</p>
              </div>

              <div className="bg-card rounded-lg border p-6">
                <h3 className="font-semibold mb-2">System Status</h3>
                <p className="text-sm text-muted-foreground mb-4">All systems operational</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">API</span>
                    <span className="text-green-600">Online</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Database</span>
                    <span className="text-green-600">Connected</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
