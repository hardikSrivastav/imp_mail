"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function TermsOfServicePage() {
  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-background">
        <Navigation />
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Terms of Service</CardTitle>
                  <p className="text-muted-foreground">Last updated: September 2025</p>
                </CardHeader>
                <CardContent className="prose prose-slate dark:prose-invert max-w-none">
                  <h2>1. Acceptance of Terms</h2>
                  <p>
                    By accessing and using the Email Filter App ("Service"), you accept and agree to be bound by the terms and provision of this agreement.
                  </p>

                  <h2>2. Description of Service</h2>
                  <p>
                    Email Filter App is an AI-powered email filtering and management service that helps users organize and prioritize their email communications using machine learning technology.
                  </p>

                  <h2>3. User Accounts</h2>
                  <p>
                    To use our Service, you must create an account using your Google/Gmail credentials. You are responsible for maintaining the confidentiality of your account and password and for restricting access to your account.
                  </p>

                  <h2>4. Data Processing</h2>
                  <p>
                    Our Service processes your email data to provide filtering and organization features. We only access email metadata and content necessary for the functioning of the Service. We do not store email content permanently and do not share your data with third parties for marketing purposes.
                  </p>

                  <h2>5. AI and Machine Learning</h2>
                  <p>
                    The Service uses artificial intelligence and machine learning algorithms to analyze and categorize your emails. These algorithms learn from your usage patterns and preferences to improve accuracy over time.
                  </p>

                  <h2>6. Acceptable Use</h2>
                  <p>
                    You agree not to use the Service for any unlawful purposes or in any way that could damage, disable, overburden, or impair the Service. You may not attempt to gain unauthorized access to any part of the Service.
                  </p>

                  <h2>7. Service Availability</h2>
                  <p>
                    We strive to maintain high availability of our Service, but we do not guarantee uninterrupted access. The Service may be temporarily unavailable due to maintenance, updates, or technical issues.
                  </p>

                  <h2>8. Intellectual Property</h2>
                  <p>
                    The Service and its original content, features, and functionality are owned by the Service provider and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
                  </p>

                  <h2>9. Termination</h2>
                  <p>
                    We may terminate or suspend your account and access to the Service immediately, without prior notice, if you breach these Terms of Service.
                  </p>

                  <h2>10. Limitation of Liability</h2>
                  <p>
                    In no event shall the Service provider be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.
                  </p>

                  <h2>11. Changes to Terms</h2>
                  <p>
                    We reserve the right to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days notice prior to any new terms taking effect.
                  </p>

                  <h2>12. Contact Information</h2>
                  <p>
                    If you have any questions about these Terms of Service, please contact us through the application settings or support channels.
                  </p>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}
