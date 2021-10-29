import { DateTime, Duration } from 'luxon';
import { Component, onMount } from 'solid-js';
import { Controls } from '../components/controls';
import { FileDisplay } from '../components/file-display';
import {
  clock,
  getTimeElapsed,
  initAndGetDb,
  setFile,
  setTimeElapsed,
} from '../utils';

const App: Component = (props) => {
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
    const fileId = location.pathname.split('/').pop();
    const db = await initAndGetDb();
    const lines = await db.getAllFromIndex('lines', 'by-file-id', fileId);
    console.log(`loaded ${lines.length} lines`);
    setFile(lines);
  });

  onMount(() => {
    requestAnimationFrame(updateElapsedTime);
  });

  const formattedTime = () =>
    Duration.fromMillis(getTimeElapsed()).toISOTime({
      suppressMilliseconds: true,
    });

  return (
    <>
      <div className="h-screen bg-black relative overflow-hidden">
        <div className="absolute left-0 right-0 top-[-100%] bottom-[-100%]">
          <FileDisplay />
        </div>

        <Controls timeElapsed={formattedTime()} />
      </div>
    </>
  );
};

export default App;
