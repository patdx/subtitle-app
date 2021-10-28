import { DateTime, Duration } from 'luxon';
import { Component, onMount } from 'solid-js';
import { Controls } from '../components/controls';
import { FileDisplay } from '../components/file-display';
import { clock, getTimeElapsed, initAndGetDb, setTimeElapsed } from '../utils';

const App: Component = () => {
  const updateElapsedTime = () => {
    const timeSinceLastAction = clock.isPlaying
      ? Math.abs(DateTime.fromJSDate(clock.lastActionAt).diffNow().toMillis()) *
        clock.playSpeed
      : 0;
    setTimeElapsed(timeSinceLastAction + clock.lastTimeElapsedMs);
    requestAnimationFrame(updateElapsedTime);
  };

  onMount(() => {
    requestAnimationFrame(updateElapsedTime);
  });

  onMount(() => {
    initAndGetDb();
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
