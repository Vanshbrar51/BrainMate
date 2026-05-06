'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import { CodeBlock } from './ChatMessage'

export default function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            return !inline && match ? (
              <CodeBlock code={String(children).replace(/\n$/, '')} />
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
