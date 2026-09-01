import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAiThreads } from "@/hooks/useAiThreads";

/**
 * Legacy `/workspace/ai` entry point.
 *
 * Resumes the most recent non-archived topic thread, or drops the user back on
 * the Chats list (with the new-chat sheet opened) when there is nothing yet.
 */
const AiThreadResolver = () => {
  const { threads, loading } = useAiThreads();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (threads.length > 0) {
      navigate(`/workspace/ai/${threads[0].id}`, { replace: true });
    }
  }, [loading, threads, navigate]);

  if (!loading && threads.length === 0) {
    return <Navigate to="/workspace?new=ai" replace />;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
    </div>
  );
};

export default AiThreadResolver;
