import helmetImg from "./assets/helmet.png";
import starBatteryImg from "./assets/star-battery.png";
import toolCaseImg from "./assets/tool-case.png";
import type { Notice } from "./hooks/useReadyNotifications";
import type { DropStore } from "./store/dropStore";

export type DropDefinition = {
  storageKey: string;
  name: string;
  image: string;
  cooldownHours: number;
  accent: string;
};

export const DROPS: DropDefinition[] = [
  {
    storageKey: "gl-timer-star-battery",
    name: "Star Battery",
    image: starBatteryImg,
    cooldownHours: 11,
    accent: "#5ec8ff",
  },
  {
    storageKey: "gl-timer-tool-case",
    name: "Tool Case",
    image: toolCaseImg,
    cooldownHours: 23,
    accent: "#ffb85e",
  },
  {
    storageKey: "gl-timer-helmet",
    name: "Helmet",
    image: helmetImg,
    cooldownHours: 35,
    accent: "#c084fc",
  },
];

export function dropNotices(store: DropStore): Notice[] {
  return DROPS.map((drop) => ({
    key: drop.storageKey,
    readyAt: store.get(drop.storageKey)?.readyAt ?? null,
    title: `${drop.name} is ready`,
    body: `Your ${drop.name} can be collected.`,
  }));
}
