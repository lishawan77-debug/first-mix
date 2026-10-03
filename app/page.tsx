"use client";

import { useEffect, useRef } from "react";
import { mountTrainer } from "./first-mix/trainer";

export default function Home() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    return mountTrainer(root.current);
  }, []);
  return (
    <main>
      <div ref={root} />
      <noscript>FIRST MIX needs JavaScript for its interactive audio games. Enable JavaScript to play.</noscript>
    </main>
  );
}
