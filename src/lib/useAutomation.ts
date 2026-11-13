import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AutomationPermission,
  AutomationStatus,
  getAutomationPermission,
  getAutomationStatus,
  hasAutomation,
  onAutomationState,
} from './automation';

/**
 * Live Action Mode state for the UI.
 *
 * Native pushes `AmitAutomationState` on every action, so the strip above the
 * composer and the Action Mode screen stay in sync without polling. Two things
 * matter here:
 *
 *  - the subscription is removed on unmount, and a `live` flag stops a late
 *    reply from a promise resolving into a screen that is already gone;
 *  - a build without the native module returns null, and the UI hides rather
 *    than showing a switch that cannot work.
 */
export function useAutomationStatus() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [permission, setPermission] = useState<AutomationPermission | null>(null);
  const live = useRef(true);

  const refresh = useCallback(async () => {
    if (!hasAutomation) return;
    const [s, p] = await Promise.all([getAutomationStatus(), getAutomationPermission()]);
    if (!live.current) return;
    if (s) setStatus(s);
    if (p) setPermission(p);
  }, []);

  useEffect(() => {
    live.current = true;
    refresh();
    const off = onAutomationState(next => {
      if (live.current) setStatus(next);
    });
    return () => {
      live.current = false;
      off();
    };
  }, [refresh]);

  return { status, permission, refresh };
}
