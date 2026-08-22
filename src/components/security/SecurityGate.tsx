import { useShiftTracker } from "@/hooks/useShiftTracker";
import { useScreenLock } from "@/hooks/useScreenLock";
import LockOverlay from "./LockOverlay";

/**
 * Mounted once in AppLayout. Runs silent shift tracking and renders the PIN
 * overlay as a sibling of the app tree so no screen ever remounts.
 */
const SecurityGate = () => {
  useShiftTracker();
  const { locked, unlock, needsSetup, onPinCreated } = useScreenLock();

  if (needsSetup) {
    return <LockOverlay mode="setup" onUnlocked={unlock} onPinCreated={onPinCreated} />;
  }
  if (locked) {
    return <LockOverlay mode="unlock" onUnlocked={unlock} onPinCreated={onPinCreated} />;
  }
  return null;
};

export default SecurityGate;
