"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Target } from "lucide-react"

const insightRoutes = [
  {
    name: "Top Similar",
    href: "/insights/top-similar",
    icon: TrendingUp,
    description: "Emails most similar to your expectations",
  },
  {
    name: "Outliers",
    href: "/insights/outliers",
    icon: TrendingDown,
    description: "Emails that don't match typical patterns",
  },
  {
    name: "Scores",
    href: "/insights/scores",
    icon: Target,
    description: "Similarity scores for all emails",
  },
]

export function InsightsNavigation() {
  const pathname = usePathname()

  return (
    <div className="flex gap-2 mb-6">
      {insightRoutes.map((route) => {
        const Icon = route.icon
        const isActive = pathname === route.href

        return (
          <Link key={route.href} href={route.href}>
            <Button
              variant={isActive ? "default" : "outline"}
              className={cn("flex items-center gap-2", isActive && "bg-primary text-primary-foreground")}
            >
              <Icon className="h-4 w-4" />
              {route.name}
            </Button>
          </Link>
        )
      })}
    </div>
  )
}
