import type { CardSummary } from "../types/cards";

// In dev, Vite proxies /api → localhost:8000.
// In production, set VITE_API_URL to the deployed backend URL (e.g. https://your-app.onrender.com).
const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export async function fetchCards(): Promise<CardSummary[]> {
  let res: Response;

  try {
    res = await fetch(`${BASE_URL}/cards`);
  } catch {
    throw new Error(
      "Could not reach the backend. Check that the server is running.",
    );
  }

  if (!res.ok) {
    throw new Error(`Server error ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<CardSummary[]>;
}