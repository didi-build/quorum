import { humanizeApiError } from "../authErrors";

export const CHAT_GENERIC_ERROR_MESSAGE =
  "Something went wrong on our side. Try again in a moment.";

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
  return new UserFacingChatError(CHAT_GENERIC_ERROR_MESSAGE);
}

export function toChatUserMessage(error: unknown): string {
  if (error instanceof ChatConnectionLostError) {
    return CHAT_GENERIC_ERROR_MESSAGE;
  }
  if (error instanceof UserFacingChatError) {
    return error.message;
  }
  if (error instanceof Error && error.message === CHAT_GENERIC_ERROR_MESSAGE) {
    return error.message;
  }
  return CHAT_GENERIC_ERROR_MESSAGE;
}
