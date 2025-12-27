/**
 * Markdown Renderer Component
 * 
 * Renders markdown content with proper formatting, including:
 * - Headings, paragraphs, lists
 * - Code blocks with syntax highlighting
 * - Tables (GitHub Flavored Markdown)
 * - Links, emphasis, inline code
 * - Blockquotes
 * - HTML sanitization to prevent XSS attacks
 */

"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import { ReactNode } from "react";
import type { Components } from "react-markdown";

type MarkdownRendererProps = {
  content: string;
  className?: string;
};

/**
 * Custom components for markdown elements to ensure proper styling
 */
const markdownComponents: Partial<Components> = {
  // Headings
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-2xl font-bold mt-6 mb-4 text-[var(--foreground)]">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-xl font-bold mt-5 mb-3 text-[var(--foreground)]">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-lg font-semibold mt-4 mb-2 text-[var(--foreground)]">{children}</h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="text-base font-semibold mt-3 mb-2 text-[var(--foreground)]">{children}</h4>
  ),
  h5: ({ children }: { children?: ReactNode }) => (
    <h5 className="text-sm font-semibold mt-3 mb-2 text-[var(--foreground)]">{children}</h5>
  ),
  h6: ({ children }: { children?: ReactNode }) => (
    <h6 className="text-sm font-medium mt-2 mb-1 text-[var(--foreground)] opacity-80">{children}</h6>
  ),

  // Paragraphs
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-4 text-[15px] leading-relaxed text-[var(--foreground)]">{children}</p>
  ),

  // Lists
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-4 ml-6 list-disc space-y-1 text-[var(--foreground)]">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-4 ml-6 list-decimal space-y-1 text-[var(--foreground)]">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-[15px] leading-relaxed">{children}</li>
  ),

  // Code blocks
  code: ({ className, children }: { className?: string; children?: ReactNode }) => {
    const isInline = !className;
    return isInline ? (
      <code className="px-1.5 py-0.5 bg-[var(--surface)] border border-[var(--divider)] rounded text-sm font-mono text-[var(--foreground)]">
        {children}
      </code>
    ) : (
      <code className={className}>
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="mb-4 p-4 bg-[var(--surface)] border border-[var(--divider)] rounded-[var(--radius-md)] overflow-x-auto">
      {children}
    </pre>
  ),

  // Blockquotes
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="mb-4 pl-4 border-l-4 border-[var(--accent)] italic text-[var(--muted)]">
      {children}
    </blockquote>
  ),

  // Links
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--accent)] hover:text-[var(--accent-hover)] underline transition-colors"
    >
      {children}
    </a>
  ),

  // Tables (GitHub Flavored Markdown)
  table: ({ children }: { children?: ReactNode }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="min-w-full border-collapse border border-[var(--divider)] rounded-[var(--radius-md)]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => (
    <thead className="bg-[var(--surface)]">{children}</thead>
  ),
  tbody: ({ children }: { children?: ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  tr: ({ children }: { children?: ReactNode }) => (
    <tr className="border-b border-[var(--divider)]">{children}</tr>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="px-4 py-2 text-left font-semibold text-[var(--foreground)] border-r border-[var(--divider)] last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="px-4 py-2 text-[15px] text-[var(--foreground)] border-r border-[var(--divider)] last:border-r-0">
      {children}
    </td>
  ),

  // Horizontal rule
  hr: () => <hr className="my-6 border-0 border-t border-[var(--divider)]" />,

  // Strong and emphasis
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-[var(--foreground)]">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => (
    <em className="italic">{children}</em>
  ),
};

/**
 * Renders markdown content with syntax highlighting and GitHub Flavored Markdown support
 */
export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  if (!content || content.trim().length === 0) {
    return null;
  }

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeSanitize]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

