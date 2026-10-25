import { useState } from "react";
import { AuthFrame } from "../components/AuthFrame";
import { DomMark } from "../components/DomMark";
import { GitHubIcon } from "../components/GitHubIcon";
import { githubLoginUrl } from "../lib/auth";

export function SignInScreen() {
  const [redirecting, setRedirecting] = useState(false);

  const handleSignIn = () => {
    setRedirecting(true);
    window.location.assign(githubLoginUrl());
  };

  return (
    <AuthFrame>
      <DomMark size={44} />
      <h1>Sign in to Quorum</h1>
      <p>Quorum is private for now. Use the GitHub account I&apos;ve invited.</p>
      <button
        type="button"
        className="dom-btn dom-btn--github dom-btn--lg dom-btn--block"
        disabled={redirecting}
        onClick={handleSignIn}
      >
        {redirecting ? (
          <>
            <span className="quorum-spin" aria-hidden="true" />
            Taking you to GitHub
          </>
        ) : (
          <>
            <GitHubIcon size={16} />
            Sign in with GitHub
          </>
        )}
      </button>
    </AuthFrame>
  );
}
