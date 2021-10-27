import { Entry } from '@plussub/srt-vtt-parser/dist/src/types';
import { findLast } from 'lodash-es';
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import alasql from 'alasql';

export const nodeIsActive = (node: Entry, currentTime: number): boolean => {
  return currentTime > node.from && currentTime < node.to;
};

export const [getTimeElapsed, setTimeElapsed] = createSignal(0);

export const getActiveNodes = (
  nodes: Entry[] = [],
  currentTime: number
): Entry[] => {
  const selectedNodes = new Set<Entry>();

  const activeNodes = alasql(`select * from ? WHERE from < ? and ? < to`, [
    nodes,
    currentTime,
    currentTime,
  ]);

  return activeNodes;

  // const first = nodes?.[0];
  // if (first && currentTime < first.from) {
  //   selectedNodes.add(first);
  // }

  // nodes.forEach((node, index) => {
  //   const isActive = nodeIsActive(node, currentTime);
  //   if (!isActive) return;
  //   const previous = nodes[index - 1];
  //   if (previous) {
  //     selectedNodes.add(previous);
  //   }
  //   selectedNodes.add(node);
  //   const next = nodes[index + 1];
  //   if (next) {
  //     selectedNodes.add(next);
  //   }
  // });

  // if (selectedNodes.size === 0) {
  //   const last = findLast(nodes, (node) => {
  //     node.to < currentTime;
  //   });

  //   if (last) {
  //     selectedNodes.add(last as any);
  //   }
  //   // no active nodes, find the next closest node
  //   const next = nodes.find((node) => {
  //     node.from > currentTime;
  //   });

  //   if (next) {
  //     selectedNodes.add(next);
  //   }
  // }

  // const last = nodes[nodes.length - 1];
  // if (last && currentTime > last.to) {
  //   selectedNodes.add(last);
  // }

  // return [...selectedNodes];
};

export const [clock, setClock] = createStore({
  lastActionAt: new Date(),
  lastTimeElapsedMs: 0,
  playSpeed: 1,
  isPlaying: false,
});

export const [getFile, setFile] = createSignal<File>();
