import { humanizeApiError } from "../authErrors";

export class ChatConnectionLostError extends Error {
  constructor() {
    super("connection_lost");
    this.name = "ChatConnectionLostError";
  }
}

/** Error whose message is already spec copy (from API helpers). */
export class UserFacingChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingChatError";
  }
}

export function userFacingChatError(
  status: number,
  rawDetail = "",
): UserFacingChatError {
  return new UserFacingChatError(humanizeApiError(status, rawDetail));
}

export function genericChatError(): UserFacingChatError {
  return userFacingChatError(500);
}

export function toChatUserMessage(error: unknown): string {
  if (error instanceof ChatConnectionLostError) {
    return humanizeApiError(500, "");
  }
  if (error instanceof UserFacingChatError) {
    return error.message;
  }
  if (error instanceof Error && error.message === humanizeApiError(500, "")) {
    return error.message;
  }
  return humanizeApiError(500, "");
}
