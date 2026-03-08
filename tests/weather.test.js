"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const weather_1 = require("../src/weather");
(0, node_test_1.default)("describeWeatherCode returns a known summary", () => {
    strict_1.default.equal((0, weather_1.describeWeatherCode)(1), "Mainly clear");
});
(0, node_test_1.default)("describeWeatherCode falls back for unknown codes", () => {
    strict_1.default.equal((0, weather_1.describeWeatherCode)(999), "Unknown weather code (999)");
});
(0, node_test_1.default)("normalizeRequestedDate accepts explicit ISO dates", () => {
    strict_1.default.equal((0, weather_1.normalizeRequestedDate)("2026-03-09"), "2026-03-09");
});
(0, node_test_1.default)("normalizeRequestedDate rejects invalid formats", () => {
    strict_1.default.throws(() => (0, weather_1.normalizeRequestedDate)("03/09/2026"), {
        message: "Date must be one of: today, tomorrow, YYYY-MM-DD",
    });
});
//# sourceMappingURL=weather.test.js.map