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
      <div className="h-screen bg-white relative overflow-hidden">
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
          class="p-2 bg-gray-200 rounded cursor-pointer"
        >
          Upload file
        </label>
        <ul>
          <For each={data()}>
            {(file) => (
              <li>
                <a href={`/files/${file.id}`}>{file.name}</a>{' '}
                <button
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
              </li>
            )}
          </For>
        </ul>

        {/* <Controls timeElapsed={formattedTime()} /> */}
      </div>
    </>
  );
};

export default EditFilesPage;
