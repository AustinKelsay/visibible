export const PUBLIC_IMAGE_API_BASE_PATH = "/api/public/images";

export const PUBLIC_IMAGE_API_RATE_LIMITS = [
  { label: "Discovery endpoints", limit: "120/minute" },
  { label: "Verse latest", limit: "60/minute" },
  { label: "Verse history", limit: "30/minute" },
  { label: "Chapter latest-per-verse", limit: "20/minute" },
] as const;

export const PUBLIC_IMAGE_API_FIELDS = [
  "prompts",
  "prompt inputs",
  "cost data",
  "provider request IDs",
  "session data",
  "analytics fields",
] as const;

export const PUBLIC_IMAGE_API_ENDPOINTS = [
  {
    title: "API index",
    path: PUBLIC_IMAGE_API_BASE_PATH,
    description: "Returns the API version, capability summary, and route templates.",
  },
  {
    title: "Books with images",
    path: `${PUBLIC_IMAGE_API_BASE_PATH}/books`,
    description: "Returns books that currently have at least one saved image.",
  },
  {
    title: "Chapters with images for a book",
    path: `${PUBLIC_IMAGE_API_BASE_PATH}/books/{book}/chapters`,
    description: "Returns chapter numbers that currently have at least one saved image.",
  },
  {
    title: "Latest images in a chapter",
    path: `${PUBLIC_IMAGE_API_BASE_PATH}/chapters/{book}/{chapter}`,
    description: "Returns the latest saved image for each verse in a chapter that currently has art.",
  },
  {
    title: "Latest image for a verse",
    path: `${PUBLIC_IMAGE_API_BASE_PATH}/verses/{book}/{chapter}/{verse}`,
    description: "Returns the latest saved image for one verse.",
  },
  {
    title: "Paginated image history for a verse",
    path: `${PUBLIC_IMAGE_API_BASE_PATH}/verses/{book}/{chapter}/{verse}/images?limit=20&cursor=...`,
    description: "Returns a paginated list of saved images for one verse.",
  },
] as const;

export const PUBLIC_IMAGE_API_QUICK_LINKS = [
  { label: "API root", href: PUBLIC_IMAGE_API_BASE_PATH },
  { label: "Books", href: `${PUBLIC_IMAGE_API_BASE_PATH}/books` },
  { label: "Genesis chapters", href: `${PUBLIC_IMAGE_API_BASE_PATH}/books/genesis/chapters` },
  { label: "Genesis 1", href: `${PUBLIC_IMAGE_API_BASE_PATH}/chapters/genesis/1` },
  { label: "John 3:16", href: `${PUBLIC_IMAGE_API_BASE_PATH}/verses/john/3/16` },
] as const;

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatCurl(baseUrl: string, path: string) {
  return `curl ${JSON.stringify(`${baseUrl}${path}`)}`;
}

export function getPublicApiDocsBaseUrl(headersList: Headers): string {
  const forwardedProto = headersList.get("x-forwarded-proto");
  const forwardedHost = headersList.get("x-forwarded-host");
  const host = forwardedHost || headersList.get("host");

  if (host) {
    const isLocalHost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const protocol = forwardedProto || (isLocalHost ? "http" : "https");
    return `${protocol}://${host}`.replace(/\/+$/, "");
  }

  const envBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (envBaseUrl) {
    const normalized = envBaseUrl.startsWith("http") ? envBaseUrl : `https://${envBaseUrl}`;
    return normalized.replace(/\/+$/, "");
  }

  return "http://localhost:3000";
}

function buildExampleVerseResponse(baseUrl: string) {
  const pageUrl = `${baseUrl}/genesis/1/1`;
  const historyUrl = `${baseUrl}${PUBLIC_IMAGE_API_BASE_PATH}/verses/genesis/1/1/images`;

  return {
    data: {
      verse: {
        book: "genesis",
        bookName: "Genesis",
        chapter: 1,
        verse: 1,
        reference: "Genesis 1:1",
        pageUrl,
        historyUrl,
      },
      image: {
        id: "abc123",
        imageUrl: "https://actions.visibible.com/image/storage_id",
        reference: "Genesis 1:1",
        pageUrl,
        model: "google/gemini-2.5-flash-image",
        translationId: "web",
        aspectRatio: "16:9",
        imageMimeType: "image/png",
        imageWidth: 1024,
        imageHeight: 768,
        createdAt: 1742580000000,
      },
    },
  };
}

export function buildPublicApiDocsMarkdown(baseUrl: string): string {
  const exampleVerseResponse = buildExampleVerseResponse(baseUrl);
  const exampleHistoryResponse = {
    data: {
      ...exampleVerseResponse.data,
      images: [exampleVerseResponse.data.image],
      pageInfo: {
        nextCursor: "opaque_cursor_token",
        hasMore: true,
      },
    },
  };

  const endpointSections = PUBLIC_IMAGE_API_ENDPOINTS.map(
    (endpoint) => `### ${endpoint.title}

\`\`\`bash
GET ${endpoint.path}
\`\`\`

${endpoint.description}`
  ).join("\n\n");

  const exampleRequests = [
    formatCurl(baseUrl, PUBLIC_IMAGE_API_BASE_PATH),
    formatCurl(baseUrl, `${PUBLIC_IMAGE_API_BASE_PATH}/books`),
    formatCurl(baseUrl, `${PUBLIC_IMAGE_API_BASE_PATH}/books/genesis/chapters`),
    formatCurl(baseUrl, `${PUBLIC_IMAGE_API_BASE_PATH}/chapters/genesis/1`),
    formatCurl(baseUrl, `${PUBLIC_IMAGE_API_BASE_PATH}/verses/john/3/16`),
    formatCurl(baseUrl, `${PUBLIC_IMAGE_API_BASE_PATH}/verses/genesis/1/1/images?limit=10`),
  ].join("\n");

  return `
## Overview

The public image API gives read-only access to images that have already been generated and saved in Visibible.

- Base URL: \`${baseUrl}${PUBLIC_IMAGE_API_BASE_PATH}\`
- Auth: none
- Access: public, read-only
- CORS: enabled for \`GET\` and \`OPTIONS\`
- Format: JSON

## Endpoints

${endpointSections}

## Example requests

\`\`\`bash
${exampleRequests}
\`\`\`

## Example verse response

\`\`\`json
${formatJson(exampleVerseResponse)}
\`\`\`

## Pagination

Verse history uses cursor pagination.

- Default \`limit\`: \`20\`
- Max \`limit\`: \`50\`
- Response includes:
  - \`pageInfo.nextCursor\`
  - \`pageInfo.hasMore\`

## Example paginated history response

\`\`\`json
${formatJson(exampleHistoryResponse)}
\`\`\`

## Rate limits

Public requests are rate limited by IP address.

${PUBLIC_IMAGE_API_RATE_LIMITS.map((entry) => `- ${entry.label}: \`${entry.limit}\``).join("\n")}

Rate-limited requests return \`429\` and include a \`Retry-After\` header.

## Public fields only

Public responses intentionally exclude internal generation details like:

${PUBLIC_IMAGE_API_FIELDS.map((field) => `- ${field}`).join("\n")}
`.trim();
}
