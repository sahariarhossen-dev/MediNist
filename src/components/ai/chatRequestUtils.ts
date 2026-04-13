import { DEFAULT_FIRST_MESSAGE, type Msg } from "./chatStore";
import { isTransientAssistantMessage } from "./chatMessageUtils";

const MAX_CONTEXT_MESSAGES = 6;

const isDefaultWelcomeMessage = (message: Msg, index: number) =>
  index === 0 &&
  message.role === DEFAULT_FIRST_MESSAGE.role &&
  message.content === DEFAULT_FIRST_MESSAGE.content;

export const buildChatRequestMessages = (messages: Msg[]) =>
  messages
    .filter((message, index) => !isDefaultWelcomeMessage(message, index))
    .filter((message) => message.content.trim().length > 0)
    .filter((message) => !isTransientAssistantMessage(message))
    .slice(-MAX_CONTEXT_MESSAGES);
