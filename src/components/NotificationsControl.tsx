import { useState } from "react";
import { Modal } from "./Modal";
import { PILL_BASE_CLASSES } from "../config/pillStyles";
import type { NotificationPermissionState } from "../hooks/useReadyNotifications";

type NotificationsControlProps = {
  permission: NotificationPermissionState;
  requestPermission: () => Promise<NotificationPermissionState>;
};

const BELL_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4 shrink-0"
  >
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

export function NotificationsControl({ permission, requestPermission }: NotificationsControlProps) {
  const [result, setResult] = useState<"granted" | "denied" | null>(null);

  if (permission === "unsupported") return null;

  const handleEnable = async () => {
    const outcome = await requestPermission();
    if (outcome === "granted" || outcome === "denied") setResult(outcome);
  };

  return (
    <>
      {permission === "default" ? (
        <button
          type="button"
          onClick={handleEnable}
          className={`${PILL_BASE_CLASSES} text-white transition-colors hover:bg-white/12`}
        >
          {BELL_ICON}
          Enable notifications
        </button>
      ) : (
        <p className={`${PILL_BASE_CLASSES} text-white/40`}>
          {BELL_ICON}
          {permission === "granted" ? "Notifications enabled" : "Notifications blocked"}
        </p>
      )}
      {result && (
        <Modal
          label={result === "granted" ? "Notifications enabled" : "Notifications blocked"}
          onClose={() => setResult(null)}
        >
          <div className="rounded-2xl border border-white/10 bg-panel p-6 text-center text-sm text-white/70">
            {result === "granted" ? (
              <p>
                Notifications enabled. You will be notified when a Drop is ready or a Construction
                is finished.
              </p>
            ) : (
              <p>
                Notifications blocked. You can allow them from your browser's site settings if you
                change your mind.
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
