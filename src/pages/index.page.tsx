import {
  createResource,
  createSignal,
  createUniqueId,
  For,
  Show,
} from 'solid-js';
import parseVideo from 'video-name-parser';
import { BadgeBlue, BadgeRed } from '../components/badge';
import { addFileToDatabase, initAndGetDb } from '../utils';

const LoadingIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5 animate-spin"
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path
      fill-rule="evenodd"
      d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
      clip-rule="evenodd"
    />
  </svg>
);

const EditFilesPage = () => {
  const id = createUniqueId();
  const [mode, setMode] = createSignal<undefined | 'upload'>();
  const [isProcessing, setProcessing] = createSignal(false);

  const [data, handler] = createResource(async () => {
    const db = await initAndGetDb();
    const files = await db.getAll('files');
    return files;
  });

  return (
    <>
      <div className="relative min-h-full overflow-hidden bg-white">
        {/* padding */}
        <div className="h-[env(safe-area-inset-top,0)]"></div>
        <input
          id={`${id}-file-upload`}
          class="hidden"
          type="file"
          accept=".zip,.srt,application/zip"
          onChange={async (event) => {
            try {
              setProcessing(true);
              const target = event.target as HTMLInputElement;
              const file = target.files?.[0];
              target.value = '';
              if (!file) return;

              console.log(file.name, file.type);

              if (/.zip$/i.test(file.name) || file.type === 'application/zip') {
                const zip = await import('@zip.js/zip.js');
                const reader = new zip.ZipReader(new zip.BlobReader(file));
                const entries = await reader.getEntries();
                console.log(entries);
                for (const entry of entries) {
                  if (/.srt$/i.test(entry.filename) && entry.getData) {
                    try {
                      const text = await entry.getData(new zip.TextWriter());
                      await addFileToDatabase(text, entry.filename);
                    } catch (err) {
                      console.log(
                        `The following error occurred while processing ${entry.filename}`
                      );
                      console.error(err);
                    }
                  }
                }
              } else {
                await addFileToDatabase(await file.text(), file.name);
              }
              handler.refetch();
            } finally {
              setProcessing(false);
            }
          }}
        />

        <label
          tabIndex={0}
          htmlFor={`${id}-file-upload`}
          class="mx-auto my-20 flex max-w-md cursor-pointer items-center justify-between gap-2 rounded-lg bg-blue-300 py-4 px-8 text-3xl font-semibold text-gray-800 shadow-lg hover:bg-blue-400 active:bg-blue-500 watch:my-0 watch:p-2 watch:text-sm"
        >
          Add SRT or ZIP...
          <Show when={isProcessing()}>
            <LoadingIcon />
          </Show>
        </label>

        <For each={data()}>
          {(file) => {
            const metadata = parseVideo(file.name);

            return (
              <div class="group mx-auto my-4 max-w-md rounded bg-white py-4 px-4 shadow-lg hover:bg-gray-100 active:bg-gray-200 watch:m-0 watch:p-2">
                <a
                  href={`/play?id=${file.id}`}
                  class="flex flex-col gap-2 outline-offset-8"
                >
                  <div className="break-all text-xl font-semibold text-gray-800 watch:text-sm">
                    {file.name}
                  </div>

                  {/* badges */}
                  {metadata.season || metadata.episode?.length ? (
                    <div className="flex gap-2">
                      {metadata.season ? (
                        <BadgeRed>Season {metadata.season}</BadgeRed>
                      ) : null}
                      {metadata.episode?.map((item) => (
                        <BadgeBlue>Episode {item}</BadgeBlue>
                      ))}
                    </div>
                  ) : null}
                </a>

                <div class="mt-4 flex justify-end">
                  <button
                    class=" font-medium text-red-500 outline-offset-4 hover:text-red-600 active:text-red-700 watch:text-sm"
                    onClick={async () => {
                      const db = await initAndGetDb();
                      const tx = db.transaction(
                        ['files', 'lines'],
                        'readwrite'
                      );
                      tx.objectStore('files').delete(file.id);

                      let cursor = await tx
                        .objectStore('lines')
                        .index('by-file-id')
                        .openKeyCursor(file.id);

                      while (cursor) {
                        await tx.objectStore('lines').delete(cursor.primaryKey);
                        cursor = await cursor.continue();
                      }

                      tx.commit();

                      handler.refetch();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          }}
        </For>

        {/* <Controls timeElapsed={formattedTime()} /> */}
      </div>
    </>
  );
};

export default EditFilesPage;
