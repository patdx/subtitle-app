import { parse } from '@plussub/srt-vtt-parser';
import type { Entry } from '@plussub/srt-vtt-parser/dist/src/types';
import { findLast } from 'lodash-es';
import { DateTime } from 'luxon';
import {
  Component,
  createResource,
  createSignal,
  For,
  onMount,
} from 'solid-js';
import { createStore } from 'solid-js/store';

const nodeIsActive = (node: Entry, currentTime: number): boolean => {
  return currentTime > node.from && currentTime < node.to;
};

const getActiveNodes = (nodes: Entry[] = [], currentTime: number) => {
  const selectedNodes = new Set<Entry>();

  const first = nodes?.[0];
  if (first && currentTime < first.from) {
    selectedNodes.add(first);
  }

  nodes.forEach((node, index) => {
    const isActive = nodeIsActive(node, currentTime);
    if (!isActive) return;
    const previous = nodes[index - 1];
    if (previous) {
      selectedNodes.add(previous);
    }
    selectedNodes.add(node);
    const next = nodes[index + 1];
    if (next) {
      selectedNodes.add(next);
    }
  });

  if (selectedNodes.size === 0) {
    const last = findLast(nodes, (node) => {
      node.to < currentTime;
    });

    if (last) {
      selectedNodes.add(last as any);
    }
    // no active nodes, find the next closest node
    const next = nodes.find((node) => {
      node.from > currentTime;
    });

    if (next) {
      selectedNodes.add(next);
    }
  }

  const last = nodes[nodes.length - 1];
  if (last && currentTime > last.to) {
    selectedNodes.add(last);
  }

  return [...selectedNodes];
};

const [clock, setClock] = createStore({
  lastActionAt: new Date(),
  lastTimeElapsedMs: 0,
  playSpeed: 1,
  isPlaying: false,
});
const [getTimeElapsed, setTimeElapsed] = createSignal(0);

const App: Component = () => {
  const [getFile, setFile] = createSignal<File>();

  const updateElapsedTime = () => {
    const timeSinceLastAction = clock.isPlaying
      ? Math.abs(DateTime.fromJSDate(clock.lastActionAt).diffNow().toMillis()) *
        clock.playSpeed
      : 0;
    setTimeElapsed(timeSinceLastAction + clock.lastTimeElapsedMs);
    requestAnimationFrame(updateElapsedTime);
  };

  onMount(() => {
    requestAnimationFrame(updateElapsedTime);
  });

  return (
    <>
      <pre className="whitespace-pre-wrap">
        {JSON.stringify({ ...clock }, undefined, 2)}
      </pre>

      <form>
        <input
          class="block w-full"
          type="file"
          onChange={(event) =>
            setFile((event.target as HTMLInputElement).files?.[0])
          }
        />
      </form>

      <div class="flex gap-2 items-center">
        <div class="inline-flex flex-col items-end">
          <label htmlFor="">Time elapsed</label>
          <div class="tabular-nums">{getTimeElapsed()}</div>
        </div>

        <div class="inline-flex flex-col items-center">
          <div>Speed</div>
          {clock.playSpeed}x
        </div>

        <button
          class="text-2xl"
          onClick={() => {
            setClock((previous) => ({
              lastActionAt: new Date(),
              // todo: recalculate at time of action
              // instead of using Signal
              lastTimeElapsedMs: getTimeElapsed(),
              isPlaying: !previous.isPlaying,
            }));
          }}
        >
          {clock.isPlaying ? '⏸️' : '▶️'}
        </button>

        <input
          type="text"
          class="form-input"
          value={clock.playSpeed}
          onInput={(event) => {
            const newPlaySpeed = parseFloat(
              (event.target as HTMLInputElement).value
            );
            if (Number.isFinite(newPlaySpeed)) {
              setClock({
                playSpeed: parseFloat((event.target as HTMLInputElement).value),
                lastActionAt: new Date(),
                lastTimeElapsedMs: getTimeElapsed(),
              });
            }
          }}
        />
      </div>

      <FileDisplay file={getFile()} />
    </>
  );
};

const FileDisplay = (props: { file?: File }) => {
  const [nodes] = createResource(
    () => props.file,
    async (file) => {
      if (!file) return;
      const text = await file.text();
      const parsed = parse(text);
      return parsed.entries;
    }
  );

  return (
    <>
      <div>{props.file?.name ?? 'unknown name'}</div>
      <div>{nodes()?.length ? `${nodes()?.length} lines` : 'no file'}</div>

      <For each={getActiveNodes(nodes(), getTimeElapsed())}>
        {(node) => {
          return (
            <div
              class={`p-2${
                nodeIsActive(node, getTimeElapsed()) ? ' font-bold' : ''
              }`}
            >
              <pre class="shadow whitespace-pre-wrap">
                {JSON.stringify(node, undefined, 2)}
              </pre>
            </div>
          );
        }}
      </For>
    </>
  );
};

export default App;
