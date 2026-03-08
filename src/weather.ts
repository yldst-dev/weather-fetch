import { webfetch } from "./core/webfetch"

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

const ADMINISTRATIVE_ADDRESS_TYPES = new Set([
  "administrative",
  "borough",
  "city",
  "city_district",
  "county",
  "district",
  "municipality",
  "neighbourhood",
  "province",
  "quarter",
  "region",
  "state",
  "suburb",
  "town",
  "village",
])

export interface WeatherForecastOptions {
  date?: string
}

export interface ResolvedLocation {
  name: string
  displayName: string
  latitude: number
  longitude: number
}

export interface WeatherForecast {
  query: string
  requestedDate: string
  resolvedLocation: ResolvedLocation
  timezone: string
  weatherCode: number
  weatherSummary: string
  temperatureMax: number
  temperatureMin: number
  precipitationProbabilityMax: number
  precipitationSum: number
}

interface NominatimSearchResult {
  addresstype?: string
  category?: string
  display_name?: string
  importance?: number
  lat?: string
  lon?: string
  name?: string
  osm_type?: string
  place_rank?: number
  type?: string
}

interface OpenMeteoForecastResponse {
  timezone?: string
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_probability_max?: number[]
    precipitation_sum?: number[]
  }
}

interface RankedResolvedLocation {
  location: ResolvedLocation
  score: number
}

export async function fetchWeatherForecast(
  query: string,
  options: WeatherForecastOptions = {}
): Promise<WeatherForecast> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    throw new Error("Location query is required")
  }

  const requestedDate = normalizeRequestedDate(options.date)
  const resolvedLocation = await resolveLocation(normalizedQuery)
  const forecast = await fetchDailyForecast(resolvedLocation, requestedDate)

  return {
    query: normalizedQuery,
    requestedDate,
    resolvedLocation,
    timezone: forecast.timezone,
    weatherCode: forecast.weatherCode,
    weatherSummary: describeWeatherCode(forecast.weatherCode),
    temperatureMax: forecast.temperatureMax,
    temperatureMin: forecast.temperatureMin,
    precipitationProbabilityMax: forecast.precipitationProbabilityMax,
    precipitationSum: forecast.precipitationSum,
  }
}

export function normalizeRequestedDate(input?: string): string {
  const value = (input ?? "tomorrow").trim().toLowerCase()

  if (value === "today") {
    return toIsoDate(new Date())
  }

  if (value === "tomorrow") {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return toIsoDate(date)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Date must be one of: today, tomorrow, YYYY-MM-DD")
  }

  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Date must be one of: today, tomorrow, YYYY-MM-DD")
  }

  return value
}

async function resolveLocation(query: string): Promise<ResolvedLocation> {
  const url = new URL(NOMINATIM_SEARCH_URL)
  url.searchParams.set("q", query)
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("limit", "8")

  const response = await webfetch({
    url: url.toString(),
    format: "text",
    timeoutSeconds: 25,
  })

  const parsed = safeJsonParse(response.output)
  if (!Array.isArray(parsed)) {
    throw new Error("Failed to parse geocoding response")
  }

  const candidates = parsed
    .map((entry) => parseLocationCandidate(entry))
    .filter((entry): entry is RankedResolvedLocation => entry !== null)

  if (!candidates.length) {
    throw new Error(`No location found for query: ${query}`)
  }

  candidates.sort(compareResolvedLocations)
  const bestCandidate = candidates[0]
  if (!bestCandidate) {
    throw new Error(`No location found for query: ${query}`)
  }

  return bestCandidate.location
}

function parseLocationCandidate(input: unknown): RankedResolvedLocation | null {
  if (!isObject(input)) {
    return null
  }

  const lat = Number.parseFloat(readString(input.lat))
  const lon = Number.parseFloat(readString(input.lon))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null
  }

  const name = normalizeText(readString(input.name))
  const displayName = normalizeText(readString(input.display_name))

  const result = input as NominatimSearchResult
  const location: ResolvedLocation = {
    name: name || displayName || `${lat},${lon}`,
    displayName: displayName || name || `${lat},${lon}`,
    latitude: lat,
    longitude: lon,
  }

  return {
    location,
    score: scoreNominatimResult(result),
  }
}

function compareResolvedLocations(left: RankedResolvedLocation, right: RankedResolvedLocation): number {
  return right.score - left.score
}

async function fetchDailyForecast(location: ResolvedLocation, date: string): Promise<{
  timezone: string
  weatherCode: number
  temperatureMax: number
  temperatureMin: number
  precipitationProbabilityMax: number
  precipitationSum: number
}> {
  const url = new URL(OPEN_METEO_FORECAST_URL)
  url.searchParams.set("latitude", String(location.latitude))
  url.searchParams.set("longitude", String(location.longitude))
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum"
  )
  url.searchParams.set("timezone", "auto")
  url.searchParams.set("start_date", date)
  url.searchParams.set("end_date", date)

  const response = await webfetch({
    url: url.toString(),
    format: "text",
    timeoutSeconds: 25,
  })

  const parsed = safeJsonParse(response.output)
  if (!isObject(parsed)) {
    throw new Error("Failed to parse weather forecast response")
  }

  const forecast = parsed as OpenMeteoForecastResponse
  const daily = forecast.daily
  const weatherCode = readNumber(daily?.weather_code?.[0])
  const temperatureMax = readNumber(daily?.temperature_2m_max?.[0])
  const temperatureMin = readNumber(daily?.temperature_2m_min?.[0])
  const precipitationProbabilityMax = readNumber(daily?.precipitation_probability_max?.[0])
  const precipitationSum = readNumber(daily?.precipitation_sum?.[0])

  if (
    weatherCode === null ||
    temperatureMax === null ||
    temperatureMin === null ||
    precipitationProbabilityMax === null ||
    precipitationSum === null
  ) {
    throw new Error(`Weather forecast is unavailable for ${date}`)
  }

  return {
    timezone: normalizeText(forecast.timezone) || "UTC",
    weatherCode,
    temperatureMax,
    temperatureMin,
    precipitationProbabilityMax,
    precipitationSum,
  }
}

export function describeWeatherCode(code: number): string {
  const descriptions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  }

  return descriptions[code] ?? `Unknown weather code (${code})`
}

function scoreNominatimResult(result: NominatimSearchResult): number {
  let score = 0

  if (result.category === "boundary") {
    score += 40
  }

  if (result.osm_type === "relation") {
    score += 20
  }

  if (ADMINISTRATIVE_ADDRESS_TYPES.has(normalizeText(result.addresstype).toLowerCase())) {
    score += 20
  }

  if (ADMINISTRATIVE_ADDRESS_TYPES.has(normalizeText(result.type).toLowerCase())) {
    score += 15
  }

  if (typeof result.importance === "number" && Number.isFinite(result.importance)) {
    score += result.importance * 10
  }

  if (typeof result.place_rank === "number" && Number.isFinite(result.place_rank)) {
    if (result.place_rank <= 20) {
      score += 10
    }

    if (result.place_rank >= 28) {
      score -= 10
    }
  }

  return score
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function safeJsonParse(input: string): unknown | null {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

function readString(input: unknown): string {
  return typeof input === "string" ? input : ""
}

function readNumber(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null
  }
  return input
}

function normalizeText(input: unknown): string {
  return String(input ?? "").replace(/\s+/g, " ").trim()
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null
}
