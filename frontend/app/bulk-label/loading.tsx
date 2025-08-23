import { RefreshCw } from "lucide-react"

export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar placeholder */}
      <div className="w-64 border-r bg-card" />
      
      {/* Main content */}
      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold">Bulk Email Labeling</h1>
            <p className="text-muted-foreground mt-2">
              Select emails and label them as important or unimportant in bulk. This will help train the AI classifier.
            </p>
          </div>

          {/* Loading state */}
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading bulk labeling interface...
          </div>
        </div>
      </div>
    </div>
  )
}
