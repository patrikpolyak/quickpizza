import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.2/index.js";
import { SharedArray } from "k6/data";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3333";

export const options = {
  scenarios: {
    blackfriday: {
      exec: "getPizza",
      executor: "ramping-vus",
      stages: [
        // Act 1: Normal baseline traffic
        { duration: "3m", target: 3 },
        // Act 2: Black Friday spike begins
        { duration: "1m", target: 50 },
        // Act 3: Peak load sustained
        { duration: "3m", target: 50 },
        // Act 4: Gradual recovery
        { duration: "2m", target: 10 },
        // Act 5: Back to normal
        { duration: "1m", target: 3 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<2000"],
  },
};

const pizzas = new Counter("quickpizza_number_of_pizzas");
const ingredients = new Trend("quickpizza_ingredients");

const tokens = new SharedArray("all tokens", function () {
  return JSON.parse(open("./data/tokens.json")).tokens;
});

export function setup() {
  let res = http.get(BASE_URL);
  if (res.status !== 200) {
    throw new Error(`Got unexpected status code ${res.status} when trying to setup. Exiting.`);
  }
}

export function getPizza() {
  let restrictions = {
    maxCaloriesPerSlice: 500,
    mustBeVegetarian: false,
    excludedIngredients: ["pepperoni"],
    excludedTools: ["knife"],
    maxNumberOfToppings: 6,
    minNumberOfToppings: 2,
  };
  let res = http.post(`${BASE_URL}/api/pizza`, JSON.stringify(restrictions), {
    headers: {
      "Content-Type": "application/json",
      Authorization: "Token " + tokens[Math.floor(Math.random() * tokens.length)],
    },
  });
  check(res, { "status is 200": (res) => res.status === 200 });
  pizzas.add(1);
  if (res.json().pizza) {
    ingredients.add(res.json().pizza.ingredients.length);
  }
  sleep(1);
}

export function teardown() {
  console.log("Black Friday simulation complete.");
}

export function handleSummary(data) {
  return {
    "blackfriday-summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
