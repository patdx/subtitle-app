import { For } from 'solid-js';
import { getActiveNodes, getFile, getTimeElapsed } from '../utils';
import { Subtitle } from './subtitle';

export const FileDisplay = () => {
  return (
    <>
      <div className="h-full flex flex-col justify-center text-center pl-[env(safe-area-inset-left,0)] pr-[env(safe-area-inset-right,0)]">
        <div className="px-2">
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
