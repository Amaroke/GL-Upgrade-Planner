import { useCallback, useEffect, useRef, useState } from "react";

export type Notice = {
  key: string;
  readyAt: number | null;
  title: string;
  body: string;
};

export type NotificationPermissionState = NotificationPermission | "unsupported";

type NoticeState = "idle" | "running" | "ready";

function readPermission(): NotificationPermissionState {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function noticeState(notice: Notice, now: number): NoticeState {
  if (notice.readyAt === null) return "idle";
  return notice.readyAt > now ? "running" : "ready";
}

function snapshot(notices: Notice[], now: number): Map<string, NoticeState> {
  return new Map(notices.map((notice) => [notice.key, noticeState(notice, now)]));
}

export function useReadyNotifications(readNotices: () => Notice[], now: () => number) {
  const [permission, setPermission] = useState(readPermission);
  const latest = useRef({ readNotices, now });

  useEffect(() => {
    latest.current = { readNotices, now };
  });

  useEffect(() => {
    let lastState = snapshot(latest.current.readNotices(), latest.current.now());

    const id = setInterval(() => {
      const notices = latest.current.readNotices();
      const state = snapshot(notices, latest.current.now());
      for (const notice of notices) {
        const justBecameReady =
          lastState.get(notice.key) === "running" && state.get(notice.key) === "ready";
        if (justBecameReady && readPermission() === "granted") {
          try {
            new Notification(notice.title, { body: notice.body, tag: notice.key });
          } catch {
            continue;
          }
        }
      }
      lastState = state;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported" as const;
    try {
      await Notification.requestPermission();
    } catch {
      return readPermission();
    }
    const result = readPermission();
    setPermission(result);
    return result;
  }, []);

  return { permission, requestPermission };
}
