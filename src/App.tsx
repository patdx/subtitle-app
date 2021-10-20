import type { Component } from 'solid-js';
import { createSignal, createEffect, For } from 'solid-js';
import type { Node } from 'subtitle';

const App: Component = () => {
  const [getFile, setFile] = createSignal<File>();
  const [getNodes, setNodes] = createSignal<Node[]>();

  createEffect(async () => {
    const file = getFile();
    if (!file) return;
    const { parseSync } = await import('subtitle');
    const text = await file.text();
    const parsed = parseSync(text);
    setNodes(parsed);
  });

  return (
    <>
      <form>
        <input
          class="block w-full"
          type="file"
          onChange={(event) =>
            setFile((event.target as HTMLInputElement).files?.[0])
          }
        />
      </form>

      {getFile()?.name}

      <For each={getNodes()}>
        {(node) => {
          return (
            <div class="p-2">
              <pre class="shadow whitespace-pre-wrap">
                {JSON.stringify(node, undefined, 2)}
              </pre>
            </div>
          );
        }}
      </For>
    </>
  );
};

export default App;
