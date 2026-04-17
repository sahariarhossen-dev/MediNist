import { Sparkles, Github } from "lucide-react";
// ... keep existing code
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200">
          <Github className="h-4 w-4 text-gray-600" />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
