import TurndownService from "turndown"
import * as cheerio from "cheerio"

export type WebFetchFormat = "text" | "markdown" | "html"

export interface WebFetchOptions {
  url: string
  format?: WebFetchFormat | string
  timeoutSeconds?: number
  maxResponseBytes?: number
}

export interface WebFetchResult {
  url: string
  contentType: string
  format: WebFetchFormat
  output: string
}

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024

export async function webfetch(options: WebFetchOptions): Promise<WebFetchResult> {
  const format = normalizeFormat(options.format)
  const maxResponseBytes = normalizeMaxResponseBytes(options.maxResponseBytes)
  const timeoutMs = clampTimeout(options.timeoutSeconds)

  const normalizedUrl = normalizeUrl(options.url)
  const acceptHeader = buildAcceptHeader(format)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    Accept: acceptHeader,
    "Accept-Language": "en-US,en;q=0.9",
  }

  try {
    const initial = await fetch(normalizedUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    })

    const response =
      initial.status === 403 && initial.headers.get("cf-mitigated") === "challenge"
        ? await fetch(normalizedUrl, {
            method: "GET",
            headers: { ...headers, "User-Agent": "webfetch-cli" },
            signal: controller.signal,
          })
        : initial

    if (!response.ok) {
      throw new Error(`Request failed with status code: ${response.status}`)
    }

    const contentLengthHeader = response.headers.get("content-length")
    if (contentLengthHeader) {
      const declaredBytes = Number.parseInt(contentLengthHeader, 10)
      if (Number.isFinite(declaredBytes) && declaredBytes > maxResponseBytes) {
        throw new Error(`Response too large (exceeds ${maxResponseBytes} bytes)`)
      }
    }

    const raw = await readResponseText(response, maxResponseBytes)
    const contentType = response.headers.get("content-type") ?? "application/octet-stream"
    const isHtml = contentType.includes("text/html")

    if (format === "html") {
      return {
        url: response.url || normalizedUrl,
        contentType,
        format,
        output: raw,
      }
    }

    if (format === "text") {
      return {
        url: response.url || normalizedUrl,
        contentType,
        format,
        output: isHtml ? extractTextFromHtml(raw) : raw,
      }
    }

    return {
      url: response.url || normalizedUrl,
      contentType,
      format,
      output: isHtml ? convertHtmlToMarkdown(raw) : raw,
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function normalizeFormat(input?: string): WebFetchFormat {
  const value = (input ?? "markdown").trim().toLowerCase()
  if (value === "text" || value === "markdown" || value === "html") {
    return value
  }
  throw new Error("Format must be one of: text, markdown, html")
}

function normalizeMaxResponseBytes(input?: number): number {
  const value = input ?? DEFAULT_MAX_RESPONSE_BYTES
  if (!Number.isFinite(value) || value < 1) {
    throw new Error("maxResponseBytes must be a positive number")
  }
  return Math.floor(value)
}

async function readResponseText(response: Response, maxResponseBytes: number): Promise<string> {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > maxResponseBytes) {
      throw new Error(`Response too large (exceeds ${maxResponseBytes} bytes)`)
    }
    return new TextDecoder().decode(arrayBuffer)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (!value) {
      continue
    }

    totalBytes += value.byteLength
    if (totalBytes > maxResponseBytes) {
      await reader.cancel()
      throw new Error(`Response too large (exceeds ${maxResponseBytes} bytes)`)
    }

    chunks.push(value)
  }

  const merged = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(merged)
}

function normalizeUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("URL must be a fully qualified http(s) URL")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must start with http:// or https://")
  }

  return parsed.toString()
}

function clampTimeout(timeoutSeconds?: number): number {
  if (!Number.isFinite(timeoutSeconds) || (timeoutSeconds ?? 0) <= 0) {
    return DEFAULT_TIMEOUT_MS
  }
  const timeoutMs = Number(timeoutSeconds) * 1000
  return Math.min(Math.max(timeoutMs, 1_000), MAX_TIMEOUT_MS)
}

function buildAcceptHeader(format: WebFetchFormat): string {
  if (format === "markdown") {
    return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
  }

  if (format === "text") {
    return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
  }

  return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, */*;q=0.1"
}

function convertHtmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  })

  turndown.remove(["script", "style", "meta", "link", "noscript", "iframe"])
  return turndown.turndown(html)
}

function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html)
  $("script,style,noscript,iframe,object,embed").remove()
  return $.root().text().replace(/\s+/g, " ").trim()
}
