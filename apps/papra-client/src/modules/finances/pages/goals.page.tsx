import type { Component } from 'solid-js';
import type { FinanceGoalBucket, FinanceGoalVersion } from '../finances-goals.types';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import {
  createFinanceGoalBucket,
  deleteFinanceGoalBucket,
  fetchFinanceGoal,
  fetchGoalActuals,
  listGoalVersions,
  restoreGoalVersion,
  updateFinanceGoalBucket,
} from '../finances-goals.services';

// ── Donut Chart ──────────────────────────────────────────────────────────────

const DonutChart: Component<{
  segments: Array<{ percentage: number; color: string; label: string }>;
  size?: number;
}> = (props) => {
  const size = () => props.size ?? 200;
  const strokeWidth = () => size() * 0.15;
  const radius = () => (size() - strokeWidth()) / 2;
  const circumference = () => 2 * Math.PI * radius();
  const cx = () => size() / 2;

  const totalGiven = () => props.segments.reduce((s, seg) => s + seg.percentage, 0);

  const arcs = () => {
    let offset = 0;
    return props.segments.map((seg) => {
      const pct = totalGiven() > 0 ? seg.percentage / totalGiven() : 0;
      const dashArray = circumference() * pct;
      const dashOffset = -circumference() * offset;
      offset += pct;
      return { ...seg, dashArray, dashOffset };
    });
  };

  return (
    <svg width={size()} height={size()} viewBox={`0 0 ${size()} ${size()}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={cx()}
        cy={cx()}
        r={radius()}
        fill="none"
        stroke="hsl(var(--muted))"
        stroke-width={strokeWidth()}
      />
      <For each={arcs()}>
        {arc => (
          <circle
            cx={cx()}
            cy={cx()}
            r={radius()}
            fill="none"
            stroke={arc.color}
            stroke-width={strokeWidth()}
            stroke-dasharray={`${arc.dashArray} ${circumference()}`}
            stroke-dashoffset={arc.dashOffset}
            stroke-linecap="round"
          />
        )}
      </For>
    </svg>
  );
};

// ── Month Picker ─────────────────────────────────────────────────────────────

function getMonthRange(year: number, month: number) {
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

const MonthPicker: Component<{
  value: { year: number; month: number };
  onChange: (v: { year: number; month: number }) => void;
}> = (props) => {
  const label = () =>
    new Date(props.value.year, props.value.month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const prev = () => {
    const d = new Date(props.value.year, props.value.month - 1, 1);
    props.onChange({ year: d.getFullYear(), month: d.getMonth() });
  };

  const next = () => {
    const d = new Date(props.value.year, props.value.month + 1, 1);
    props.onChange({ year: d.getFullYear(), month: d.getMonth() });
  };

  return (
    <div class="flex items-center gap-2">
      <button type="button" class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" onClick={prev}>
        <div class="i-tabler-chevron-left size-4" />
      </button>
      <span class="text-sm font-medium w-36 text-center">{label()}</span>
      <button type="button" class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" onClick={next}>
        <div class="i-tabler-chevron-right size-4" />
      </button>
    </div>
  );
};

// ── Bucket Card ──────────────────────────────────────────────────────────────

const PRESET_COLORS = ['#4ade80', '#f97316', '#60a5fa', '#a78bfa', '#fb7185', '#facc15', '#2dd4bf', '#f472b6'];
const ALL_CLASSIFICATIONS = ['expense', 'income', 'owner_transfer', 'internal_transfer'];

type BucketCardProps = {
  bucket: FinanceGoalBucket & { actualAmount?: number; actualPercentage?: number };
  goalId: string;
  organizationId: string;
  currency: string;
  onDeleted: () => void;
  onSaved: () => void;
};

const BucketCard: Component<BucketCardProps> = (props) => {
  const [editing, setEditing] = createSignal(false);
  const [name, setName] = createSignal(props.bucket.name);
  const [targetPct, setTargetPct] = createSignal(props.bucket.targetPercentage);
  const [color, setColor] = createSignal(props.bucket.color);
  const [classifications, setClassifications] = createSignal<string[]>(props.bucket.classifications);

  const saveMut = createMutation(() => ({
    mutationFn: () => updateFinanceGoalBucket({
      organizationId: props.organizationId,
      goalId: props.goalId,
      bucketId: props.bucket.id,
      name: name(),
      targetPercentage: targetPct(),
      color: color(),
      classifications: classifications(),
    }),
    onSuccess: () => {
      setEditing(false);
      props.onSaved();
      createToast({ message: 'Bucket updated', type: 'success' });
    },
    onError: (err: any) => {
      createToast({ message: err?.message ?? 'Failed to update bucket', type: 'error' });
    },
  }));

  const deleteMut = createMutation(() => ({
    mutationFn: () => deleteFinanceGoalBucket({
      organizationId: props.organizationId,
      goalId: props.goalId,
      bucketId: props.bucket.id,
    }),
    onSuccess: () => {
      props.onDeleted();
      createToast({ message: 'Bucket deleted', type: 'success' });
    },
  }));

  const toggleClassification = (cls: string) => {
    setClassifications(prev =>
      prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls],
    );
  };

  const actualPct = () => props.bucket.actualPercentage ?? 0;
  const targetPctVal = () => props.bucket.targetPercentage;

  return (
    <div class="border rounded-lg p-4 flex flex-col gap-3">
      {/* Header row */}
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="size-3 rounded-full shrink-0" style={{ background: props.bucket.color }} />
          <span class="font-medium truncate">{props.bucket.name}</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setEditing(e => !e)}
          >
            <div class={cn(editing() ? 'i-tabler-x' : 'i-tabler-pencil', 'size-4')} />
          </button>
          <button
            type="button"
            class="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors"
            onClick={() => deleteMut.mutate()}
            disabled={deleteMut.isPending}
          >
            <div class="i-tabler-trash size-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div class="space-y-1">
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>
            Actual:
            {' '}
            <span class={cn('font-medium', actualPct() > targetPctVal() ? 'text-orange-500' : 'text-foreground')}>
              {actualPct().toFixed(1)}
              %
            </span>
            {' '}
            / Target:
            {' '}
            <span class="font-medium text-foreground">
              {targetPctVal()}
              %
            </span>
          </span>
          <Show when={props.bucket.actualAmount !== undefined}>
            <span class="font-medium">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: props.currency }).format(props.bucket.actualAmount!)}
            </span>
          </Show>
        </div>
        <div class="h-2 bg-muted rounded-full overflow-hidden relative">
          {/* Target band */}
          <div
            class="absolute inset-y-0 left-0 opacity-30 rounded-full"
            style={{ width: `${targetPctVal()}%`, background: props.bucket.color }}
          />
          {/* Actual fill */}
          <Show when={actualPct() > 0}>
            <div
              class="absolute inset-y-0 left-0 rounded-full transition-all"
              style={{ width: `${Math.min(actualPct(), 100)}%`, background: props.bucket.color }}
            />
          </Show>
        </div>
      </div>

      {/* Edit form */}
      <Show when={editing()}>
        <div class="border-t pt-3 space-y-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-muted-foreground">Name</label>
            <input
              class="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary w-full"
              value={name()}
              onInput={e => setName(e.currentTarget.value)}
            />
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-muted-foreground">Target %</label>
            <input
              type="number"
              min="0"
              max="100"
              class="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary w-24"
              value={targetPct()}
              onInput={e => setTargetPct(Number(e.currentTarget.value))}
            />
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-muted-foreground">Color</label>
            <div class="flex flex-wrap gap-1.5">
              <For each={PRESET_COLORS}>
                {c => (
                  <button
                    type="button"
                    class={cn('size-6 rounded-full border-2 transition-transform hover:scale-110', color() === c ? 'border-foreground scale-110' : 'border-transparent')}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                )}
              </For>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-muted-foreground">Transaction Classifications</label>
            <div class="flex flex-wrap gap-1.5">
              <For each={ALL_CLASSIFICATIONS}>
                {cls => (
                  <button
                    type="button"
                    class={cn(
                      'px-2 py-0.5 rounded-full text-xs border transition-colors',
                      classifications().includes(cls)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary',
                    )}
                    onClick={() => toggleClassification(cls)}
                  >
                    {cls.replace('_', ' ')}
                  </button>
                )}
              </For>
            </div>
            <p class="text-xs text-muted-foreground">Transactions matching these classifications will be counted in this bucket.</p>
          </div>

          <div class="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
};

// ── Add Bucket Form ───────────────────────────────────────────────────────────

const AddBucketForm: Component<{
  goalId: string;
  organizationId: string;
  nextPosition: number;
  onCreated: () => void;
  onCancel: () => void;
}> = (props) => {
  const [name, setName] = createSignal('');
  const [targetPct, setTargetPct] = createSignal(10);
  const [color, setColor] = createSignal(PRESET_COLORS[3]!);
  const [classifications, setClassifications] = createSignal<string[]>([]);

  const toggleClassification = (cls: string) => {
    setClassifications(prev =>
      prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls],
    );
  };

  const createMut = createMutation(() => ({
    mutationFn: () => createFinanceGoalBucket({
      organizationId: props.organizationId,
      goalId: props.goalId,
      name: name(),
      targetPercentage: targetPct(),
      color: color(),
      position: props.nextPosition,
      tagIds: [],
      classifications: classifications(),
    }),
    onSuccess: () => {
      props.onCreated();
      createToast({ message: 'Bucket created', type: 'success' });
    },
    onError: (err: any) => {
      createToast({ message: err?.message ?? 'Failed to create bucket', type: 'error' });
    },
  }));

  return (
    <div class="border rounded-lg p-4 space-y-3 border-dashed">
      <p class="text-sm font-medium">New bucket</p>

      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-muted-foreground">Name</label>
        <input
          class="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary w-full"
          placeholder="e.g. Entertainment"
          value={name()}
          onInput={e => setName(e.currentTarget.value)}
        />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-muted-foreground">Target %</label>
        <input
          type="number"
          min="0"
          max="100"
          class="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary w-24"
          value={targetPct()}
          onInput={e => setTargetPct(Number(e.currentTarget.value))}
        />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-muted-foreground">Color</label>
        <div class="flex flex-wrap gap-1.5">
          <For each={PRESET_COLORS}>
            {c => (
              <button
                type="button"
                class={cn('size-6 rounded-full border-2 transition-transform hover:scale-110', color() === c ? 'border-foreground scale-110' : 'border-transparent')}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            )}
          </For>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-muted-foreground">Transaction Classifications</label>
        <div class="flex flex-wrap gap-1.5">
          <For each={ALL_CLASSIFICATIONS}>
            {cls => (
              <button
                type="button"
                class={cn(
                  'px-2 py-0.5 rounded-full text-xs border transition-colors',
                  classifications().includes(cls)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary',
                )}
                onClick={() => toggleClassification(cls)}
              >
                {cls.replace('_', ' ')}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={props.onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending || !name().trim()}>
          {createMut.isPending ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Version History ──────────────────────────────────────────────────────────

const VersionHistory: Component<{
  versions: FinanceGoalVersion[];
  onRestore: (versionId: string) => void;
  restoring: boolean;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const latest = () => props.versions[0];

  return (
    <div class="border rounded-lg overflow-hidden text-sm">
      <button
        type="button"
        class="w-full flex items-center justify-between px-4 py-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <span class="flex items-center gap-2">
          <div class="i-tabler-history size-4" />
          Version history
          <span class="text-xs bg-muted px-1.5 py-0.5 rounded-full">{props.versions.length}</span>
        </span>
        <div class={cn('i-tabler-chevron-down size-4 transition-transform', expanded() && 'rotate-180')} />
      </button>
      <Show when={expanded()}>
        <div class="divide-y border-t max-h-64 overflow-y-auto">
          <For each={props.versions}>
            {(version, i) => (
              <div class="flex items-center justify-between px-4 py-2.5 gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-foreground truncate">{version.name}</span>
                    <Show when={i() === 0}>
                      <span class="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">Current</span>
                    </Show>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    v{version.versionNumber}
                    {' · '}
                    {new Date(version.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    {' · '}
                    {version.buckets.length}
                    {' '}
                    bucket{version.buckets.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <Show when={i() !== 0}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={props.restoring}
                    onClick={() => props.onRestore(version.id)}
                  >
                    Restore
                  </Button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export const FinanceGoalsPage: Component = () => {
  const params = useParams();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = createSignal({ year: now.getFullYear(), month: now.getMonth() });
  const [addingBucket, setAddingBucket] = createSignal(false);

  const goalQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finance-goals'],
    queryFn: () => fetchFinanceGoal({ organizationId: params.organizationId }),
  }));

  const actualsQuery = useQuery(() => {
    const { from, to } = getMonthRange(selectedMonth().year, selectedMonth().month);
    const goalId = goalQuery.data?.goal?.id;
    return {
      queryKey: ['organizations', params.organizationId, 'finance-goals', goalId, 'actuals', selectedMonth()],
      queryFn: () => (goalId
        ? fetchGoalActuals({ organizationId: params.organizationId, goalId, from, to })
        : Promise.resolve(null)),
      enabled: !!goalId,
    };
  });

  const invalidateGoal = () => {
    queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance-goals'] });
  };

  const invalidateActuals = () => {
    queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance-goals', goalQuery.data?.goal?.id, 'actuals'] });
  };

  const onBucketChange = () => {
    invalidateGoal();
    invalidateActuals();
  };

  const buckets = () => goalQuery.data?.buckets ?? [];
  const goal = () => goalQuery.data?.goal;

  const versionsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finance-goals', goal()?.id, 'versions'],
    queryFn: () => listGoalVersions({ organizationId: params.organizationId, goalId: goal()!.id }),
    enabled: !!goal()?.id,
  }));

  const restoreVersionMutation = createMutation(() => ({
    mutationFn: (versionId: string) => restoreGoalVersion({
      organizationId: params.organizationId,
      goalId: goal()!.id,
      versionId,
    }),
    onSuccess: ({ restoredFrom }) => {
      createToast({ message: `Restored to version ${restoredFrom}`, type: 'success' });
      invalidateGoal();
      invalidateActuals();
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance-goals', goal()?.id, 'versions'] });
    },
    onError: () => createToast({ message: 'Failed to restore version', type: 'error' }),
  }));

  const totalTarget = () => buckets().reduce((s, b) => s + b.targetPercentage, 0);
  const isOver100 = () => totalTarget() > 100;
  const isUnder100 = () => totalTarget() > 0 && totalTarget() < 100;

  const bucketsWithActuals = () => {
    const actuals = actualsQuery.data;
    return buckets().map(b => ({
      ...b,
      actualAmount: actuals?.buckets.find(ab => ab.id === b.id)?.actualAmount,
      actualPercentage: actuals?.buckets.find(ab => ab.id === b.id)?.actualPercentage ?? 0,
    }));
  };

  const donutSegments = () =>
    bucketsWithActuals().map(b => ({
      percentage: b.actualPercentage,
      color: b.color,
      label: b.name,
    }));

  return (
    <div class="p-6 max-w-screen-lg mx-auto mt-4">
      {/* Header */}
      <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 class="text-xl font-bold">
            {goal()?.name ?? 'Budget Goals'}
          </h1>
          <p class="text-sm text-muted-foreground mt-0.5">Track where your money goes each month.</p>
        </div>
        <MonthPicker value={selectedMonth()} onChange={setSelectedMonth} />
      </div>

      {/* Warnings */}
      <Show when={isOver100()}>
        <div class="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm flex items-center gap-2">
          <div class="i-tabler-alert-triangle size-4 shrink-0" />
          Total target is
          {' '}
          {totalTarget()}
          % — must be 100% or less.
        </div>
      </Show>
      <Show when={isUnder100()}>
        <div class="mb-4 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-sm flex items-center gap-2">
          <div class="i-tabler-info-circle size-4 shrink-0" />
          Total target is
          {' '}
          {totalTarget()}
          % — you have
          {' '}
          {100 - totalTarget()}
          % unallocated.
        </div>
      </Show>

      <Show when={goalQuery.isPending}>
        <div class="flex items-center justify-center py-20 text-muted-foreground text-sm gap-2">
          <div class="i-tabler-loader-2 size-4 animate-spin" />
          Loading...
        </div>
      </Show>

      <Show when={goalQuery.data}>
        <div class="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 items-start">
          {/* Donut chart */}
          <div class="flex flex-col items-center gap-4">
            <Switch>
              <Match when={actualsQuery.isPending}>
                <div class="size-[200px] flex items-center justify-center text-muted-foreground">
                  <div class="i-tabler-loader-2 size-6 animate-spin" />
                </div>
              </Match>
              <Match when={!actualsQuery.isPending}>
                <DonutChart segments={donutSegments()} size={200} />
              </Match>
            </Switch>
            <Show when={actualsQuery.data}>
              {actuals => (
                <div class="text-center">
                  <p class="text-2xl font-bold">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: actuals().currency }).format(actuals().totalAmount)}
                  </p>
                  <p class="text-xs text-muted-foreground">Total expenses this month</p>
                  <Show when={actuals().unassignedAmount > 0}>
                    <p class="text-xs text-muted-foreground mt-1">
                      +
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: actuals().currency }).format(actuals().unassignedAmount)}
                      {' '}
                      unassigned
                    </p>
                  </Show>
                </div>
              )}
            </Show>
          </div>

          {/* Bucket list */}
          <div class="flex flex-col gap-3">
            <For each={bucketsWithActuals()}>
              {bucket => (
                <BucketCard
                  bucket={bucket}
                  goalId={goal()!.id}
                  organizationId={params.organizationId}
                  currency={actualsQuery.data?.currency ?? 'USD'}
                  onDeleted={onBucketChange}
                  onSaved={onBucketChange}
                />
              )}
            </For>

            <Show when={addingBucket()}>
              <AddBucketForm
                goalId={goal()!.id}
                organizationId={params.organizationId}
                nextPosition={buckets().length}
                onCreated={() => {
                  setAddingBucket(false);
                  onBucketChange();
                }}
                onCancel={() => setAddingBucket(false)}
              />
            </Show>

            <Show when={!addingBucket()}>
              <button
                type="button"
                class="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                onClick={() => setAddingBucket(true)}
              >
                <div class="i-tabler-plus size-4" />
                Add bucket
              </button>
            </Show>

            {/* Version history */}
            <Show when={versionsQuery.data?.versions && versionsQuery.data.versions.length > 0}>
              {versions => <VersionHistory versions={versions()} onRestore={v => restoreVersionMutation.mutate(v)} restoring={restoreVersionMutation.isPending} />}
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};
