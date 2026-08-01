// Shown once a page's loading state has run long enough that a visitor
// would reasonably think the site is broken — see useSlowLoadWarning. The
// goal is to stop what happened in practice: people closing the tab and
// retrying a few times during a Render free-tier cold start, thinking that
// would help, when the honest answer is just "wait, it's on its way."
export function SlowLoadNotice() {
  return (
    <p
      style={{
        marginTop: 12,
        fontSize: 13.5,
        color: "var(--muted)",
        textAlign: "center",
      }}
    >
      Still waking up — the server naps after a few quiet minutes, so a first
      visit can take up to a minute. No need to refresh, it's on its way.
    </p>
  );
}
