import { DateTime } from 'luxon';
import { Component, onMount } from 'solid-js';
import { Controls } from '../components/controls';
import { FileDisplay } from '../components/file-display';
import { clock, initAndGetDb, setFile, setTimeElapsed } from '../utils';

const PlayPage: Component = (props) => {
  console.log(`props`, props);

  const updateElapsedTime = () => {
    const timeSinceLastAction = clock.isPlaying
      ? Math.abs(DateTime.fromJSDate(clock.lastActionAt).diffNow().toMillis()) *
        clock.playSpeed
      : 0;
    setTimeElapsed(timeSinceLastAction + clock.lastTimeElapsedMs);
    requestAnimationFrame(updateElapsedTime);
  };

  onMount(async () => {
    const fileId = new URL(location.href).searchParams.get('id');
    if (!fileId) {
      console.warn(`No id provided, waiting for file id...`);
      return;
    }
    const db = await initAndGetDb();
    const lines = await db.getAllFromIndex('lines', 'by-file-id', fileId);
    console.log(`loaded ${lines.length} lines`);
    setFile(lines);
  });

  onMount(() => {
    requestAnimationFrame(updateElapsedTime);
  });

  return (
    <>
      <div class="relative h-full overflow-hidden bg-black">
        <div class="absolute left-0 right-0 top-[-100%] bottom-[-100%]">
          <FileDisplay />
        </div>

        <Controls />
      </div>
    </>
  );
};

export { PlayPage as Page };
