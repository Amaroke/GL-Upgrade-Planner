import type { ReactNode } from "react";
import { NumberField } from "./NumberField";
import { TypeIcon } from "./TypeIcon";
import {
  limitsAt,
  MIN_LEVEL,
  sharedLevel,
  withCount,
  withLevel,
  withSharedCount,
  withSharedLevel,
  type CategoryGroup,
} from "../planner/buildings";
import {
  instanceStatus,
  typeStatuses,
  unlocksAt,
  type InstanceStatus,
  type TypeStatus,
} from "../planner/statuses";
import type { ColonyBuildings } from "../store/colonyStore";
import { typeImage } from "../typeImages";

const STATUS_LABELS: Record<TypeStatus, string> = {
  missing: "To construct",
  "below-limit": "To upgrade",
  "over-limit": "Over limit",
  maxed: "Maxed",
};

const STATUS_STYLES: Record<TypeStatus, string> = {
  missing: "bg-red-500/15 text-red-300",
  "below-limit": "bg-blue-500/15 text-blue-300",
  "over-limit": "bg-red-500/15 text-red-300",
  maxed: "bg-green-500/15 text-green-300",
};

function StatusBadge({ status, label }: { status: TypeStatus; label?: string }) {
  return (
    <span
      aria-label={label}
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const CHIP_STYLES: Record<InstanceStatus | "maxed", string> = {
  "below-limit": "border-blue-400/40 bg-blue-500/10",
  "over-limit": "border-red-400/50 bg-red-500/10",
  maxed: "border-green-400/40 bg-green-500/10",
};

type LevelChipProps = {
  status: InstanceStatus | null;
  statusLabel?: string;
  children: ReactNode;
};

function LevelChip({ status, statusLabel, children }: LevelChipProps) {
  return (
    <span className={`rounded-lg border px-1 py-0.5 ${CHIP_STYLES[status ?? "maxed"]}`}>
      {status && statusLabel && (
        <span aria-label={statusLabel} className="sr-only">
          {STATUS_LABELS[status]}
        </span>
      )}
      {children}
    </span>
  );
}

type BuildingsListProps = {
  groups: CategoryGroup[];
  starBaseLevel: number;
  buildings: ColonyBuildings;
  onChange: (typeId: string, levels: number[]) => void;
};

export function BuildingsList({ groups, starBaseLevel, buildings, onChange }: BuildingsListProps) {
  return (
    <div className="mt-5 flex flex-col gap-5">
      {groups.map(({ category, types }) => (
        <section key={category}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-heading">
            {category}
          </h3>
          <div className="flex flex-col gap-1.5">
            {types.map((type) => {
              const levels = buildings[type.id] ?? [];
              const limits = limitsAt(type, starBaseLevel);
              const statuses = typeStatuses(type, starBaseLevel, levels);
              const unlockLevel = unlocksAt(type, starBaseLevel);
              return (
                <div
                  key={type.id}
                  role="group"
                  aria-label={type.name}
                  className={`flex gap-3 rounded-lg bg-surface/5 px-3 py-2 ${
                    unlockLevel === null ? "" : "opacity-50"
                  }`}
                >
                  {typeImage(type.id) && (
                    <span className="flex w-16 shrink-0 items-center justify-center border-r border-white/10 pr-3">
                      <TypeIcon typeId={type.id} size={56} />
                    </span>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{type.name}</span>
                        {statuses.length > 0 && (
                          <ul aria-label="Statuses" className="flex gap-1">
                            {statuses.map((status) => (
                              <li key={status}>
                                <StatusBadge status={status} />
                              </li>
                            ))}
                          </ul>
                        )}
                        {unlockLevel !== null && (
                          <span className="text-xs text-white/60">
                            Unlocks at Star Base {unlockLevel}
                          </span>
                        )}
                      </div>
                      <span className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-white/55">Owned</span>
                        <NumberField
                          label={`${type.name} owned`}
                          value={levels.length}
                          min={0}
                          max={limits.maxCount}
                          onCommit={(count) =>
                            onChange(
                              type.id,
                              type.sharedLevel
                                ? withSharedCount(levels, count)
                                : withCount(levels, count),
                            )
                          }
                        />
                      </span>
                    </div>
                    {levels.length > 0 && (
                      <div className="flex flex-col gap-2 border-t border-white/10 pt-2">
                        <div className="flex flex-wrap gap-1.5">
                          {type.sharedLevel ? (
                            <LevelChip status={instanceStatus(limits, 0, sharedLevel(levels))}>
                              <NumberField
                                compact
                                label={`${type.name} level`}
                                value={sharedLevel(levels)}
                                min={MIN_LEVEL}
                                max={limits.maxLevel}
                                onCommit={(next) =>
                                  onChange(type.id, withSharedLevel(levels, next))
                                }
                              />
                            </LevelChip>
                          ) : (
                            levels.map((level, index) => (
                              <LevelChip
                                key={index}
                                status={instanceStatus(limits, index, level)}
                                statusLabel={`${type.name} ${index + 1} status`}
                              >
                                <NumberField
                                  compact
                                  label={`${type.name} ${index + 1} level`}
                                  value={level}
                                  min={MIN_LEVEL}
                                  max={limits.maxLevel}
                                  onCommit={(next) =>
                                    onChange(type.id, withLevel(levels, index, next))
                                  }
                                />
                              </LevelChip>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
