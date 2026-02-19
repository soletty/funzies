"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

const EXAMPLE_PROMPTS = [
  { text: "Design the architecture for a real-time multiplayer game backend", tag: "Engineering" },
  { text: "I'm torn between two career paths and need to think this through deeply", tag: "Life" },
  { text: "How should I restructure my SaaS pricing to maximize retention?", tag: "Business" },
  { text: "Help me understand the Israel-Palestine conflict from every angle", tag: "Geopolitics" },
  { text: "I want to grow my Instagram from 1K to 100K followers", tag: "Growth" },
  { text: "What's the best approach to homeschooling a gifted 8-year-old?", tag: "Education" },
  { text: "I had a terrible fight with my partner and need perspective", tag: "Relationships" },
  { text: "Evaluate whether I should raise VC funding or bootstrap", tag: "Startups" },
  { text: "Help me design a personal fitness program for marathon training", tag: "Health" },
  { text: "What programming language should I learn in 2026 and why?", tag: "Tech" },
  { text: "I need to negotiate a 40% salary increase — how do I approach this?", tag: "Career" },
  { text: "Should I buy or rent in this economy? Run the numbers from every angle", tag: "Finance" },
];

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function EmptyDashboard() {
  const [visiblePrompts, setVisiblePrompts] = useState<typeof EXAMPLE_PROMPTS>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shuffledPrompts = shuffled(EXAMPLE_PROMPTS);
    const timers: ReturnType<typeof setTimeout>[] = [];

    shuffledPrompts.forEach((prompt, i) => {
      timers.push(
        setTimeout(() => {
          setVisiblePrompts((prev) => [...prev, prompt]);
        }, 150 + i * 200)
      );
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="empty-dashboard" ref={containerRef}>
      <div className="empty-dashboard-center">
        <h2 className="empty-dashboard-title">What should the assembly debate?</h2>
        <p className="empty-dashboard-subtitle">
          Any topic. Any question. Six characters will collide over it.
        </p>
        <Link href="/new" className="btn-primary" style={{ fontSize: "1rem", padding: "0.8rem 2rem" }}>
          Start your first assembly
        </Link>
      </div>

      <div className="prompt-cloud">
        {visiblePrompts.map((prompt, i) => (
          <div
            key={i}
            className="prompt-bubble"
            style={{
              animationDelay: `${i * 0.2}s`,
              animationDuration: `${18 + (i % 5) * 4}s`,
            }}
          >
            <span className="prompt-bubble-tag">{prompt.tag}</span>
            <span className="prompt-bubble-text">{prompt.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
