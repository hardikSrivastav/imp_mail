import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export default function AuthCallbackLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin mb-4" />
          <p className="text-center">Completing authentication...</p>
        </CardContent>
      </Card>
    </div>
  )
}
