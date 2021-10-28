import { parse } from '@plussub/srt-vtt-parser';
import cuid from 'cuid';
import { createResource, For } from 'solid-js';
import {
  getActiveNodes,
  getFile,
  getTimeElapsed,
  initAndGetDb,
} from '../utils';
import { Subtitle } from './subtitle';

export const FileDisplay = () => {
  const [nodes] = createResource(
    () => getFile(),
    async (file) => {
      if (!file) return;
      const text = await file.text();
      const { entries } = parse(text);

      const db = await initAndGetDb();

      const fileId = cuid();

      console.log('adding file to db');
      await db.add('files', {
        id: fileId,
        name: file.name,
      });
      console.log('adding lines to db');
      await Promise.all(
        entries.map((entry) =>
          db.add('lines', {
            fileId,
            ...entry,
          })
        )
      );
      console.log('done adding lines to db');

      console.log(`entries:`, entries);

      return entries;
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
