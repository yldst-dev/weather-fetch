import test from "node:test"
import assert from "node:assert/strict"
import { describeWeatherCode, normalizeRequestedDate } from "../src/weather"

test("describeWeatherCode returns a known summary", () => {
  assert.equal(describeWeatherCode(1), "Mainly clear")
})

test("describeWeatherCode falls back for unknown codes", () => {
  assert.equal(describeWeatherCode(999), "Unknown weather code (999)")
})

test("normalizeRequestedDate accepts explicit ISO dates", () => {
  assert.equal(normalizeRequestedDate("2026-03-09"), "2026-03-09")
})

test("normalizeRequestedDate rejects invalid formats", () => {
  assert.throws(() => normalizeRequestedDate("03/09/2026"), {
    message: "Date must be one of: today, tomorrow, YYYY-MM-DD",
  })
})
