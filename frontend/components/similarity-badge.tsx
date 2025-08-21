"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface SimilarityBadgeProps {
  similarity: number
  className?: string
}

export function SimilarityBadge({ similarity, className }: SimilarityBadgeProps) {
  const percentage = Math.round(similarity * 100)

  const getVariant = (score: number) => {
    if (score >= 80) return "default"
    if (score >= 60) return "secondary"
    return "outline"
  }

  const getColorClass = (score: number) => {
    if (score >= 80) return "bg-green-600 hover:bg-green-700 text-white"
    if (score >= 60) return "bg-yellow-600 hover:bg-yellow-700 text-white"
    return "bg-red-600 hover:bg-red-700 text-white"
  }

  return (
    <Badge variant={getVariant(percentage)} className={cn(getColorClass(percentage), className)}>
      {percentage}% match
    </Badge>
  )
}
