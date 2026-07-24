import { Link } from "react-router-dom";
import { useCompareList } from "../hooks/useCompareList";

interface Props {
  active: "issuers" | "compare";
}

export function PageTabs({ active }: Props) {
  const { compareIds } = useCompareList();
  const compareTo = compareIds.length > 0 ? `/compare?cards=${compareIds.join(",")}` : "/compare";

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
        to={compareTo}
        className={`page-tab ${active === "compare" ? "active" : ""}`}
        aria-current={active === "compare" ? "page" : undefined}
      >
        Compare Cards{compareIds.length > 0 && ` (${compareIds.length})`}
      </Link>
    </nav>
  );
}
