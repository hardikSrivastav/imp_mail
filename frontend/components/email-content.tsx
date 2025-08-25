"use client"

import { Card, CardContent } from "@/components/ui/card"
import DOMPurify from "isomorphic-dompurify"

interface EmailContentProps {
  html?: string
  subject: string
  sender: string
  receivedAt: string
}

export function EmailContent({ html, subject, sender, receivedAt }: EmailContentProps) {
  const sanitizedHtml = html ? DOMPurify.sanitize(html) : null

  return (
    <div className="space-y-4">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold mb-2">{subject}</h1>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>From: {sender}</span>
          <span>{new Date(receivedAt).toLocaleString()}</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          {sanitizedHtml ? (
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <div className="text-muted-foreground italic">No email content available</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
