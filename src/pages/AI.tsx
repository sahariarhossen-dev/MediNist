import { useState } from "react";
import ConversationList from "@/components/ai/ConversationList";
import ChatScreen from "@/components/ai/ChatScreen";

const AI = () => {
  const [activeChat, setActiveChat] = useState<string | null>(null);

  if (activeChat) {
    return <ChatScreen conversationId={activeChat} onBack={() => setActiveChat(null)} />;
  }

  return <ConversationList onOpenChat={(id) => setActiveChat(id)} />;
};

export default AI;
