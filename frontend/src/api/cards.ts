import type { CardSummary } from "../types/cards";

const BASE_URL = "/api";

export async function fetchCards(): Promise<CardSummary[]> {
  const res = await fetch(`${BASE_URL}/cards`);
  if (!res.ok) throw new Error(`Failed to fetch cards: ${res.status}`);
  return res.json();
}