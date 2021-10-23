import type { Entry } from '@plussub/srt-vtt-parser/dist/src/types';
import clsx from 'clsx';
import { getTimeElapsed, nodeIsActive } from '../utils';

export const Subtitle = (props: { node: Entry }) => {
  return (
    <div
      class={clsx(
        `text-[64px] text-white`,
        nodeIsActive(props.node, getTimeElapsed()) && 'font-bold'
      )}
      innerHTML={props.node.text}
    />
  );
};
