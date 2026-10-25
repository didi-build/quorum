import { DomMark } from "../components/DomMark";

export function EntryLoading() {
  return (
    <div
      className="quorum-auth-loading"
      aria-busy="true"
      role="status"
      aria-label="Loading"
    >
      <DomMark size={40} />
      <span className="quorum-spin" aria-hidden="true" />
      Loading
    </div>
  );
}
