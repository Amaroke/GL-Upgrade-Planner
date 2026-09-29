import { useState } from "react";
import { DurationEditor, ROW_BUTTON, RunningJob } from "./NextSteps";
import { NumberField } from "./NumberField";
import { useTick } from "../hooks/useTick";
import { UNIT_CATEGORIES, type Catalog } from "../planner/catalog";
import {
  jobLabel,
  laboratoryLevel,
  MEDAL_LEVEL,
  researchBlocker,
  stepLabel,
  unitSteps,
  unitViews,
  type LabColony,
  type LabKind,
  type UnitStatus,
  type UnitStep,
  type UnitView,
} from "../planner/laboratory";

export type LabActions = {
  onStart: (step: UnitStep, seconds: number) => void;
  onDone: (kind: LabKind) => void;
  onCancel: (kind: LabKind) => void;
  onEdit: (kind: LabKind, seconds: number) => void;
};

type LabProps = {
  catalog: Catalog;
  colony: LabColony;
  now: () => number;
};

const DISABLED = "disabled:cursor-not-allowed disabled:opacity-40";
const HEADING = "text-sm font-semibold uppercase tracking-wide text-white/50";

const SLOT_TITLES: Record<LabKind, string> = { research: "Research", unlock: "Unlock" };

const STATUS_LABELS: Record<Exclude<UnitStatus, "locked">, string> = {
  "to-unlock": "To unlock",
  "below-limit": "To research",
  maxed: "Maxed",
  "over-limit": "Over limit",
};

const STATUS_STYLES: Record<UnitStatus, string> = {
  locked: "bg-white/5 text-white/50",
  "to-unlock": "bg-red-500/15 text-red-300",
  "below-limit": "bg-blue-500/15 text-blue-300",
  maxed: "bg-green-500/15 text-green-300",
  "over-limit": "bg-red-500/15 text-red-300",
};

function blockerOf(kind: LabKind, colony: LabColony, now: number): string | null {
  if (colony[kind]) return `A ${SLOT_TITLES[kind]} is already running`;
  return kind === "research" ? researchBlocker(colony, now) : null;
}

function StartButton({
  step,
  blocker,
  onStart,
}: {
  step: UnitStep;
  blocker: string | null;
  onStart: LabActions["onStart"];
}) {
  const [isAskingDuration, setIsAskingDuration] = useState(false);
  const label = stepLabel(step);
  if (isAskingDuration) {
    return (
      <DurationEditor
        action="Start"
        label={label}
        inputLabel={`Duration of ${label}`}
        confirmText="Start"
        initial=""
        disabled={blocker !== null}
        onConfirm={(seconds) => onStart(step, seconds)}
        onBack={() => setIsAskingDuration(false)}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={`Start ${label}`}
      disabled={blocker !== null}
      title={blocker ?? undefined}
      onClick={() =>
        step.seconds === null ? setIsAskingDuration(true) : onStart(step, step.seconds)
      }
      className={`${ROW_BUTTON} ${DISABLED}`}
    >
      Start
    </button>
  );
}

function LaboratoryLine({ colony }: { colony: LabColony }) {
  const level = laboratoryLevel(colony.buildings);
  return (
    <span className="text-xs text-white/50">
      {level === 0 ? "No Laboratory on this Colony" : `Laboratory level ${level}`}
    </span>
  );
}

function Slot({
  kind,
  catalog,
  colony,
  now,
  steps,
  actions,
}: LabProps & { kind: LabKind; steps: UnitStep[]; actions: LabActions }) {
  const [choice, setChoice] = useState<string | null>(null);
  const job = colony[kind];
  const title = SLOT_TITLES[kind];
  const options = steps.filter((step) => step.kind === kind);
  const selected = options.find((step) => step.unit.id === choice) ?? options[0];
  const blocker = blockerOf(kind, colony, now());
  const noLaboratory = kind === "research" && laboratoryLevel(colony.buildings) === 0;

  function content() {
    if (job) {
      const label = jobLabel(catalog, kind, job);
      return (
        <>
          <span className="text-sm text-[#e9e6f5]">{label}</span>
          <RunningJob
            key={job.finishAt}
            label={label}
            noun={title}
            finishAt={job.finishAt}
            now={now}
            onDone={() => actions.onDone(kind)}
            onCancel={() => actions.onCancel(kind)}
            onEdit={(seconds) => actions.onEdit(kind, seconds)}
          />
        </>
      );
    }
    if (noLaboratory) return <span className="text-sm text-white/40">No Laboratory</span>;
    if (!selected) return <span className="text-sm text-white/40">Nothing to {kind}</span>;
    return (
      <>
        <select
          aria-label={`Next ${title}`}
          value={selected.unit.id}
          onChange={(event) => setChoice(event.target.value)}
          className="select min-w-0 !py-1 text-xs"
        >
          {options.map((step) => (
            <option key={step.unit.id} value={step.unit.id}>
              {stepLabel(step)} · {step.time ?? "time unknown"}
            </option>
          ))}
        </select>
        {blocker && <span className="text-xs text-white/50">{blocker}</span>}
        <span className="ml-auto">
          <StartButton
            key={selected.unit.id}
            step={selected}
            blocker={blocker}
            onStart={actions.onStart}
          />
        </span>
      </>
    );
  }

  return (
    <div
      role="group"
      aria-label={title}
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-xl border border-white/10 px-3 py-2"
    >
      <span className="w-16 text-xs uppercase tracking-wide text-white/40">{title}</span>
      {content()}
    </div>
  );
}

export function LaboratoryStrip({ actions, ...props }: LabProps & { actions: LabActions }) {
  useTick();
  const steps = unitSteps(props.catalog, props.colony);
  return (
    <section
      aria-label="Laboratory"
      className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-400/[0.03] p-3"
    >
      <div className="mb-2 flex items-center gap-3">
        <h3 className={HEADING}>Laboratory</h3>
        <LaboratoryLine colony={props.colony} />
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        <Slot kind="research" steps={steps} actions={actions} {...props} />
        <Slot kind="unlock" steps={steps} actions={actions} {...props} />
      </div>
    </section>
  );
}

function LevelPips({ view }: { view: UnitView }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-0.5">
      {Array.from({ length: MEDAL_LEVEL }, (_, index) => {
        const level = index + 1;
        const owned = view.level !== null && level <= view.level;
        const allowed = level <= view.cap;
        const medal = level === MEDAL_LEVEL;
        let style = "border-white/10";
        if (owned)
          style = allowed
            ? "border-green-400/60 bg-green-400/60"
            : "border-red-400/70 bg-red-400/60";
        else if (allowed) style = "border-blue-400/50";
        else if (medal) style = "border-dashed border-amber-400/40";
        return <span key={level} className={`h-3 w-3 rounded-sm border ${style}`} />;
      })}
    </span>
  );
}

function UnitRow({
  view,
  step,
  running,
  blocker,
  onStart,
  onLevel,
}: {
  view: UnitView;
  step: UnitStep | undefined;
  running: boolean;
  blocker: string | null;
  onStart: LabActions["onStart"];
  onLevel: (unitId: string, level: number) => void;
}) {
  const { unit, level, cap, status, lockReason } = view;
  return (
    <tr
      aria-label={unit.name}
      className={`border-t border-white/5 ${lockReason ? "opacity-45" : ""}`}
    >
      <td className="w-32 py-2 pr-3 text-sm text-[#e9e6f5]">{unit.name}</td>
      <td className="w-28 py-2 pr-3">
        <LevelPips view={view} />
      </td>
      <td className="w-40 py-2 pr-3">
        {lockReason ? (
          <span className="text-xs text-white/50 tabular-nums">
            {level === null ? "-" : `${level} / ${cap}`}
          </span>
        ) : (
          <NumberField
            label={`${unit.name} level`}
            value={level ?? 0}
            min={unit.startsUnlocked ? 1 : 0}
            max={cap}
            onCommit={(next) => onLevel(unit.id, next)}
          />
        )}
      </td>
      <td className="w-44 py-2 pr-3">
        <span
          role="status"
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
        >
          {status === "locked" ? lockReason : STATUS_LABELS[status]}
        </span>
      </td>
      <td className="py-2 text-right text-xs text-white/60">
        {running && <span className="text-violet-300">In progress</span>}
        {!running && step && (
          <span className="inline-flex items-center gap-2">
            <span>{step.time ?? "time unknown"}</span>
            <StartButton step={step} blocker={blocker} onStart={onStart} />
          </span>
        )}
      </td>
    </tr>
  );
}

export function LaboratoryTable({
  catalog,
  colony,
  now,
  onStart,
  onLevel,
}: LabProps & {
  onStart: LabActions["onStart"];
  onLevel: (unitId: string, level: number) => void;
}) {
  useTick();
  const views = unitViews(catalog, colony);
  const steps = unitSteps(catalog, colony);
  const jobs = [colony.research, colony.unlock];
  return (
    <div className="mt-6 flex flex-col gap-6">
      {UNIT_CATEGORIES.map((category) => (
        <section key={category}>
          <h3 className={`mb-2 ${HEADING}`}>{category}</h3>
          <table aria-label={category} className="w-full table-fixed">
            <tbody>
              {views
                .filter((view) => view.unit.category === category)
                .map((view) => {
                  const step = steps.find((entry) => entry.unit.id === view.unit.id);
                  return (
                    <UnitRow
                      key={view.unit.id}
                      view={view}
                      step={step}
                      running={jobs.some((job) => job?.unitId === view.unit.id)}
                      blocker={step ? blockerOf(step.kind, colony, now()) : null}
                      onStart={onStart}
                      onLevel={onLevel}
                    />
                  );
                })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
