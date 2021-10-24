import { createResource, For } from 'solid-js';
import { parse } from '@plussub/srt-vtt-parser';
import { getActiveNodes, getFile, getTimeElapsed } from '../utils';
import { Subtitle } from './subtitle';

export const FileDisplay = () => {
  const [nodes] = createResource(
    () => getFile(),
    async (file) => {
      if (!file) return;
      const text = await file.text();
      const parsed = parse(text);
      return parsed.entries;
    }
  );

  return (
    <>
      <div className="h-full flex flex-col justify-center text-center pl-[env(safe-area-inset-left,0)] pr-[env(safe-area-inset-right,0)]">
        <div className="px-2">
          <For each={getActiveNodes(nodes(), getTimeElapsed())}>
            {(node) => <Subtitle node={node} />}
          </For>
        </div>
        {/* <div>{props.file?.name ?? 'unknown name'}</div> */}
        {/* <div>{nodes()?.length ? `${nodes()?.length} lines` : 'no file'}</div> */}
      </div>
    </>
  );
};
