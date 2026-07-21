export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", marginTop: 40 }}>
      <div
        className="wrap"
        style={{
          padding: "24px 20px 40px",
          fontSize: 12,
          lineHeight: 1.6,
          color: "var(--faint)",
          textAlign: "center",
        }}
      >
        Card terms, fees, and credits shown here reflect issuer offers as of July 2026, but
        banks change pricing, credits, and benefits without notice. Always confirm current
        terms on the issuer's official site before applying — this dashboard is for
        informational purposes only and isn't financial advice.
      </div>
    </footer>
  );
}