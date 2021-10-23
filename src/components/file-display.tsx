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
      <div className="h-full flex flex-col justify-center text-center">
        {/* <div>{props.file?.name ?? 'unknown name'}</div> */}
        {/* <div>{nodes()?.length ? `${nodes()?.length} lines` : 'no file'}</div> */}
        <For each={getActiveNodes(nodes(), getTimeElapsed())}>
          {(node) => <Subtitle node={node} />}
        </For>
      </div>
    </>
  );
};
