"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Email } from "@/lib/api-client"
import { MoreHorizontal, Star, StarOff, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmailCardProps {
  email: Email
  onImportanceChange?: (id: string, importance: "important" | "not_important" | "unclassified") => void
}

export function EmailCard({ email, onImportanceChange }: EmailCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: "short" })
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" })
    }
  }

  const getImportanceBadge = (importance?: string) => {
    switch (importance) {
      case "important":
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            Important
          </Badge>
        )
      case "not_important":
        return <Badge variant="secondary">Not Important</Badge>
      case "unclassified":
      default:
        return <Badge variant="outline">Unclassified</Badge>
    }
  }

  const getSimilarityBadge = (similarity?: number) => {
    if (similarity === undefined) return null

    const percentage = Math.round(similarity * 100)
    const variant = percentage > 70 ? "default" : percentage > 40 ? "secondary" : "outline"

    return (
      <Badge variant={variant} className="text-xs">
        {percentage}% match
      </Badge>
    )
  }

  return (
    <Card
      className={cn("hover:bg-accent/50 transition-colors", email.importance === "important" && "border-green-600/50")}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <Link href={`/emails/${email.id}`} className="flex-1 min-w-0">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium truncate">{email.subject}</h3>
                {getSimilarityBadge(email.similarity)}
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span className="truncate">{email.sender}</span>
                <span className="shrink-0">{formatDate(email.receivedAt)}</span>
              </div>

              <div className="flex items-center gap-2">{getImportanceBadge(email.importance)}</div>
            </div>
          </Link>

          {onImportanceChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onImportanceChange(email.id, "important")}>
                  <Star className="h-4 w-4 mr-2" />
                  Mark Important
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onImportanceChange(email.id, "not_important")}>
                  <StarOff className="h-4 w-4 mr-2" />
                  Mark Not Important
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onImportanceChange(email.id, "unclassified")}>
                  <Minus className="h-4 w-4 mr-2" />
                  Mark Unclassified
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
