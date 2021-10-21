import type { Component } from 'solid-js';
import { createSignal, createEffect, For } from 'solid-js';
import type { Entry } from '@plussub/srt-vtt-parser/dist/src/types';
import { DateTime } from 'luxon';
import { findLast } from 'lodash-es';

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

const App: Component = () => {
  const [getFile, setFile] = createSignal<File>();
  const [getNodes, setNodes] = createSignal<Entry[]>();
  const [getInitial, setInitial] = createSignal<{
    date: Date;
    elapsed: number;
  }>({
    date: new Date(),
    elapsed: 0,
  });
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [getPlaySpeed, setPlaySpeed] = createSignal(1);
  const [getTimeElapsed, setTimeElapsed] = createSignal(0);

  createEffect(async () => {
    const file = getFile();
    if (!file) return;
    const { parse } = await import('@plussub/srt-vtt-parser');
    const text = await file.text();
    const parsed = parse(text);
    setNodes(parsed.entries);
  });

  const updateElapsedTime = () => {
    const speed = isPlaying() ? getPlaySpeed() : 0;
    const initial = getInitial();
    const diff =
      speed === 0
        ? 0
        : initial
        ? Math.abs(DateTime.fromJSDate(initial.date).diffNow().toMillis()) *
          speed
        : 0;
    setTimeElapsed(diff + initial.elapsed);
    requestAnimationFrame(updateElapsedTime);
  };

  if (typeof window !== 'undefined') {
    requestAnimationFrame(updateElapsedTime);
  }

  return (
    <>
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
          {getPlaySpeed()}x
        </div>

        <button
          class="text-2xl"
          onClick={() => {
            setInitial({
              date: new Date(),
              elapsed: getTimeElapsed(),
            });
            setIsPlaying((previous) => !previous);
          }}
        >
          {isPlaying() ? '⏸️' : '▶️'}
        </button>

        <input
          type="text"
          class="form-input"
          value={getPlaySpeed()}
          onChange={(event) => {
            setPlaySpeed(parseFloat((event.target as HTMLInputElement).value));
            setInitial({
              date: new Date(),
              elapsed: getTimeElapsed(),
            });
          }}
        />
      </div>

      {getFile()?.name}

      <For each={getActiveNodes(getNodes(), getTimeElapsed())}>
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
