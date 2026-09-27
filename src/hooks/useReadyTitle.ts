import { useEffect, useReducer, useState } from "react";
import type { Notice } from "./useReadyNotifications";

export function useReadyTitle(
  readNotices: () => Notice[],
  now: () => number,
  readExtraCount: () => number = () => 0,
) {
  const [, tick] = useReducer((t: number) => t + 1, 0);
  const [defaultTitle] = useState(() => document.title);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const readyCount =
    readNotices().filter((notice) => notice.readyAt !== null && notice.readyAt <= now()).length +
    readExtraCount();

  useEffect(() => {
    document.title = readyCount > 0 ? `(${readyCount}) ${defaultTitle}` : defaultTitle;
  }, [readyCount, defaultTitle]);

  useEffect(
    () => () => {
      document.title = defaultTitle;
    },
    [defaultTitle],
  );
}
