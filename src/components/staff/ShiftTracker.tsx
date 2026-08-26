import { useShiftTracker } from "@/hooks/useShiftTracker";

/**
 * Mounted once in AppLayout. Runs silent duty/shift heartbeat tracking only —
 * no screen lock, no network restriction. Renders nothing.
 */
const ShiftTracker = () => {
  useShiftTracker();
  return null;
};

export default ShiftTracker;
