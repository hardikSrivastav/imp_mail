import { RefreshCw } from "lucide-react"

export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar placeholder */}
      <div className="w-64 border-r bg-card" />
      
      {/* Main content */}
      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Worth It</h1>
            <p className="text-muted-foreground mt-2">
              See which emails are worth your time based on AI predictions
            </p>
          </div>

          {/* Loading state */}
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading emails with AI scores...
          </div>
        </div>
      </div>
    </div>
  )
}
