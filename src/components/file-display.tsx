import { createResource, For } from 'solid-js';
import { parse } from '@plussub/srt-vtt-parser';
import { getActiveNodes, getTimeElapsed } from '../utils';
import { Subtitle } from './subtitle';

export const FileDisplay = (props: { file?: File }) => {
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
      {/* <div>{nodes()?.length ? `${nodes()?.length} lines` : 'no file'}</div> */}
      <For each={getActiveNodes(nodes(), getTimeElapsed())}>
        {(node) => <Subtitle node={node} />}
      </For>
    </>
  );
};
