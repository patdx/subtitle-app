import { createResource, createSignal, createUniqueId, For } from 'solid-js';
import { addFileToDatabase, initAndGetDb } from '../utils';

const EditFilesPage = () => {
  const id = createUniqueId();
  const [mode, setMode] = createSignal<undefined | 'upload'>();

  const [data, handler] = createResource(async () => {
    const db = await initAndGetDb();
    const files = await db.getAll('files');
    return files;
  });

  return (
    <>
      <div className="min-h-full bg-white relative overflow-hidden">
        {/* padding */}
        <div className="h-[env(safe-area-inset-top,0)]"></div>
        <input
          id={`${id}-file-upload`}
          class="hidden"
          type="file"
          onChange={async (event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files?.[0];
            target.value = '';
            if (!file) return;
            await addFileToDatabase(file);
            handler.refetch();
          }}
        />

        <label
          htmlFor={`${id}-file-upload`}
          class="block max-w-md mx-auto py-4 px-8 bg-blue-300 shadow-lg rounded-lg my-20 text-gray-800 text-3xl font-semibold cursor-pointer"
        >
          Upload SRT file...
        </label>

        <For each={data()}>
          {(file) => (
            <div class="max-w-md mx-auto py-4 px-8 bg-white shadow-lg rounded-lg my-20">
              <a
                href={`/play?id=${file.id}`}
                class="text-gray-800 text-3xl font-semibold break-all"
              >
                Hometown.Cha.Cha.Cha.E13.211009.HDTV.H264-NEXT-NF.srt
              </a>

              <div class="flex justify-end mt-4">
                <button
                  class="text-xl font-medium text-indigo-500"
                  onClick={async () => {
                    const db = await initAndGetDb();
                    const tx = db.transaction(['files', 'lines'], 'readwrite');
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
          )}
        </For>

        {/* <Controls timeElapsed={formattedTime()} /> */}
      </div>
    </>
  );
};

export default EditFilesPage;
