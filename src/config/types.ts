export interface QuorumConfig {
  appEnv: string;
  appBaseUrl: string;
  defaultUserId: string;

  tokenEncryptionKey: string;
  bootstrapApiKey: string;

  githubAppOauthClientId: string;
  githubAppOauthClientSecret: string;
  githubAuthRedirectUri: string;
  authAllowedGithubIdsRaw: string;
  sessionSecret: string;
  sessionCookieName: string;
  sessionTtlDays: number;
  authDisplayCookieName: string;
  wsAllowedOriginsRaw: string;

  githubAppId: string;
  githubAppSlug: string;
  githubAppPrivateKeyBase64: string;

  linearClientId: string;
  linearClientSecret: string;
  linearRedirectUri: string;
  linearScopes: string;

  voyageApiKey: string;
  voyageBaseUrl: string;
  voyageModel: string;
  embeddingDimensions: number;

  rrfK: number;
  retrievalTopK: number;
  coverageMinScore: number;

  chunkTargetTokens: number;
  chunkOverlapTokens: number;

  anthropicApiKey: string;
  supervisorModel: string;
  retrievalAnswerModel: string;
  personaModel: string;
  councilChairModel: string;

  readonly allowedGithubIds: ReadonlySet<number>;
  readonly wsAllowedOriginSet: ReadonlySet<string>;
}
