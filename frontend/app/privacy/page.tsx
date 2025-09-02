"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { Navigation } from "@/components/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function PrivacyPolicyPage() {
  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-background">
        <Navigation />
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Privacy Policy</CardTitle>
                  <p className="text-muted-foreground">Last updated: September 2025</p>
                </CardHeader>
                <CardContent className="prose prose-slate dark:prose-invert max-w-none">
                  <h2>1. Information We Collect</h2>
                  <p>
                    We collect information you provide directly to us, such as when you create an account, use our services, or contact us for support.
                  </p>

                  <h3>Email Data</h3>
                  <ul>
                    <li>Email metadata (sender, subject, date, labels)</li>
                    <li>Email content for analysis and filtering purposes</li>
                    <li>User preferences and training data for machine learning models</li>
                  </ul>

                  <h3>Account Information</h3>
                  <ul>
                    <li>Google/Gmail account information (name, email address)</li>
                    <li>Authentication tokens (securely stored and encrypted)</li>
                    <li>User settings and preferences</li>
                  </ul>

                  <h2>2. How We Use Your Information</h2>
                  <p>
                    We use the information we collect to provide, maintain, and improve our services:
                  </p>
                  <ul>
                    <li>Filter and organize your emails using AI/ML algorithms</li>
                    <li>Learn your preferences to improve filtering accuracy</li>
                    <li>Provide personalized email insights and analytics</li>
                    <li>Send you service-related notifications</li>
                    <li>Respond to your comments, questions, and requests</li>
                  </ul>

                  <h2>3. Data Storage and Security</h2>
                  <p>
                    We implement appropriate security measures to protect your personal information:
                  </p>
                  <ul>
                    <li>All data is encrypted in transit and at rest</li>
                    <li>OAuth tokens are securely stored and encrypted</li>
                    <li>Email content is processed temporarily and not permanently stored</li>
                    <li>Access to your data is restricted to authorized personnel only</li>
                  </ul>

                  <h2>4. Data Sharing and Disclosure</h2>
                  <p>
                    We do not sell, trade, or otherwise transfer your personal information to third parties, except:
                  </p>
                  <ul>
                    <li>With your explicit consent</li>
                    <li>To comply with legal obligations</li>
                    <li>To protect our rights, property, or safety</li>
                    <li>In connection with a business transfer or merger</li>
                  </ul>

                  <h2>5. Third-Party Services</h2>
                  <p>
                    Our service integrates with:
                  </p>
                  <ul>
                    <li><strong>Google/Gmail API:</strong> To access and analyze your email data</li>
                    <li><strong>OpenAI API:</strong> For AI-powered email analysis and classification</li>
                    <li><strong>Cloudflare:</strong> For content delivery and security</li>
                  </ul>
                  <p>
                    These services have their own privacy policies, and we encourage you to review them.
                  </p>

                  <h2>6. Data Retention</h2>
                  <p>
                    We retain your information for as long as your account is active or as needed to provide services. You can request deletion of your account and associated data at any time.
                  </p>

                  <h2>7. Your Rights</h2>
                  <p>
                    You have the right to:
                  </p>
                  <ul>
                    <li>Access your personal data</li>
                    <li>Correct inaccurate data</li>
                    <li>Request deletion of your data</li>
                    <li>Revoke access permissions</li>
                    <li>Export your data</li>
                  </ul>

                  <h2>8. Machine Learning and AI</h2>
                  <p>
                    Our AI models learn from your email patterns to improve filtering accuracy. This learning happens locally within your account and does not share patterns with other users.
                  </p>

                  <h2>9. Cookies and Tracking</h2>
                  <p>
                    We use essential cookies for authentication and session management. We do not use tracking cookies for advertising purposes.
                  </p>

                  <h2>10. International Data Transfers</h2>
                  <p>
                    Your data may be processed in countries other than your own. We ensure appropriate safeguards are in place for international transfers.
                  </p>

                  <h2>11. Children's Privacy</h2>
                  <p>
                    Our service is not intended for children under 13. We do not knowingly collect personal information from children under 13.
                  </p>

                  <h2>12. Changes to This Policy</h2>
                  <p>
                    We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.
                  </p>

                  <h2>13. Contact Us</h2>
                  <p>
                    If you have any questions about this Privacy Policy, please contact us through the application settings or support channels.
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
