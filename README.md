# weather-webfetch

A TypeScript CLI and library for location-based weather forecasts and URL web fetching.

It provides:

- `fetch`: retrieve a known URL with text, markdown, or html output
- `weather`: resolve a place name and fetch a daily forecast in one command

## Requirements

- Node.js 18 or newer

## Install From npm

Run without installing:

```bash
npx weather-webfetch weather "대전 동구"
```

Install globally:

```bash
npm install --global weather-webfetch
weather-webfetch weather "대전 동구"
```

## Install From Source

```bash
npm install
npm run build
```

## CLI Usage

Get tomorrow's forecast:

```bash
weather-webfetch weather "대전 동구"
```

Get a specific date in JSON:

```bash
weather-webfetch weather "대전 동구" --date 2026-03-09 --json
```

Fetch any URL directly:

```bash
weather-webfetch fetch "https://api.open-meteo.com/v1/forecast?latitude=36.3120&longitude=127.4554&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul" --format text
```

## Library Usage

```ts
import { fetchWeatherForecast, webfetch } from "weather-webfetch"

const forecast = await fetchWeatherForecast("대전 동구", { date: "tomorrow" })
console.log(forecast.weatherSummary, forecast.temperatureMax, forecast.temperatureMin)

const response = await webfetch({
  url: "https://api.open-meteo.com/v1/forecast?latitude=36.3120&longitude=127.4554&daily=weather_code&timezone=Asia%2FSeoul",
  format: "text",
  timeoutSeconds: 30,
})

console.log(response.output)
```

## Development

```bash
npm run check
npm run test
npm run build
```

## Data Sources

- Geocoding: Nominatim (OpenStreetMap)
- Forecasts: Open-Meteo

## Publish Checklist

```bash
npm run check
npm run test
npm run build
npm pack --dry-run
```
