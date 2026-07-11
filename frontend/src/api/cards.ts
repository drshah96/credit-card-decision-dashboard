import type { Card, CardSummary } from "../types/cards";

// In dev, Vite proxies /api → localhost:8000.
// In production, set VITE_API_URL to the deployed backend URL (e.g. https://your-app.onrender.com).
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

async function apiFetch(path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`);
  } catch {
    throw new Error(
      "Could not reach the backend. Check that the server is running.",
    );
  }
  if (!res.ok) {
    throw new Error(`Server error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchCards(): Promise<CardSummary[]> {
  const data = await apiFetch("/cards");
  if (!Array.isArray(data)) {
    throw new Error("Unexpected response format: expected an array of cards.");
  }
  return data as CardSummary[];
}

export async function fetchCard(id: string): Promise<Card> {
  const data = await apiFetch(`/cards/${id}`);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Unexpected response format: expected a card object.");
  }
  return data as Card;
}
