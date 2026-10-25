import type { ReactNode } from "react";
import { landingPageUrl } from "../lib/auth";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="quorum-auth">
      <div className="quorum-auth-card">{children}</div>
      <p className="quorum-auth-foot">
        Back to <a href={landingPageUrl()}>quorum.didi.build</a>
      </p>
    </div>
  );
}
