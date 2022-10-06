import { For } from 'solid-js';
import { getActiveNodes, getFile, getTimeElapsed } from '../utils';
import { Subtitle } from './subtitle';

export const FileDisplay = () => {
  return (
    <>
      <div class="flex h-full flex-col justify-center pl-[env(safe-area-inset-left,0)] pr-[env(safe-area-inset-right,0)] text-center">
        <div class="px-2">
          <For each={getActiveNodes(getFile(), getTimeElapsed())}>
            {(node) => <Subtitle node={node} />}
          </For>
        </div>
        {/* <div>{props.file?.name ?? 'unknown name'}</div> */}
        {/* <div>{nodes()?.length ? `${nodes()?.length} lines` : 'no file'}</div> */}
      </div>
    </>
  );
};
