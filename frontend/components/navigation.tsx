"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
// Icons removed
import { cn } from "@/lib/utils"

  const navigation = [
    { name: "Smart Emails", href: "/worth-it" },
    { name: "Bulk Label", href: "/bulk-label" },
    { name: "Digest", href: "/digest" },
    { name: "Settings", href: "/settings" },
  ]

export function Navigation() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <div className="flex flex-col h-full">
      <div className="p-6">
        <h3 className="text-lg font-semibold">Not all emails are created equal</h3>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href

          return (
            <Link key={item.name} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn("w-full justify-start", isActive && "bg-secondary")}
              >
                {item.name}
              </Button>
            </Link>
          )
        })}
      </nav>

      <div className="p-4">
        <Button
          onClick={logout}
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
        >
          Sign Out
        </Button>
      </div>
    </div>
  )
}
