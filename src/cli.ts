#!/usr/bin/env node

import { Command } from "commander"
import { webfetch, type WebFetchFormat } from "./core/webfetch"
import { fetchWeatherForecast } from "./weather"

const program = new Command()
const VALID_FORMATS: ReadonlySet<WebFetchFormat> = new Set(["text", "markdown", "html"])
const { version } = require("../package.json") as { version: string }

interface FetchCommandOptions {
  format: string
  timeout: string
  json: boolean
}

interface WeatherCommandOptions {
  date: string
  json: boolean
}

program
  .name("weather-fetch-cli")
  .description("Weather-focused CLI built on URL fetch")
  .version(version)

program
  .command("fetch")
  .description("Fetch a URL and render content")
  .argument("<url>", "URL to fetch")
  .option("-f, --format <format>", "Output format: text|markdown|html", "markdown")
  .option("-t, --timeout <seconds>", "Timeout in seconds", "30")
  .option("--json", "Emit JSON response", false)
  .action(async (url: string, options: FetchCommandOptions) => {
    const format = parseFormatOption(options.format, "--format")
    const timeoutSeconds = parseIntegerOption(options.timeout, "--timeout", 1, 120)

    const result = await webfetch({
      url,
      format,
      timeoutSeconds,
    })

    if (options.json) {
      console.log(JSON.stringify(result, null, 2))
      return
    }

    console.log(result.output)
  })

program
  .command("weather")
  .description("Resolve a location name and fetch a daily weather forecast")
  .argument("<location...>", "Location query")
  .option("-d, --date <date>", "Forecast date: today|tomorrow|YYYY-MM-DD", "tomorrow")
  .option("--json", "Emit JSON response", false)
  .action(async (locationParts: string[], options: WeatherCommandOptions) => {
    const location = locationParts.join(" ").trim()
    if (!location) {
      throw new Error("Location query is required")
    }

    const forecast = await fetchWeatherForecast(location, { date: options.date })

    if (options.json) {
      console.log(JSON.stringify(forecast, null, 2))
      return
    }

    console.log(`${forecast.resolvedLocation.displayName} (${forecast.requestedDate})`)
    console.log(`Summary: ${forecast.weatherSummary}`)
    console.log(`High / Low: ${forecast.temperatureMax}°C / ${forecast.temperatureMin}°C`)
    console.log(`Precipitation: ${forecast.precipitationProbabilityMax}% (${forecast.precipitationSum} mm)`)
    console.log(`Timezone: ${forecast.timezone}`)
  })

program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Error: ${message}`)
  process.exit(1)
})

function parseIntegerOption(raw: string, optionName: string, min: number, max: number): number {
  const value = raw.trim()
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${optionName} must be an integer between ${min} and ${max}`)
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${optionName} must be an integer between ${min} and ${max}`)
  }

  return parsed
}

function parseFormatOption(raw: string, optionName: string): WebFetchFormat {
  const normalized = raw.trim().toLowerCase()
  if (VALID_FORMATS.has(normalized as WebFetchFormat)) {
    return normalized as WebFetchFormat
  }

  throw new Error(`${optionName} must be one of: text, markdown, html`)
}
