import { Link } from "react-router-dom";

interface Props {
  active: "issuers" | "compare";
}

export function PageTabs({ active }: Props) {
  return (
    <nav className="page-tabs" aria-label="Site sections">
      <Link
        to="/"
        className={`page-tab ${active === "issuers" ? "active" : ""}`}
        aria-current={active === "issuers" ? "page" : undefined}
      >
        By Issuer
      </Link>
      <Link
        to="/compare"
        className={`page-tab ${active === "compare" ? "active" : ""}`}
        aria-current={active === "compare" ? "page" : undefined}
      >
        Compare Cards
      </Link>
    </nav>
  );
}
