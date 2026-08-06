import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { reportError } from "@/utils/errorReporting";

// The boundary must hand every caught error to the first-party reporter
// (issue #149) — mocked here so no fetch fires.
vi.mock("@/utils/errorReporting", () => ({ reportError: vi.fn() }));

// Component that throws on render for testing purposes
function ThrowingComponent(): never {
  throw new Error("Test render error");
}

// Suppress React's own console.error output during error boundary tests
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("renders fallback UI when a child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
  });

  it("shows a reload button in the fallback UI", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
  });

  it("calls window.location.reload when the reload button is clicked", () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: /reload page/i }));

    expect(reloadSpy).toHaveBeenCalledOnce();
  });

  it("logs the error via componentDidCatch", () => {
    const errorSpy = vi.spyOn(console, "error");

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "[ErrorBoundary]",
      expect.any(Error),
      expect.anything(),
    );
  });

  it("reports the caught error with its component stack (issue #149)", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Test render error" }),
      expect.stringContaining("ThrowingComponent"),
    );
  });
});
