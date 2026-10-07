import type { Problem, ProblemId } from "./types";

/**
 * Interview problem bank (FR-050, docs/34 Step 2). Requirements are calibrated against the
 * simulator: each reference design (references.ts) passes every check with a margin
 * (golden-tested in problems.test.ts), and naive designs fail. A 20 ms service tier has a p99 near 180 ms at
 * ρ 0.5 (M/M/1 tail), which is why read targets sit in the 150–300 ms range.
 */

export const PROBLEMS: Record<ProblemId, Problem> = {
  "url-shortener": {
    id: "url-shortener",
    title: "Design a URL shortener",
    difficulty: "easy",
    brief:
      "Users create short links and open them far more often than they create them. Redirects must feel instant everywhere, and a popular link can't take the service down.",
    requirements: {
      dau: 10_000_000,
      peakRps: 40_000,
      readRatio: 0.95,
      p99Ms: 200,
      p99WriteMs: 300,
      availability: 0.999,
      monthlyBudget: 2_500,
    },
    hints: [
      {
        check: "general",
        question:
          "Let's start simple: when someone opens a short link, where does the request go first?",
      },
      {
        check: "p99-read",
        question:
          "Redirects are 95% of traffic. What keeps a redirect fast when the same link is opened millions of times?",
      },
      {
        check: "headroom",
        question:
          "At 40,000 requests a second, which component runs out of capacity first, and how would you see it?",
      },
      {
        check: "spof",
        question:
          "If one instance of each component died right now, which one would take redirects down with it?",
      },
      {
        check: "availability",
        question:
          "Some requests are failing at peak. Which component is dropping them, and what's the cheapest fix?",
      },
      {
        check: "p99-write",
        question:
          "Creating a link is a write. Where does it land, and what happens to its latency when the database is busy?",
      },
      {
        check: "cost",
        question:
          "You're over budget. Which part of the design is the most expensive per request served?",
      },
    ],
  },

  "rate-limiter": {
    id: "rate-limiter",
    title: "Design a rate limiter",
    difficulty: "easy",
    brief:
      "Every API call in the company passes through your limiter, which checks and increments a counter per client. It sits on the hot path, so it has to be very fast and must never become the reason requests fail.",
    requirements: {
      dau: 50_000_000,
      peakRps: 200_000,
      readRatio: 0.5,
      p99Ms: 75,
      p99WriteMs: 75,
      availability: 0.9999,
      monthlyBudget: 1_500,
    },
    hints: [
      {
        check: "general",
        question:
          "Walk me through one request: where is the counter for a client stored, and who reads it?",
      },
      {
        check: "p99-read",
        question:
          "The limiter adds latency to every API call in the company. Where does that latency come from in your design?",
      },
      {
        check: "headroom",
        question:
          "200,000 checks a second is a lot. Which tier is closest to its limit, and what happens when it gets there?",
      },
      {
        check: "spof",
        question:
          "If one counter-store node fails, do requests get limited wrongly, or do they fail? Which is worse here?",
      },
      {
        check: "availability",
        question:
          "Requests are failing at peak. Is the limiter rejecting them, or is it overloaded itself?",
      },
      {
        check: "p99-write",
        question:
          "Every check is also an increment. How do you keep the write path as fast as the read path?",
      },
      {
        check: "cost",
        question:
          "Could you serve the same load with fewer, bigger components? What would you trade off?",
      },
    ],
  },

  chat: {
    id: "chat",
    title: "Design a chat service",
    difficulty: "medium",
    brief:
      "One-to-one and group messaging. Messages must be stored and delivered to every member of a conversation, and recent history loads whenever someone opens a chat.",
    requirements: {
      dau: 20_000_000,
      peakRps: 60_000,
      readRatio: 0.6,
      p99Ms: 500,
      p99WriteMs: 500,
      availability: 0.999,
      monthlyBudget: 15_000,
    },
    hints: [
      {
        check: "general",
        question:
          "When I send a message to a group, what happens between my phone and my friends' phones?",
      },
      {
        check: "p99-write",
        question:
          "Sending should feel instant even when a group has hundreds of members. What do you do synchronously, and what later?",
      },
      {
        check: "p99-read",
        question:
          "Opening a chat loads recent history. Where does that read go, and how do you keep it fast?",
      },
      {
        check: "headroom",
        question:
          "Which component is working hardest at peak? What happens to delivery when it's saturated?",
      },
      {
        check: "spof",
        question: "If one instance of your message store disappears, what do users see?",
      },
      {
        check: "availability",
        question: "Some sends are failing at peak. Which part of the path is dropping them?",
      },
      {
        check: "cost",
        question:
          "Fan-out to big groups is expensive. Where does that cost show up in your design?",
      },
    ],
  },

  "news-feed": {
    id: "news-feed",
    title: "Design a news feed",
    difficulty: "medium",
    brief:
      "Users scroll a feed of posts from people they follow and occasionally post themselves. Reads dominate, and the feed should load quickly even for people who follow thousands of accounts.",
    requirements: {
      dau: 50_000_000,
      peakRps: 120_000,
      readRatio: 0.98,
      p99Ms: 300,
      p99WriteMs: 400,
      availability: 0.999,
      monthlyBudget: 6_000,
    },
    hints: [
      {
        check: "general",
        question: "When I open the app, how is my feed assembled: at read time, or ahead of time?",
      },
      {
        check: "p99-read",
        question:
          "98% of traffic is reading feeds. What do you cache, where, and what's the hit rate you expect?",
      },
      { check: "headroom", question: "At 120,000 requests a second, which tier saturates first?" },
      {
        check: "spof",
        question:
          "If one instance of your feed cache died, how much load would land on the database at once?",
      },
      {
        check: "availability",
        question: "Feed loads are failing at peak. Which component is dropping them?",
      },
      {
        check: "p99-write",
        question:
          "A post has to reach followers' feeds. What happens on the write path when a celebrity with 30 million followers posts?",
      },
      {
        check: "cost",
        question:
          "Which part of the design would you shrink first to get under budget, and what would it cost you in latency?",
      },
    ],
  },

  "ride-dispatch": {
    id: "ride-dispatch",
    title: "Design ride dispatch",
    difficulty: "hard",
    brief:
      "Drivers send their location every few seconds and riders request trips. Dispatch has to match a rider to a nearby driver quickly, and trips must never be lost.",
    requirements: {
      dau: 5_000_000,
      peakRps: 30_000,
      readRatio: 0.7,
      p99Ms: 300,
      p99WriteMs: 350,
      availability: 0.9995,
      monthlyBudget: 6_000,
    },
    hints: [
      {
        check: "general",
        question: "A rider taps Request. What has to happen before they see a driver's name?",
      },
      {
        check: "p99-read",
        question:
          "Finding nearby drivers is a read on fast-changing data. Where do driver locations live?",
      },
      {
        check: "p99-write",
        question:
          "Location updates arrive constantly. How do you keep them from slowing down trip writes?",
      },
      {
        check: "headroom",
        question:
          "Which component is closest to its limit at peak? What happens to matching when it saturates?",
      },
      {
        check: "spof",
        question:
          "If one instance of the trips database failed mid-trip, what would happen to that trip?",
      },
      {
        check: "availability",
        question: "Some requests are failing at peak. Which ones, and where?",
      },
      {
        check: "cost",
        question: "Where is most of your monthly cost going, and is it buying latency or safety?",
      },
    ],
  },

  "video-streaming": {
    id: "video-streaming",
    title: "Design video streaming",
    difficulty: "hard",
    brief:
      "Viewers watch videos split into segments; creators occasionally upload. Playback must start quickly and keep going at a quarter of a million segment requests a second.",
    requirements: {
      dau: 30_000_000,
      peakRps: 250_000,
      readRatio: 0.99,
      p99Ms: 300,
      p99WriteMs: 400,
      availability: 0.999,
      monthlyBudget: 3_500,
    },
    hints: [
      {
        check: "general",
        question: "When I press play, where does the first video segment come from?",
      },
      {
        check: "p99-read",
        question:
          "Almost all traffic is segment reads. How much of it should ever reach your own servers?",
      },
      {
        check: "headroom",
        question: "At 250,000 requests a second, what saturates first if the CDN's hit rate drops?",
      },
      {
        check: "spof",
        question: "If one instance of your segment storage failed, how many viewers would notice?",
      },
      {
        check: "availability",
        question: "Playback requests are failing at peak. Where are they being dropped?",
      },
      {
        check: "p99-write",
        question: "Uploads are rare but large. How do you keep them from affecting playback?",
      },
      {
        check: "cost",
        question:
          "Bandwidth is the big bill in streaming. Which part of your design serves the most bytes?",
      },
    ],
  },
};

export const PROBLEM_LIST: Problem[] = Object.values(PROBLEMS);
