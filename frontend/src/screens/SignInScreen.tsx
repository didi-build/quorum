import { DomMark } from "../components/DomMark";
import { githubLoginUrl, landingPageUrl } from "../lib/auth";

export function SignInScreen() {
  return (
    <div className="quorum-auth-card">
      <DomMark size={44} />
      <h1>Sign in to Quorum</h1>
      <p>Quorum is private for now. Use the GitHub account I&apos;ve invited.</p>
      <a className="dom-btn dom-btn--primary dom-btn--lg" href={githubLoginUrl()}>
        Sign in with GitHub
      </a>
      <p className="caption">
        <a href={landingPageUrl()}>Back to quorum.didi.build</a>
      </p>
    </div>
  );
}
