import type { Entry } from '@plussub/srt-vtt-parser/dist/src/types';
import clsx from 'clsx';
import { getTimeElapsed, nodeIsActive } from '../utils';

export const Subtitle = (props: { node: Entry }) => {
  return (
    <div
      class={clsx(
        'p-2',
        nodeIsActive(props.node, getTimeElapsed()) && 'font-bold'
      )}
    >
      <div
        className="text-[64px] text-center"
        innerText={props.node.text}
      ></div>
      <pre class="text-xs shadow whitespace-pre-wrap">
        {JSON.stringify(props.node, undefined, 2)}
      </pre>
    </div>
  );
};
