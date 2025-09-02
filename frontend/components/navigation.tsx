"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { Menu, X } from "lucide-react"

const navigation = [
  { name: "Smart Emails", href: "/worth-it" },
  { name: "Bulk Label", href: "/bulk-label" },
  { name: "Digest", href: "/digest" },
  { name: "Settings", href: "/settings" },
]

export function Navigation() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [needsTraining, setNeedsTraining] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const checkTrainingStatus = async () => {
      if (!user?.id) return
      
      try {
        const stats = await apiClient.getModelStats(user.id)
        setNeedsTraining(!stats || stats.total_examples === 0 || stats.model_version === "not_trained")
      } catch (error) {
        console.error('Failed to check training status:', error)
        setNeedsTraining(true)
      }
    }

    checkTrainingStatus()
  }, [user?.id])

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6">
        <h3 className="text-lg font-semibold">Not all emails are created equal</h3>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {/* Show training prompt link if user needs training */}
        {needsTraining && (
          <Link href="/" onClick={closeMobileMenu}>
            <Button
              variant="default"
              className="w-full justify-start bg-primary text-primary-foreground hover:bg-primary/90"
            >
              🚀 Setup AI Training
            </Button>
          </Link>
        )}
        
        {navigation.map((item) => {
          const isActive = pathname === item.href

          return (
            <Link key={item.name} href={item.href} onClick={closeMobileMenu}>
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

      <div className="p-4 space-y-2">
        {/* Legal links */}
        <div className="space-y-1">
          <Link href="/terms" onClick={closeMobileMenu}>
            <Button
              variant="ghost"
              className="w-full justify-start text-xs text-muted-foreground hover:text-foreground h-8"
            >
              Terms of Service
            </Button>
          </Link>
          <Link href="/privacy" onClick={closeMobileMenu}>
            <Button
              variant="ghost"
              className="w-full justify-start text-xs text-muted-foreground hover:text-foreground h-8"
            >
              Privacy Policy
            </Button>
          </Link>
        </div>
        
        {/* Sign out button */}
        <Button
          onClick={() => {
            logout()
            closeMobileMenu()
          }}
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
        >
          Sign Out
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="h-10 w-10 p-0"
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile navigation sidebar */}
      <div className={cn(
        "lg:hidden fixed inset-y-0 left-0 z-40 w-64 border-r bg-card transform transition-transform duration-200 ease-in-out",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SidebarContent />
      </div>

      {/* Desktop navigation sidebar */}
      <div className="hidden lg:block w-64 border-r bg-card">
        <SidebarContent />
      </div>
    </>
  )
}
